import { useState, useEffect, useCallback, useRef } from 'react';
import PasswordReset from './components/PasswordReset';
import type { Project, Task, Consultant, Customer, Communication } from './types';
import { calculateTaskSchedules } from './utils/scheduler';
import { defaultTasks } from './defaultTasks';
import Dashboard from './components/Dashboard';
import ProjectDetails from './components/ProjectDetails';
import ProjectsList from './components/ProjectsList';
import Settings from './components/Settings';
import Login from './components/Login';
import Logo from './components/Logo';
import CroppedLogo from './components/CroppedLogo';
import NewProjectModal from './components/NewProjectModal';
import { WinComboBox } from './components/winui/WinComboBox';
import {
  FolderKanban, LayoutDashboard, Settings as SettingsIcon, 
  Sun, Moon, X, LogOut, Menu, ChevronLeft, ChevronRight,
  ArrowLeft
} from 'lucide-react';
import { api } from './utils/api';
import { isSupabaseConfigured, getSupabaseClient, inviteUser } from './utils/supabase';
import {
  activeUserFromConsultant, activeUserFromCustomer, canSeeProject
} from './utils/permissions';

// Toast structure
interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

// Initial Mock Seed Data. Only used to seed a LOCAL (localStorage) dev/demo
// environment when no backend is configured. In production (and any dev build
// with VITE_SUPABASE_* env vars), users are created exclusively through
// Supabase Auth; the app never seeds default credentials into a real DB.
const defaultConsultants: Consultant[] = [
  { id: 'admin', name: 'System Administrator', email: 'admin@pinnacle.local', role: 'Manager', avatarColor: '#2d4a65', tier: 'superuser' },
  { id: 'c1', name: 'Sarah Jenkins', email: 'sarah.jenkins@pinnacle.com', role: 'Consultant', avatarColor: '#0d9488', tier: 'normal' },
  { id: 'c2', name: 'Alex Rivera', email: 'alex.rivera@pinnacle.com', role: 'Consultant', avatarColor: '#6366f1', tier: 'normal' },
  { id: 'c3', name: 'Marcus Brody', email: 'marcus.brody@pinnacle.com', role: 'Project Manager', avatarColor: '#f59e0b', tier: 'normal' },
  { id: 'c4', name: 'David Vance', email: 'david.vance@pinnacle.com', role: 'Read only', avatarColor: '#ef4444', tier: 'normal' }
];

const defaultProjects: Project[] = [
  {
    id: 'p1',
    name: 'Sage Intacct Financials Implementation',
    clientName: 'Horizon Logistics Corp',
    description: 'Core financial ledger setups, Accounts Payable, Accounts Receivable, Cash Management, and custom dimensional configurations.',
    budgetDays: 25,
    startDate: new Date().toISOString().split('T')[0],
    targetGoLiveDate: (() => {
      const d = new Date();
      d.setDate(d.getDate() + 90);
      return d.toISOString().split('T')[0];
    })(),
    consultantIds: ['c1', 'c2'],
    createdAt: new Date().toISOString(),
    status: 'new'
  },
  {
    id: 'tmpl_sage_intacct',
    name: 'Sage Intacct Implementation',
    clientName: 'Template Reference',
    description: 'Generate a standardized, multi-stage project management structure for enterprise accounting software deployment.',
    budgetDays: 45,
    startDate: new Date().toISOString().split('T')[0],
    targetGoLiveDate: '2024-12-01',
    consultantIds: ['cons_1', 'cons_2'],
    createdAt: new Date().toISOString(),
    status: 'new',
    isTemplate: true
  }
];

// defaultTasks is imported from defaultTasks.ts

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'projects' | 'settings'>(() => {
    const saved = localStorage.getItem('pinnacle_active_tab');
    return (saved as 'dashboard' | 'projects' | 'settings') || 'projects';
  });

  useEffect(() => {
    localStorage.setItem('pinnacle_active_tab', activeTab);
  }, [activeTab]);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('pinnacle_theme');
    // Map existing modern theme to light to prevent errors
    const normalized = saved === 'modern' ? 'light' : saved;
    return (normalized as 'light' | 'dark') || 'light';
  });
  const [activeUserId, setActiveUserId] = useState<string>('admin');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('pinnacle_sidebar_collapsed') === 'true';
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  useEffect(() => {
    localStorage.setItem('pinnacle_sidebar_collapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  // Password reset modal state
  const [showPasswordReset, setShowPasswordReset] = useState<boolean>(false);
  const [resetUserId, setResetUserId] = useState<string>('');
  
  // New Project Modal State
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState<boolean>(false);
  
  // Database States
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [communications, setCommunications] = useState<Communication[]>([]);

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => {
    return localStorage.getItem('pinnacle_selected_project_id');
  });

  useEffect(() => {
    if (selectedProjectId) {
      localStorage.setItem('pinnacle_selected_project_id', selectedProjectId);
    } else {
      localStorage.removeItem('pinnacle_selected_project_id');
    }
  }, [selectedProjectId]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Migrate old sagepulse_ keys to pinnacle_ prefix (one-time)
  useEffect(() => {
    const migrationKeys = ['projects', 'tasks', 'consultants', 'o365config', 'theme', 'activeuser'];
    let migrated = false;
    migrationKeys.forEach(key => {
      const oldVal = localStorage.getItem(`sagepulse_${key}`);
      if (oldVal && !localStorage.getItem(`pinnacle_${key}`)) {
        localStorage.setItem(`pinnacle_${key}`, oldVal);
        migrated = true;
      }
      if (oldVal) localStorage.removeItem(`sagepulse_${key}`);
    });
    if (migrated) console.log('[Pinnacle] Migrated localStorage keys from sagepulse_ to pinnacle_.');
  }, []);

  // Load from database / localStorage. Extracted as a callback so it can be
  // re-invoked after sign-in — backend reads are deferred until authenticated
  // (RLS now requires the authenticated role), so the first call on mount is a
  // no-op for Supabase sessions until handleLoginSuccess triggers a reload.
  const loadData = useCallback(async () => {
    try {
      // SECURITY: never issue reads/seeds against the backend for an
      // unauthenticated session. With RLS now requiring `authenticated`,
      // anonymous reads return nothing — and without this gate the app would
      // mistakenly think the DB is empty and re-seed it with default
      // credentials.
      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const { data: { session } } = await supabase!.auth.getSession();
        if (!session) {
          // No session yet — defer all loading until after sign-in.
          return;
        }
      }

        const [loadedProjects, loadedTasks, loadedConsultants, loadedCommunications, loadedCustomers] = await Promise.all([
          api.projects.getAll(),
          api.tasks.getAll(),
          api.consultants.getAll(),
          api.communications.getAll(),
          api.customers.getAll()
        ]);

        setCustomers(loadedCustomers);

        if (loadedProjects.length === 0 && loadedConsultants.length === 0) {
          // Seed initial defaults — only meaningful in localStorage mode.
          // (Supabase mode is seeded via migrations / auth.admin; the app
          // should never silently write default credentials to a real DB.)
          const initialProjects = defaultProjects;
          const initialConsultants = defaultConsultants;
          const initialScheduledTasks = calculateTaskSchedules(
            initialProjects[0].startDate,
            defaultTasks.map((t, idx) => ({ ...t, sortOrder: (idx + 1) * 10 }))
          );

          setProjects(initialProjects);
          setConsultants(initialConsultants);
          setTasks(initialScheduledTasks);

          if (!isSupabaseConfigured()) {
            await Promise.all([
              api.projects.saveAll(initialProjects),
              api.consultants.saveAll(initialConsultants)
            ]);
            await api.tasks.saveAll(initialScheduledTasks);

            localStorage.setItem('pinnacle_projects', JSON.stringify(initialProjects));
            localStorage.setItem('pinnacle_consultants', JSON.stringify(initialConsultants));
            localStorage.setItem('pinnacle_tasks', JSON.stringify(initialScheduledTasks));
          }
        } else {
          setProjects(loadedProjects);
          setTasks(loadedTasks);
          setCommunications(loadedCommunications);
          setConsultants(loadedConsultants);
        }
      } catch (error) {
        console.error('Failed to load data from database:', error);
      }
  }, []);

  // Initial mount: restore non-sensitive UI prefs, hydrate auth, and trigger
  // the first data load. Auth hydration is deliberately backend-driven:
  //   - Supabase mode: trust the Supabase session only. We no longer treat a
  //     bare `pinnacle_session` localStorage key as proof of login (P0-3).
  //   - Local mode: keep a lightweight session flag, but only accept it if the
  //     stored active user still resolves to a known consultant record.
  useEffect(() => {
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      supabase?.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setIsAuthenticated(true);
          // The Supabase session is the single source of truth for identity.
          // (Auth tokens now live in sessionStorage, so they don't survive a
          // browser restart — the user must re-authenticate each session.)
          setActiveUserId(session.user.id);
          loadData();
        }
      });
    } else {
      // Dev-only local mode: honor a saved active user so the UI can render
      // without a backend. There is no token check — this path is unreachable
      // in production (Supabase is always configured via env vars).
      const savedActiveUser = localStorage.getItem('pinnacle_activeuser');
      if (savedActiveUser) {
        setIsAuthenticated(true);
        setActiveUserId(savedActiveUser);
      }
      loadData();
    }
  }, [loadData]);
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    }
    localStorage.setItem('pinnacle_theme', theme);
  }, [theme]);

  // Active User Sync Handler
  useEffect(() => {
    localStorage.setItem('pinnacle_activeuser', activeUserId);
  }, [activeUserId]);

  // Whether the app was opened from an invite link. Captured once on first
  // render, before Supabase's detectSessionInUrl consumes and clears the hash.
  const inviteLinkRef = useRef<boolean>(
    typeof window !== 'undefined' && window.location.hash.includes('type=invite')
  );

  // Listen to Supabase Auth state changes for the two email-link flows that
  // require the user to set a password:
  //   - Password reset  → event 'PASSWORD_RECOVERY'
  //   - New-user invite → event 'SIGNED_IN', but ONLY when the link that opened
  //     the app carried `type=invite`. A normal sign-in also emits 'SIGNED_IN',
  //     so the invite flag is what prevents the modal from popping on every login.
  useEffect(() => {
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
          const isInvite = event === 'SIGNED_IN' && inviteLinkRef.current;
          if (event === 'PASSWORD_RECOVERY' || isInvite) {
            if (session?.user) {
              inviteLinkRef.current = false; // consume so later SIGNED_INs don't re-trigger
              setResetUserId(session.user.id);
              setActiveUserId(session.user.id);
              setIsAuthenticated(true); // ensure the modal (in the authed view) renders
              setShowPasswordReset(true);
              // The mount-time getSession() likely ran before the email-link
              // session was established, so its loadData() was skipped. Load now
              // that we have a session, otherwise consultants/customers stay empty
              // and the user can't be resolved (name shows "User", Settings blank).
              loadData();
            }
          }
        });
        return () => {
          subscription.unsubscribe();
        };
      }
    }
  }, [loadData]);

  // Derive active user for RBAC. Resolves from consultants (internal) OR
  // customers (external), producing a unified ActiveUser that permission
  // helpers consume without needing to know which table it came from.
  const activeConsultant = consultants.find(c => c.id === activeUserId) || null;
  const activeCustomer = customers.find(c => c.id === activeUserId) || null;
  const activeUser = activeConsultant
    ? activeUserFromConsultant(activeConsultant)
    : activeCustomer
      ? activeUserFromCustomer(activeCustomer)
      : null;
  const activeUserTier = activeUser?.tier || 'normal';

  // Projects visible to the active user (mirrors the projects SELECT RLS
  // policy). Managers/PMs/read-only see all; consultants see projects they're a
  // member of; customers see only the project they're the customer of.
  const activeProjects = projects.filter(p => !p.isTemplate && canSeeProject(activeUser, p));
  const filteredProjects = activeProjects;
  const projectTemplates = projects.filter(p => p.isTemplate);

  // Safety: reset selected project if user switches and the project is no longer visible
  // Only check after projects have loaded (non-empty) to avoid resetting on refresh
  useEffect(() => {
    if (selectedProjectId && activeUserId !== 'admin' && projects.length > 0) {
      const isVisible = filteredProjects.some(p => p.id === selectedProjectId);
      if (!isVisible) {
        setSelectedProjectId(filteredProjects[0]?.id || null);
      }
    }
  }, [activeUserId, filteredProjects, selectedProjectId, projects.length]);

  // Save database states helper
  const saveProjectsState = async (newProjects: Project[]) => {
    setProjects(newProjects);
    try {
      await api.projects.saveAll(newProjects);
      if (!isSupabaseConfigured()) {
        localStorage.setItem('pinnacle_projects', JSON.stringify(newProjects));
      }
    } catch (err: any) {
      console.error('Failed to save projects:', err);
      addToast(`Failed to save projects: ${err?.message || err}`, 'error');
    }
  };

  const saveConsultantsState = async (newConsultants: Consultant[]) => {
    setConsultants(newConsultants);
    try {
      await api.consultants.saveAll(newConsultants);
      if (!isSupabaseConfigured()) {
        localStorage.setItem('pinnacle_consultants', JSON.stringify(newConsultants));
      }
    } catch (err) {
      console.error(err);
      addToast('Failed to save consultants to database.', 'error');
    }
  };

  const saveTasksState = async (newTasks: Task[]) => {
    setTasks(newTasks);
    try {
      await api.tasks.saveAll(newTasks);
      if (!isSupabaseConfigured()) {
        localStorage.setItem('pinnacle_tasks', JSON.stringify(newTasks));
      }
    } catch (err) {
      console.error(err);
      addToast('Failed to save tasks to database.', 'error');
    }
  };

  // Toast Management
  const addToast = (message: string, type: Toast['type'] = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Re-run scheduler for a specific project
  const rescheduleProjectTasks = async (projectId: string, projectStartDate: string, currentTasks: Task[]) => {
    const projTasks = currentTasks.filter(t => t.projectId === projectId);
    const otherTasks = currentTasks.filter(t => t.projectId !== projectId);
    const rescheduled = calculateTaskSchedules(projectStartDate, projTasks);
    await saveTasksState([...otherTasks, ...rescheduled]);
  };

  // Project CRUD Action Handlers
  const handleCreateProject = async (projData: Omit<Project, 'id' | 'createdAt' | 'isTemplate'>, templateId?: string) => {
    const newProjectId = `p-${Math.random().toString(36).substring(2, 9)}`;
    const newProject: Project = {
      ...projData,
      id: newProjectId,
      createdAt: new Date().toISOString(),
      isTemplate: false
    };

    await saveProjectsState([...projects, newProject]);
    setSelectedProjectId(newProjectId);

    if (templateId) {
      const templateTasks = tasks.filter(t => t.projectId === templateId);
      const taskIdMap = new Map<string, string>();
      templateTasks.forEach(t => {
        taskIdMap.set(t.id, `t-${Math.random().toString(36).substring(2, 9)}`);
      });

      const newTasks: Task[] = templateTasks.map(t => ({
        ...t,
        id: taskIdMap.get(t.id) || t.id,
        projectId: newProjectId,
        parentId: t.parentId ? (taskIdMap.get(t.parentId) || null) : null,
        predecessorIds: t.predecessorIds.map(id => taskIdMap.get(id) || id)
      }));

      const scheduledTasks = calculateTaskSchedules(projData.startDate, newTasks);
      await saveTasksState([...tasks, ...scheduledTasks]);
      addToast('Project created from template successfully!', 'success');
    } else {
      addToast('Project created successfully!', 'success');
    }
  };

  const handleUpdateProject = async (updatedProject: Project) => {
    const nextProjects = projects.map(p => p.id === updatedProject.id ? updatedProject : p);
    await saveProjectsState(nextProjects);

    // If start date changed, reschedule tasks
    const originalProject = projects.find(p => p.id === updatedProject.id);
    if (originalProject && originalProject.startDate !== updatedProject.startDate) {
      await rescheduleProjectTasks(updatedProject.id, updatedProject.startDate, tasks);
    }
    addToast('Project details updated successfully!', 'success');
  };

  const handleDuplicateProject = async (
    projectId: string,
    config: { name: string; clientName: string; startDate: string; copyAssignments: boolean }
  ) => {
    const sourceProject = projects.find(p => p.id === projectId);
    if (!sourceProject) return;

    const newProjectId = `p-${Math.random().toString(36).substring(2, 9)}`;
    const newProject: Project = {
      ...sourceProject,
      id: newProjectId,
      name: config.name,
      clientName: config.clientName,
      startDate: config.startDate,
      createdAt: new Date().toISOString(),
      isTemplate: false
    };

    const sourceTasks = tasks.filter(t => t.projectId === projectId);
    const taskIdMap = new Map<string, string>();
    sourceTasks.forEach(t => {
      taskIdMap.set(t.id, `t-${Math.random().toString(36).substring(2, 9)}`);
    });

    const duplicatedTasks: Task[] = sourceTasks.map(t => ({
      ...t,
      id: taskIdMap.get(t.id) || t.id,
      projectId: newProjectId,
      parentId: t.parentId ? (taskIdMap.get(t.parentId) || null) : null,
      predecessorIds: t.predecessorIds.map(id => taskIdMap.get(id) || id),
      assignedConsultantId: config.copyAssignments ? t.assignedConsultantId : null
    }));

    const scheduledDuplicatedTasks = calculateTaskSchedules(config.startDate, duplicatedTasks);

    await saveProjectsState([...projects, newProject]);
    await saveTasksState([...tasks, ...scheduledDuplicatedTasks]);
    setSelectedProjectId(newProjectId);
    addToast('Project duplicated successfully!', 'success');
  };

  const handleSaveAsTemplate = async (projectId: string, templateName: string) => {
    const sourceProject = projects.find(p => p.id === projectId);
    if (!sourceProject) return;

    const newTemplateId = `tmpl-${Math.random().toString(36).substring(2, 9)}`;
    const newTemplate: Project = {
      ...sourceProject,
      id: newTemplateId,
      name: templateName,
      clientName: 'Template Reference',
      isTemplate: true,
      createdAt: new Date().toISOString()
    };

    const sourceTasks = tasks.filter(t => t.projectId === projectId);
    const taskIdMap = new Map<string, string>();
    sourceTasks.forEach(t => {
      taskIdMap.set(t.id, `t-${Math.random().toString(36).substring(2, 9)}`);
    });

    const duplicatedTasks: Task[] = sourceTasks.map(t => ({
      ...t,
      id: taskIdMap.get(t.id) || t.id,
      projectId: newTemplateId,
      parentId: t.parentId ? (taskIdMap.get(t.parentId) || null) : null,
      predecessorIds: t.predecessorIds.map(id => taskIdMap.get(id) || id)
    }));

    const scheduledTemplateTasks = calculateTaskSchedules(sourceProject.startDate, duplicatedTasks);

    await saveProjectsState([...projects, newTemplate]);
    await saveTasksState([...tasks, ...scheduledTemplateTasks]);
    addToast(`Project saved as template "${templateName}"!`, 'success');
  };

  const handleDeleteTemplate = async (id: string) => {
    const nextProjects = projects.filter(p => p.id !== id);
    const nextTasks = tasks.filter(t => t.projectId !== id);
    setProjects(nextProjects);
    setTasks(nextTasks);

    if (isSupabaseConfigured()) {
      try {
        await api.projects.delete(id);
      } catch (err) {
        console.error(err);
        addToast('Failed to delete template from database.', 'error');
      }
    } else {
      localStorage.setItem('pinnacle_projects', JSON.stringify(nextProjects));
      localStorage.setItem('pinnacle_tasks', JSON.stringify(nextTasks));
    }
    addToast('Template deleted.', 'warning');
  };

  const handleDeleteProject = async (id: string) => {
    const nextProjects = projects.filter(p => p.id !== id);
    const nextTasks = tasks.filter(t => t.projectId !== id);
    setProjects(nextProjects);
    setTasks(nextTasks);

    if (isSupabaseConfigured()) {
      try {
        await api.projects.delete(id);
      } catch (err) {
        console.error(err);
        addToast('Failed to delete project from database.', 'error');
      }
    } else {
      localStorage.setItem('pinnacle_projects', JSON.stringify(nextProjects));
      localStorage.setItem('pinnacle_tasks', JSON.stringify(nextTasks));
    }
  };

  // Task CRUD Action Handlers
  const handleCreateTask = async (taskData: Omit<Task, 'id'>) => {
    const activeProj = projects.find(p => p.id === taskData.projectId);
    if (!activeProj) return;

    const newTask: Task = {
      ...taskData,
      id: `t-${Math.random().toString(36).substring(2, 9)}`
    };

    const updatedTasksList = [...tasks, newTask];
    await rescheduleProjectTasks(taskData.projectId, activeProj.startDate, updatedTasksList);
  };

  const handleUpdateTask = async (task: Task) => {
    const activeProj = projects.find(p => p.id === task.projectId);
    if (!activeProj) return;

    const updatedTasksList = tasks.map(t => t.id === task.id ? task : t);
    await rescheduleProjectTasks(task.projectId, activeProj.startDate, updatedTasksList);
  };

  const handleDeleteTask = async (id: string) => {
    const taskToDelete = tasks.find(t => t.id === id);
    if (!taskToDelete) return;

    const activeProj = projects.find(p => p.id === taskToDelete.projectId);
    if (!activeProj) return;

    // Delete task and recursively delete all its children
    const getDescendants = (parentId: string): string[] => {
      const children = tasks.filter(t => t.parentId === parentId);
      return children.reduce((acc, c) => [...acc, c.id, ...getDescendants(c.id)], [] as string[]);
    };

    const idsToDelete = [id, ...getDescendants(id)];
    const filteredTasksList = tasks.filter(t => !idsToDelete.includes(t.id));

    setTasks(filteredTasksList);

    if (isSupabaseConfigured()) {
      try {
        await api.tasks.deleteMultiple(idsToDelete);
        const projTasks = filteredTasksList.filter(t => t.projectId === taskToDelete.projectId);
        const rescheduled = calculateTaskSchedules(activeProj.startDate, projTasks);
        await api.tasks.saveAll(rescheduled);
        
        const otherTasks = filteredTasksList.filter(t => t.projectId !== taskToDelete.projectId);
        setTasks([...otherTasks, ...rescheduled]);
      } catch (err) {
        console.error(err);
        addToast('Failed to delete task from database.', 'error');
      }
    } else {
      await rescheduleProjectTasks(taskToDelete.projectId, activeProj.startDate, filteredTasksList);
    }
  };

  const handleBulkUpdateTasks = async (taskIds: string[], updates: Partial<Task>) => {
    if (taskIds.length === 0) return;
    
    const firstTask = tasks.find(t => t.id === taskIds[0]);
    if (!firstTask) return;
    
    const activeProj = projects.find(p => p.id === firstTask.projectId);
    if (!activeProj) return;

    const updatedTasksList = tasks.map(t => {
      if (taskIds.includes(t.id)) {
        return { ...t, ...updates };
      }
      return t;
    });

    await rescheduleProjectTasks(firstTask.projectId, activeProj.startDate, updatedTasksList);
    addToast(`Successfully updated ${taskIds.length} tasks!`, 'success');
  };

  const handleReorderTasks = async (updates: { id: string; sortOrder: number; parentId?: string | null }[]) => {
    if (updates.length === 0) return;

    const firstTask = tasks.find(t => t.id === updates[0].id);
    if (!firstTask) return;

    const activeProj = projects.find(p => p.id === firstTask.projectId);
    if (!activeProj) return;

    // Cycle guard: refuse to reparent a task onto one of its own descendants.
    const getDescendants = (rootId: string): Set<string> => {
      const result = new Set<string>();
      const stack = [rootId];
      while (stack.length) {
        const cur = stack.pop()!;
        tasks
          .filter(t => t.parentId === cur)
          .forEach(child => {
            if (!result.has(child.id)) {
              result.add(child.id);
              stack.push(child.id);
            }
          });
      }
      return result;
    };

    const updateMap = new Map(updates.map(u => [u.id, u]));
    const updatedTasksList = tasks.map(t => {
      const u = updateMap.get(t.id);
      if (!u) return t;
      if (u.parentId !== undefined) {
        // No-op if the target parent is a descendant of the task being moved.
        if (u.parentId && getDescendants(t.id).has(u.parentId)) {
          return { ...t, sortOrder: u.sortOrder };
        }
        return { ...t, sortOrder: u.sortOrder, parentId: u.parentId };
      }
      return { ...t, sortOrder: u.sortOrder };
    });

    await rescheduleProjectTasks(firstTask.projectId, activeProj.startDate, updatedTasksList);
  };

  const handleUpdateTaskAndSubtasks = async (task: Task, subtaskIds: string[], subtaskUpdates: Partial<Task>) => {
    const activeProj = projects.find(p => p.id === task.projectId);
    if (!activeProj) return;

    const updatedTasksList = tasks.map(t => {
      if (t.id === task.id) {
        return task;
      }
      if (subtaskIds.includes(t.id)) {
        return { ...t, ...subtaskUpdates };
      }
      return t;
    });

    await rescheduleProjectTasks(task.projectId, activeProj.startDate, updatedTasksList);
    addToast('Task and subtasks updated successfully!', 'success');
  };

  const handleBulkDeleteTasks = async (taskIds: string[]) => {
    if (taskIds.length === 0) return;

    const firstTask = tasks.find(t => t.id === taskIds[0]);
    if (!firstTask) return;

    const activeProj = projects.find(p => p.id === firstTask.projectId);
    if (!activeProj) return;

    const getDescendants = (parentIds: string[]): string[] => {
      const children = tasks.filter(t => t.parentId && parentIds.includes(t.parentId));
      if (children.length === 0) return [];
      const childIds = children.map(c => c.id);
      return [...childIds, ...getDescendants(childIds)];
    };

    const descendants = getDescendants(taskIds);
    const allIdsToDelete = Array.from(new Set([...taskIds, ...descendants]));
    const filteredTasksList = tasks.filter(t => !allIdsToDelete.includes(t.id));

    setTasks(filteredTasksList);

    if (isSupabaseConfigured()) {
      try {
        await api.tasks.deleteMultiple(allIdsToDelete);
        const projTasks = filteredTasksList.filter(t => t.projectId === firstTask.projectId);
        const rescheduled = calculateTaskSchedules(activeProj.startDate, projTasks);
        await api.tasks.saveAll(rescheduled);
        
        const otherTasks = filteredTasksList.filter(t => t.projectId !== firstTask.projectId);
        setTasks([...otherTasks, ...rescheduled]);
      } catch (err) {
        console.error(err);
        addToast('Failed to delete tasks from database.', 'error');
      }
    } else {
      await rescheduleProjectTasks(firstTask.projectId, activeProj.startDate, filteredTasksList);
    }
    addToast(`Successfully deleted ${taskIds.length} tasks.`, 'warning');
  };

  // Consultant CRUD Action Handlers
  const handleAddConsultant = async (cData: Omit<Consultant, 'id'>): Promise<boolean> => {
    let id = `c-${Math.random().toString(36).substring(2, 9)}`;

    if (isSupabaseConfigured()) {
      try {
        const { userId, error: inviteError } = await inviteUser(cData.email);
        if (inviteError) {
          console.error('Failed to send invite:', inviteError);
          addToast(`Failed to send invite: ${inviteError}`, 'error');
          return false;
        }
        if (userId) {
          id = userId;
        }
        addToast(`Invite sent to ${cData.email}. They will set their own password.`, 'success');
      } catch (err: any) {
        console.error('Failed to send invite:', err);
        addToast(`Connection error: ${err.message || err}`, 'error');
        return false;
      }
    }

    const newConsultant: Consultant = {
      name: cData.name,
      email: cData.email,
      role: cData.role,
      avatarColor: cData.avatarColor,
      tier: cData.tier,
      id
    };

    try {
      await saveConsultantsState([...consultants, newConsultant]);
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  const handleDeleteConsultant = async (id: string) => {
    const nextConsultants = consultants.filter(c => c.id !== id);
    const updatedTasks = tasks.map(t => t.assignedConsultantId === id ? { ...t, assignedConsultantId: null } : t);

    setConsultants(nextConsultants);
    setTasks(updatedTasks);

    if (isSupabaseConfigured()) {
      try {
        await api.consultants.delete(id);
        await api.tasks.saveAll(updatedTasks);
      } catch (err) {
        console.error(err);
        addToast('Failed to delete consultant from database.', 'error');
      }
    } else {
      localStorage.setItem('pinnacle_consultants', JSON.stringify(nextConsultants));
      localStorage.setItem('pinnacle_tasks', JSON.stringify(updatedTasks));
    }
  };

  // ---- Customer (external party) management --------------------------------
  // Customers authenticate via Supabase Auth like consultants, but live in a
  // separate `customers` table and are always tier='normal' (enforced by a DB
  // CHECK constraint).
  const handleAddCustomer = async (cData: Omit<Customer, 'id' | 'tier'>): Promise<boolean> => {
    let id = `cust-${Math.random().toString(36).substring(2, 9)}`;

    if (isSupabaseConfigured()) {
      try {
        const { userId, error: inviteError } = await inviteUser(cData.email);
        if (inviteError) {
          console.error('Failed to send invite:', inviteError);
          addToast(`Failed to send invite: ${inviteError}`, 'error');
          return false;
        }
        if (userId) {
          id = userId;
        }
        addToast(`Invite sent to ${cData.email}. They will set their own password.`, 'success');
      } catch (err: any) {
        console.error('Failed to send invite:', err);
        addToast(`Connection error: ${err.message || err}`, 'error');
        return false;
      }
    }

    const newCustomer: Customer = {
      name: cData.name,
      email: cData.email,
      company: cData.company ?? null,
      avatarColor: cData.avatarColor,
      tier: 'normal', // forced; customers can never be admin/superuser
      id
    };

    try {
      const next = [...customers, newCustomer];
      setCustomers(next);
      if (isSupabaseConfigured()) {
        await api.customers.save(newCustomer);
      } else {
        localStorage.setItem('pinnacle_customers', JSON.stringify(next));
      }
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    const next = customers.filter(c => c.id !== id);
    setCustomers(next);
    // Null out customer_id on any projects that referenced them.
    const updatedProjects = projects.map(p => p.customerId === id ? { ...p, customerId: null } : p);
    setProjects(updatedProjects);
    if (isSupabaseConfigured()) {
      try {
        await api.customers.delete(id);
        await api.projects.saveAll(updatedProjects);
      } catch (err) {
        console.error(err);
        addToast('Failed to delete customer from database.', 'error');
      }
    } else {
      localStorage.setItem('pinnacle_customers', JSON.stringify(next));
      localStorage.setItem('pinnacle_projects', JSON.stringify(updatedProjects));
    }
  };

  // In production, password resets are handled by Supabase Auth's
  // resetPasswordForEmail flow (invoked from Login.tsx). There is no local
  // password store to reset anymore.

  // Database backups: JSON imports / exports
  const handleExportData = () => {
    const db = {
      projects,
      tasks,
      consultants
    };
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pinnacle_db_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    addToast('Database backup triggered successfully.', 'success');
  };

  const handleImportData = async (jsonData: string): Promise<boolean> => {
    try {
      const db = JSON.parse(jsonData);
      if (db.projects && db.tasks && db.consultants) {
        await Promise.all([
          saveProjectsState(db.projects),
          saveConsultantsState(db.consultants),
          saveTasksState(db.tasks)
        ]);
        return true;
      }
      return false;
    } catch (error) {
      console.error(error);
      return false;
    }
  };

  const handleResetData = async () => {
    if (isSupabaseConfigured()) {
      try {
        const client = getSupabaseClient()!;
        await Promise.all([
          client.from('tasks').delete().neq('id', ''),
          client.from('projects').delete().neq('id', ''),
          client.from('consultants').delete().neq('id', '')
        ]);
        
        const initialProjects = defaultProjects;
        const initialConsultants = defaultConsultants;
        const initialScheduledTasks = calculateTaskSchedules(
          initialProjects[0].startDate,
          defaultTasks.map((t, idx) => ({ ...t, sortOrder: (idx + 1) * 10 }))
        );
        
        await Promise.all([
          api.projects.saveAll(initialProjects),
          api.consultants.saveAll(initialConsultants)
        ]);
        await api.tasks.saveAll(initialScheduledTasks);

        setProjects(initialProjects);
        setConsultants(initialConsultants);
        setTasks(initialScheduledTasks);
        setSelectedProjectId(initialProjects[0].id);
      } catch (err) {
        console.error('Failed to reset database on Supabase:', err);
      }
    }

    localStorage.removeItem('pinnacle_projects');
    localStorage.removeItem('pinnacle_consultants');
    localStorage.removeItem('pinnacle_tasks');
    localStorage.removeItem('pinnacle_supabase_url');
    localStorage.removeItem('pinnacle_supabase_anon_key');

    localStorage.removeItem('pinnacle_o365config');
    localStorage.setItem('pinnacle_theme', 'light');

    setTheme('light');
    setIsAuthenticated(false);
    setActiveUserId('admin');
    localStorage.removeItem('pinnacle_session');
    localStorage.removeItem('pinnacle_activeuser');
  };

  const handleLoginSuccess = (userId: string) => {
    setIsAuthenticated(true);
    setActiveUserId(userId);
    // pinnacle_session was a local-mode UI hint; in Supabase mode the real
    // session JWT lives in sessionStorage (set by the Supabase client). We
    // still keep pinnacle_activeuser for the dev-mode local path.
    localStorage.setItem('pinnacle_activeuser', userId);
    // Only set tab if no saved preference (preserves last-visited page on refresh)
    if (!localStorage.getItem('pinnacle_active_tab')) {
      setActiveTab('projects');
    }
    // Backend reads were deferred until authenticated; now reload.
    loadData();
  };

  const handleLogout = async () => {
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient()!;
      await supabase.auth.signOut();
    }
    setIsAuthenticated(false);
    setActiveUserId('admin');
    localStorage.removeItem('pinnacle_session');
    localStorage.removeItem('pinnacle_activeuser');
    addToast('Logged out of Pinnacle Projects.', 'info');
  };

  // Render selected view tab
  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            projects={filteredProjects}
            tasks={tasks}
            consultants={consultants}
            activeUserId={activeUserId}
            activeUser={activeUser}
            onSelectProject={(id) => {
              setSelectedProjectId(id);
              setActiveTab('projects');
            }}
            onUpdateTask={handleUpdateTask}
            onAddToast={addToast}
          />
        );
      case 'projects':
        if (!selectedProjectId) {
          return (
            <ProjectsList 
              projects={projects} 
              tasks={tasks}
              consultants={consultants} 
              onSelectProject={setSelectedProjectId}
              onCreateProject={handleCreateProject}
              onBulkUpdateProjects={(ids, updates) => {
                const updatedProjects = projects.map(p => ids.includes(p.id) ? { ...p, ...updates } : p);
                saveProjectsState(updatedProjects);
              }}
              onBulkDeleteProjects={(ids) => {
                const updatedProjects = projects.filter(p => !ids.includes(p.id));
                const updatedTasks = tasks.filter(t => !ids.includes(t.projectId));
                setProjects(updatedProjects);
                setTasks(updatedTasks);
                if (isSupabaseConfigured()) {
                  ids.forEach(id => {
                    api.projects.delete(id).catch(err => console.error(err));
                  });
                  api.tasks.saveAll(updatedTasks).catch(err => console.error(err));
                } else {
                  localStorage.setItem('pinnacle_projects', JSON.stringify(updatedProjects));
                  localStorage.setItem('pinnacle_tasks', JSON.stringify(updatedTasks));
                }
                if (selectedProjectId && ids.includes(selectedProjectId)) {
                  setSelectedProjectId(null);
                }
              }}
              onAddToast={addToast}
              setIsNewProjectModalOpen={setIsNewProjectModalOpen}
            />
          );
        }
        return (
          <ProjectDetails 
            projects={filteredProjects}
            tasks={tasks}
            consultants={consultants}
            communications={communications}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
            onUpdateProject={handleUpdateProject}
            onDeleteProject={handleDeleteProject}
            onCreateTask={handleCreateTask}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
            onBulkUpdateTasks={handleBulkUpdateTasks}
            onBulkDeleteTasks={handleBulkDeleteTasks}
            onUpdateTaskAndSubtasks={handleUpdateTaskAndSubtasks}
            onAddToast={addToast}
            onDuplicateProject={handleDuplicateProject}
            onSaveAsTemplate={handleSaveAsTemplate}
            activeUserId={activeUserId}
            activeUser={activeUser}
            customers={customers}
            onReorderTasks={handleReorderTasks}
            onSaveCommunication={async (comm) => {
              const updatedComms = [comm, ...communications.filter(c => c.id !== comm.id)];
              setCommunications(updatedComms);
              await api.communications.save(comm);
            }}
            onDeleteCommunication={async (id) => {
              const updatedComms = communications.filter(c => c.id !== id);
              setCommunications(updatedComms);
              await api.communications.delete(id);
            }}
            setIsNewProjectModalOpen={setIsNewProjectModalOpen}
          />
        );
      case 'settings':
        return (
          <Settings
            consultants={consultants}
            customers={customers}
            activeUserTier={activeUserTier}
            activeUserId={activeUserId}
            activeUser={activeUser}
            onAddConsultant={handleAddConsultant}
            onDeleteConsultant={handleDeleteConsultant}
            onUpdateConsultant={(updated: Consultant) => {
              saveConsultantsState(consultants.map(c => c.id === updated.id ? updated : c));
            }}
            onAddCustomer={handleAddCustomer}
            onDeleteCustomer={handleDeleteCustomer}
            onImportData={handleImportData}
            onExportData={handleExportData}
            onResetData={handleResetData}
            onAddToast={addToast}
            projectTemplates={projectTemplates}
            onDeleteTemplate={handleDeleteTemplate}
          />
        );
      default:
        return <div>View not found</div>;
    }
  };

    if (!isAuthenticated) {
      return (
        <>
          <Login
            consultants={consultants}
            onLoginSuccess={handleLoginSuccess}
            onAddToast={addToast}
          />
          {/* Dynamic Toast Container */}
          <div className="toast-container">
            {toasts.map(toast => (
              <div key={toast.id} className={`toast toast-${toast.type}`}>
                <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                  {toast.message}
                </div>
                <X 
                  size={14} 
                  className="toast-close" 
                  onClick={() => removeToast(toast.id)} 
                />
              </div>
            ))}
          </div>
        </>
      );
    }

    return (
      <div className={`app-container ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Password Reset Modal */}
        {showPasswordReset && (
          <PasswordReset
            userId={resetUserId}
            consultants={consultants}
            onPasswordReset={(newPass) => {
              // Passwords are owned by Supabase Auth. An admin resetting another
              // user's password must use the Supabase dashboard / invite flow;
              // this modal only handles the signed-in user updating their own.
              if (isSupabaseConfigured()) {
                const supabase = getSupabaseClient()!;
                supabase.auth.updateUser({ password: newPass }).then(({ error }) => {
                  if (error) {
                    console.error('Failed to reset Supabase password:', error);
                    addToast(`Failed to update password: ${error.message}`, 'error');
                  } else {
                    addToast('Password updated successfully.', 'success');
                  }
                });
              } else {
                addToast('Offline dev mode: passwords are managed externally in production.', 'info');
              }
              setShowPasswordReset(false);
            }}
            onCancel={() => setShowPasswordReset(false)}
          />
        )}

        {/* Mobile Header Bar */}
        <header className="mobile-header">
          <button 
            className="hamburger-btn"
            onClick={() => setIsMobileMenuOpen(true)}
            title="Open Menu"
            aria-label="Open Mobile Menu"
          >
            <Menu size={20} />
          </button>
          <div className="mobile-brand">
            <Logo style={{ height: '22px', width: 'auto' }} />
          </div>
          <div className="mobile-user-avatar">
            <span 
              style={{ 
                width: '28px', height: '28px', borderRadius: '50%', 
                backgroundColor: activeConsultant?.avatarColor || 'var(--primary)',
                color: 'white', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '0.65rem', fontWeight: 'bold'
              }}
            >
              {activeConsultant?.name.split(' ').map(n => n[0]).join('') || 'U'}
            </span>
          </div>
        </header>

        {/* Mobile Sidebar Backdrop Overlay */}
        {isMobileMenuOpen && (
          <div className="sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />
        )}

        {/* Sidebar navigation */}
        <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''} ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div className="brand-section" style={{ justifyContent: 'center' }}>
              {!isSidebarCollapsed ? (
                <Logo style={{ height: '26px', width: 'auto' }} />
              ) : (
                <CroppedLogo style={{ height: '26px', width: 'auto' }} />
              )}
            </div>

            {/* User Profile Card */}
            <div className="user-profile-card" style={{ padding: '0.75rem', marginBottom: '1.75rem', display: 'flex', alignItems: 'center', gap: '0.85rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)' }}>
              {activeConsultant?.tier === 'superuser' || activeConsultant?.tier === 'admin' ? (
                <div 
                  style={{ 
                    width: '36px', 
                    height: '36px', 
                    borderRadius: 'var(--radius-md)', 
                    backgroundColor: 'var(--primary)', 
                    color: 'white', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    flexShrink: 0
                  }}
                >
                  {activeConsultant?.tier === 'superuser' ? 'SU' : 'AD'}
                </div>
              ) : (
                <div 
                  style={{ 
                    width: '36px', 
                    height: '36px', 
                    borderRadius: 'var(--radius-md)', 
                    backgroundColor: consultants.find(c => c.id === activeUserId)?.avatarColor || 'var(--primary)', 
                    color: 'white', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    flexShrink: 0
                  }}
                >
                  {consultants.find(c => c.id === activeUserId)?.name.split(' ').map(n => n[0]).join('') || 'U'}
                </div>
              )}
              {!isSidebarCollapsed && (
                <div className="user-profile-details" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {activeConsultant?.name || 'User'}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>
                    {activeConsultant?.role || 'Consultant'}
                  </span>
                </div>
              )}
            </div>

            <nav style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {!isSidebarCollapsed && <div className="nav-section-label">Menu</div>}
              <ul className="nav-list">
                <li
                  className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('dashboard');
                    setIsMobileMenuOpen(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setActiveTab('dashboard');
                      setIsMobileMenuOpen(false);
                    }
                  }}
                  title="Dashboard"
                  aria-label="Navigate to Dashboard"
                  role="button"
                  tabIndex={0}
                >
                  <LayoutDashboard size={18} />
                  <span>Dashboard</span>
                </li>
                <li>
                  <div
                    className={`nav-item ${activeTab === 'projects' && !selectedProjectId ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedProjectId(null);
                      setActiveTab('projects');
                      setIsMobileMenuOpen(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setSelectedProjectId(null);
                        setActiveTab('projects');
                        setIsMobileMenuOpen(false);
                      }
                    }}
                    title="Projects"
                    aria-label="Navigate to Projects"
                    role="button"
                    tabIndex={0}
                  >
                    <FolderKanban size={18} />
                    <span>Projects</span>
                  </div>
                </li>
              </ul>

              {/* Recent projects sub-tree */}
              {!isSidebarCollapsed && (() => {
                const recentProjects = projects
                  .filter(p => !p.isTemplate)
                  .slice()
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .slice(0, 10);
                if (recentProjects.length === 0) return null;
                return (
                  <>
                    <div className="nav-section-label">Recent Projects</div>
                    <ul className="nav-subtree">
                      {recentProjects.map(p => (
                        <li
                          key={p.id}
                          className={`nav-subitem ${selectedProjectId === p.id ? 'nav-subitem-active' : ''}`}
                          onClick={() => {
                            setSelectedProjectId(p.id);
                            setActiveTab('projects');
                            setIsMobileMenuOpen(false);
                          }}
                          title={p.name}
                        >
                          <span className="nav-subitem-dot" />
                          <span className="nav-subitem-text">{p.name}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                );
              })()}
            </nav>
          </div>

          {/* Microsoft authentication badge indicator and bottom controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
            {/* Bottom Settings navigation item */}
            <div 
              className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('settings');
                setIsMobileMenuOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setActiveTab('settings');
                  setIsMobileMenuOpen(false);
                }
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.6rem 0.75rem', cursor: 'pointer', borderRadius: 'var(--radius-md)' }}
              title="Settings"
              aria-label="Navigate to Settings"
              role="button"
              tabIndex={0}
            >
              <SettingsIcon size={18} />
              {!isSidebarCollapsed && <span>Settings</span>}
            </div>

            {/* Custom Theme Toggle Switch */}
            <div className="theme-switch-row" style={{ display: 'flex', alignItems: 'center', justifyContent: isSidebarCollapsed ? 'center' : 'space-between', padding: isSidebarCollapsed ? '0.5rem 0' : '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', backgroundColor: isSidebarCollapsed ? 'transparent' : 'var(--bg-tertiary)', gap: '0.5rem', flexDirection: isSidebarCollapsed ? 'column' : 'row' }}>
              {!isSidebarCollapsed && (
                <div className="theme-switch-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                  Theme
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.25rem', backgroundColor: 'var(--bg-secondary)', padding: '0.2rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', flexDirection: isSidebarCollapsed ? 'column' : 'row' }}>
                <button 
                  title="Light Mode"
                  aria-label="Switch to Light Theme"
                  onClick={() => setTheme('light')}
                  style={{ background: theme === 'light' ? 'var(--primary-light)' : 'transparent', color: theme === 'light' ? 'var(--primary)' : 'var(--text-tertiary)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '0.3rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                >
                  <Sun size={14} />
                </button>
                <button 
                  title="Dark Mode"
                  aria-label="Switch to Dark Theme"
                  onClick={() => setTheme('dark')}
                  style={{ background: theme === 'dark' ? 'var(--primary-light)' : 'transparent', color: theme === 'dark' ? 'var(--primary)' : 'var(--text-tertiary)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '0.3rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                >
                  <Moon size={14} />
                </button>
              </div>
            </div>

            <button 
              className="btn btn-secondary btn-icon"
              style={{ width: '100%', padding: '0.45rem', color: 'var(--danger)', borderColor: 'var(--border-color)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: isSidebarCollapsed ? 'center' : 'flex-start', alignItems: 'center', gap: '0.5rem' }}
              onClick={handleLogout}
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut size={14} />
              {!isSidebarCollapsed && <span style={{ fontSize: '0.78rem' }}>Sign Out</span>}
            </button>

            {/* Collapse toggle button */}
            <button 
              className="btn btn-secondary btn-icon desktop-only-toggle"
              style={{ width: '100%', padding: '0.45rem', borderColor: 'var(--border-color)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: isSidebarCollapsed ? 'center' : 'flex-start', alignItems: 'center', gap: '0.5rem' }}
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              aria-label={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
              {!isSidebarCollapsed && <span style={{ fontSize: '0.78rem' }}>Collapse Sidebar</span>}
            </button>
          </div>
        </aside>

        {/* Main Panel Viewport */}
        <main className="main-content">
          <header className="header" style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            flexWrap: 'wrap', 
            gap: '1rem', 
            position: 'relative',
            ...(activeTab === 'projects' ? {
              paddingBottom: '0',
              marginBottom: '0',
              borderBottom: 'none',
              paddingTop: '1rem'
            } : {
              paddingBottom: '1rem',
              borderBottom: '1px solid var(--border-color)',
              marginBottom: '1.5rem'
            })
          }}>
            <div className="page-title-section" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: '1rem', flex: 1 }}>
              {activeTab === 'projects' && selectedProjectId ? (
                <button className="btn btn-secondary btn-icon" onClick={() => setSelectedProjectId(null)} title="Back to Projects" style={{ flexShrink: 0, width: 'auto', padding: '0.5rem 1rem 0.5rem 0', display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'transparent', border: 'none', boxShadow: 'none' }}>
                  <ArrowLeft size={16} /> <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Back to Projects</span>
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <h1 style={{ fontSize: '1.3rem', textTransform: 'capitalize', letterSpacing: '-0.02em', margin: 0 }}>
                    {activeTab}
                  </h1>
                  <span className="page-subtitle" style={{ display: 'block', margin: 0, marginTop: '0.25rem' }}>
                    {activeTab === 'dashboard' && 'Aggregate metrics and project statuses'}
                    {activeTab === 'projects' && 'Build and organize hierarchical implementation tasks'}
                    {activeTab === 'settings' && 'Manage integration keys and consultant team details'}
                  </span>
                </div>
              )}
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'row', gap: '1rem', alignItems: 'center', position: 'relative', zIndex: 100 }}>
              {activeTab === 'projects' && selectedProjectId && (
                <div style={{ width: '300px' }}>
                  <WinComboBox
                    className="form-select"
                    value={selectedProjectId}
                    onChange={(val) => setSelectedProjectId(val)}
                    options={[
                      { label: '-- Select Project --', value: '' },
                      ...projects.filter(p => !p.isTemplate).map(p => ({ label: `${p.name} (${p.clientName})`, value: p.id }))
                    ]}
                    enableSearch={true}
                  />
                </div>
              )}
            </div>
          </header>

          <div className="content-pane" style={{ paddingTop: activeTab === 'projects' ? '0.5rem' : '' }}>
            {renderContent()}
          </div>
        </main>

        {/* New Project Modal */}
        {isNewProjectModalOpen && (
          <NewProjectModal
            onClose={() => setIsNewProjectModalOpen(false)}
            onCreateProject={handleCreateProject}
            projectTemplates={projects.filter(p => p.isTemplate)}
            consultants={consultants}
            customers={customers}
          />
        )}

        {/* Dynamic Toast Container */}
        <div className="toast-container">
          {toasts.map(toast => (
            <div key={toast.id} className={`toast toast-${toast.type}`}>
              <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                {toast.message}
              </div>
              <X 
                size={14} 
                className="toast-close" 
                onClick={() => removeToast(toast.id)} 
              />
            </div>
          ))}
        </div>
      </div>
  );
}
