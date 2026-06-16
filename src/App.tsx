import { useState, useEffect } from 'react';
import PasswordReset from './components/PasswordReset';
import type { Project, Task, Consultant, O365Config } from './types';
import type { AccountInfo } from '@azure/msal-browser';
import { getMsalInstance } from './utils/o365';
import { calculateTaskSchedules } from './utils/scheduler';
import { hashPassword } from './utils/auth';
import { defaultTasks } from './defaultTasks';
import Dashboard from './components/Dashboard';
import ProjectView from './components/ProjectView';
import GanttChart from './components/GanttChart';
import Settings from './components/Settings';
import Login from './components/Login';
import Logo from './components/Logo';
import { 
  FolderKanban, LayoutDashboard, CalendarDays, Settings as SettingsIcon, 
  Sun, Moon, ShieldCheck, Info, X, LogOut 
} from 'lucide-react';
import { api } from './utils/api';
import { isSupabaseConfigured, getSupabaseClient } from './utils/supabase';

// Toast structure
interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

// Pre-computed SHA-256 hashes for default passwords
const HASH_MANAGER = '6ee4a469cd4e91053847f5d3fcb61dbcc91e8f0ef10be7748da4c4a1ba382d17'; // 'manager'
const HASH_PASSWORD = '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8'; // 'password'

// Initial Mock Seed Data (admin is now a regular consultant record)
const defaultConsultants: Consultant[] = [
  { id: 'admin', name: 'System Administrator', email: 'mohammad.jenabi@gmail.com', role: 'Administrator', avatarColor: '#2d4a65', tier: 'admin', passwordHash: HASH_MANAGER, mustResetPassword: false },
  { id: 'c1', name: 'Sarah Jenkins', email: 'sarah.jenkins@pinnacle.com', role: 'Lead Consultant', avatarColor: '#0d9488', tier: 'consultant', passwordHash: HASH_PASSWORD, mustResetPassword: true },
  { id: 'c2', name: 'Alex Rivera', email: 'alex.rivera@pinnacle.com', role: 'Technical Architect', avatarColor: '#6366f1', tier: 'consultant', passwordHash: HASH_PASSWORD, mustResetPassword: true },
  { id: 'c3', name: 'Marcus Brody', email: 'marcus.brody@pinnacle.com', role: 'Project Manager', avatarColor: '#f59e0b', tier: 'project_manager', passwordHash: HASH_PASSWORD, mustResetPassword: true },
  { id: 'c4', name: 'David Vance', email: 'david.vance@pinnacle.com', role: 'Executive Sponsor (Read Only)', avatarColor: '#ef4444', tier: 'read_only', passwordHash: HASH_PASSWORD, mustResetPassword: true }
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
    createdAt: new Date().toISOString()
  },
  {
    id: 'tmpl_sage_intacct',
    name: 'Sage Intacct Implementation',
    clientName: 'Template Reference',
    description: 'Generate a standardized, multi-stage project management structure for enterprise accounting software deployment.',
    budgetDays: 25,
    startDate: new Date().toISOString().split('T')[0],
    consultantIds: [],
    createdAt: new Date().toISOString(),
    isTemplate: true
  }
];

// defaultTasks is imported from defaultTasks.ts

const defaultO365Config: O365Config = {
  clientId: '',
  tenantId: '',
  redirectUri: window.location.origin,
  todoListName: 'Pinnacle Projects Tasks',
  isEnabled: false
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'projects' | 'gantt' | 'settings'>('dashboard');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [activeUserId, setActiveUserId] = useState<string>('admin');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  
  // Password reset modal state
  const [showPasswordReset, setShowPasswordReset] = useState<boolean>(false);
  const [resetUserId, setResetUserId] = useState<string>('');
  
  // Database States
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [o365Config, setO365Config] = useState<O365Config>(defaultO365Config);
  const [microsoftAccount, setMicrosoftAccount] = useState<AccountInfo | null>(null);

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Migrate old sagepulse_ keys to pinnacle_ prefix (one-time)
  useEffect(() => {
    const migrationKeys = ['projects', 'tasks', 'consultants', 'o365config', 'theme', 'activeuser', 'authenticated'];
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

  // Load from database / localStorage
  useEffect(() => {
    const loadData = async () => {
      try {
        const [loadedProjects, loadedTasks, loadedConsultants] = await Promise.all([
          api.projects.getAll(),
          api.tasks.getAll(),
          api.consultants.getAll()
        ]);

        if (loadedProjects.length === 0 && loadedConsultants.length === 0) {
          // Seed initial defaults
          const initialProjects = defaultProjects;
          const initialConsultants = defaultConsultants;
          const initialScheduledTasks = calculateTaskSchedules(initialProjects[0].startDate, defaultTasks);
          
          setProjects(initialProjects);
          setConsultants(initialConsultants);
          setTasks(initialScheduledTasks);

          await Promise.all([
            api.projects.saveAll(initialProjects),
            api.consultants.saveAll(initialConsultants)
          ]);
          await api.tasks.saveAll(initialScheduledTasks);

          if (!isSupabaseConfigured()) {
            localStorage.setItem('pinnacle_projects', JSON.stringify(initialProjects));
            localStorage.setItem('pinnacle_consultants', JSON.stringify(initialConsultants));
            localStorage.setItem('pinnacle_tasks', JSON.stringify(initialScheduledTasks));
          }
        } else {
          setProjects(loadedProjects);
          setTasks(loadedTasks);
          
          // Apply fallback migrations to loaded consultants if needed
          let currentConsultants = loadedConsultants;
          let needsMigration = false;
          
          currentConsultants = currentConsultants.map(c => {
            const asAny = c as any;
            if (asAny.password && !c.passwordHash) {
              needsMigration = true;
              const hash = asAny.password === 'manager' ? HASH_MANAGER : HASH_PASSWORD;
              const { password: _removed, ...rest } = asAny;
              return { ...rest, passwordHash: hash, mustResetPassword: c.id !== 'admin' } as Consultant;
            }
            return c;
          });

          // Ensure admin record email is updated
          const adminRecord = currentConsultants.find(c => c.id === 'admin');
          if (adminRecord && adminRecord.email !== 'mohammad.jenabi@gmail.com') {
            adminRecord.email = 'mohammad.jenabi@gmail.com';
            needsMigration = true;
          }
          
          if (needsMigration) {
            await api.consultants.saveAll(currentConsultants);
            if (!isSupabaseConfigured()) {
              localStorage.setItem('pinnacle_consultants', JSON.stringify(currentConsultants));
            }
          }
          
          setConsultants(currentConsultants);
        }
      } catch (error) {
        console.error('Failed to load data from database:', error);
      }
    };

    loadData();

    const savedConfig = localStorage.getItem('pinnacle_o365config');
    const savedTheme = localStorage.getItem('pinnacle_theme');
    const savedActiveUser = localStorage.getItem('pinnacle_activeuser');
    const savedAuth = localStorage.getItem('pinnacle_session');

    if (savedConfig) {
      setO365Config(JSON.parse(savedConfig));
    }
    if (savedTheme) {
      setTheme(savedTheme as 'light' | 'dark');
    } else {
      setTheme('light');
    }
    if (savedAuth && savedActiveUser) {
      setIsAuthenticated(true);
      setActiveUserId(savedActiveUser);
    }
  }, []);

  // Theme Sync Handler
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('pinnacle_theme', theme);
  }, [theme]);

  // Active User Sync Handler
  useEffect(() => {
    localStorage.setItem('pinnacle_activeuser', activeUserId);
  }, [activeUserId]);

  // MSAL Active Login Check
  useEffect(() => {
    if (o365Config.isEnabled && o365Config.clientId && o365Config.tenantId) {
      const msal = getMsalInstance(o365Config);
      if (msal) {
        msal.initialize().then(() => {
          const accounts = msal.getAllAccounts();
          if (accounts.length > 0) {
            setMicrosoftAccount(accounts[0]);
          }
        }).catch(err => {
          console.warn('Silent MSAL init error:', err);
        });
      }
    } else {
      setMicrosoftAccount(null);
    }
  }, [o365Config]);

  // Derive active user's tier for RBAC
  const activeConsultant = consultants.find(c => c.id === activeUserId) || null;
  const activeUserTier = activeConsultant?.tier || 'read_only';

  // Filtered projects list based on access privileges
  const activeProjects = projects.filter(p => !p.isTemplate);
  const filteredProjects = (activeUserTier === 'admin' || activeUserTier === 'project_manager' || activeUserTier === 'consultant')
    ? activeProjects
    : activeProjects.filter(p => p.consultantIds.includes(activeUserId));
  const projectTemplates = projects.filter(p => p.isTemplate);

  // Safety: reset selected project if user switches and the project is no longer visible
  useEffect(() => {
    if (selectedProjectId && activeUserId !== 'admin') {
      const isVisible = filteredProjects.some(p => p.id === selectedProjectId);
      if (!isVisible) {
        setSelectedProjectId(filteredProjects[0]?.id || null);
      }
    }
  }, [activeUserId, filteredProjects, selectedProjectId]);

  // Save database states helper
  const saveProjectsState = async (newProjects: Project[]) => {
    setProjects(newProjects);
    try {
      await api.projects.saveAll(newProjects);
      if (!isSupabaseConfigured()) {
        localStorage.setItem('pinnacle_projects', JSON.stringify(newProjects));
      }
    } catch (err) {
      console.error(err);
      addToast('Failed to save projects to database.', 'error');
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
        predecessorIds: t.predecessorIds.map(id => taskIdMap.get(id) || id),
        o365TaskId: null,
        o365CalendarEventId: null
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
      assignedConsultantId: config.copyAssignments ? t.assignedConsultantId : null,
      o365TaskId: null,
      o365CalendarEventId: null
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
      predecessorIds: t.predecessorIds.map(id => taskIdMap.get(id) || id),
      o365TaskId: null,
      o365CalendarEventId: null
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
  const handleAddConsultant = async (cData: Omit<Consultant, 'id'>) => {
    // Hash password if provided as plaintext via the form
    let passwordHash = cData.passwordHash;
    if (!passwordHash) {
      passwordHash = await hashPassword('password'); // default password
    }
    const newConsultant: Consultant = {
      ...cData,
      id: `c-${Math.random().toString(36).substring(2, 9)}`,
      passwordHash,
      mustResetPassword: true
    };
    await saveConsultantsState([...consultants, newConsultant]);
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

  // Configuration Setup Handlers
  const handleUpdateO365Config = (config: O365Config) => {
    setO365Config(config);
    localStorage.setItem('pinnacle_o365config', JSON.stringify(config));
  };

  // Database backups: JSON imports / exports
  const handleExportData = () => {
    const db = {
      projects,
      tasks,
      consultants,
      o365Config
    };
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pinnacle_db_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    addToast('Database backup triggered successfully.', 'success');
  };

  const handleImportData = (jsonData: string): boolean => {
    try {
      const db = JSON.parse(jsonData);
      if (db.projects && db.tasks && db.consultants && db.o365Config) {
        saveProjectsState(db.projects);
        saveConsultantsState(db.consultants);
        saveTasksState(db.tasks);
        handleUpdateO365Config(db.o365Config);
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
        const initialScheduledTasks = calculateTaskSchedules(initialProjects[0].startDate, defaultTasks);
        
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
    
    localStorage.setItem('pinnacle_o365config', JSON.stringify(defaultO365Config));
    localStorage.setItem('pinnacle_theme', 'light');

    setO365Config(defaultO365Config);
    setMicrosoftAccount(null);
    setTheme('light');
    setIsAuthenticated(false);
    setActiveUserId('admin');
    localStorage.removeItem('pinnacle_session');
    localStorage.removeItem('pinnacle_activeuser');
  };

  const handleLoginSuccess = (userId: string) => {
    const sessionToken = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    setIsAuthenticated(true);
    setActiveUserId(userId);
    localStorage.setItem('pinnacle_session', sessionToken);
    localStorage.setItem('pinnacle_activeuser', userId);
    setActiveTab('dashboard');
    // Check if user needs password reset
    const consultant = consultants.find(c => c.id === userId);
    if (consultant && consultant.mustResetPassword) {
      setResetUserId(userId);
      setShowPasswordReset(true);
    }
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
            o365Config={o365Config}
            onSelectProject={(id) => {
              setSelectedProjectId(id);
              setActiveTab('projects');
            }}
            onUpdateTask={handleUpdateTask}
            onAddToast={addToast}
          />
        );
      case 'projects':
        return (
          <ProjectView 
            projects={filteredProjects}
            tasks={tasks}
            consultants={consultants}
            o365Config={o365Config}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
            onCreateProject={handleCreateProject}
            onUpdateProject={handleUpdateProject}
            onDeleteProject={handleDeleteProject}
            onCreateTask={handleCreateTask}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
            onBulkUpdateTasks={handleBulkUpdateTasks}
            onBulkDeleteTasks={handleBulkDeleteTasks}
            onAddToast={addToast}
            projectTemplates={projectTemplates}
            onDuplicateProject={handleDuplicateProject}
            onSaveAsTemplate={handleSaveAsTemplate}
            activeUserId={activeUserId}
          />
        );
      case 'gantt':
        return (
          <GanttChart 
            activeProject={filteredProjects.find(p => p.id === selectedProjectId) || null}
            tasks={tasks}
            consultants={consultants}
          />
        );
      case 'settings':
        return (
          <Settings 
            consultants={consultants}
            o365Config={o365Config}
            microsoftAccount={microsoftAccount}
            activeUserTier={activeUserTier}
            onAddConsultant={handleAddConsultant}
            onDeleteConsultant={handleDeleteConsultant}
            onUpdateConsultant={(updated: Consultant) => {
              saveConsultantsState(consultants.map(c => c.id === updated.id ? updated : c));
            }}
            onUpdateO365Config={handleUpdateO365Config}
            onMicrosoftLoginSuccess={setMicrosoftAccount}
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
      <div className="app-container">
        {/* Password Reset Modal */}
        {showPasswordReset && (
          <PasswordReset
            userId={resetUserId}
            consultants={consultants}
            onPasswordReset={(newPass) => {
              // Update consultant password and reset flag
              // Hash the new password before storing
              hashPassword(newPass).then(hash => {
                const updatedConsultants = consultants.map(c =>
                  c.id === resetUserId ? { ...c, passwordHash: hash, mustResetPassword: false } : c
                );
                saveConsultantsState(updatedConsultants);
                addToast('Password reset successfully.', 'success');
              });
              setShowPasswordReset(false);
            }}
            onCancel={() => setShowPasswordReset(false)}
          />
        )}
      {/* Sidebar navigation */}
      <aside className="sidebar">
        <div>
          <div className="brand-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2rem', padding: '0.5rem 0' }}>
            <Logo style={{ height: '28px', width: 'auto' }} />
          </div>

          {/* User Profile Card */}
          <div style={{ padding: '0.75rem', marginBottom: '1.75rem', display: 'flex', alignItems: 'center', gap: '0.85rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)' }}>
            {activeConsultant?.tier === 'admin' ? (
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
                AD
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
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {activeConsultant?.name || 'User'}
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>
                {activeConsultant?.role || 'Consultant'}
              </span>
            </div>
          </div>

          <nav>
            <ul className="nav-list">
              <li 
                className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => setActiveTab('dashboard')}
              >
                <LayoutDashboard size={18} />
                <span>Dashboard</span>
              </li>
              <li 
                className={`nav-item ${activeTab === 'projects' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('projects');
                }}
              >
                <FolderKanban size={18} />
                <span>Projects</span>
              </li>
              <li 
                className={`nav-item ${activeTab === 'gantt' ? 'active' : ''}`}
                onClick={() => setActiveTab('gantt')}
              >
                <CalendarDays size={18} />
                <span>Gantt Chart</span>
              </li>
              <li 
                className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
                onClick={() => setActiveTab('settings')}
              >
                <SettingsIcon size={18} />
                <span>Settings</span>
              </li>
            </ul>
          </nav>
        </div>

        {/* Microsoft authentication badge indicator in sidebar bottom */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
          {microsoftAccount ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', fontSize: '0.75rem', fontWeight: 600, padding: '0 0.5rem' }}>
              <ShieldCheck size={14} />
              <span>O365 Synced</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-tertiary)', fontSize: '0.75rem', padding: '0 0.5rem' }}>
              <Info size={14} />
              <span>Offline Mode</span>
            </div>
          )}
          <button 
            className="btn btn-secondary btn-icon"
            style={{ width: '100%', padding: '0.45rem', borderRadius: 'var(--radius-md)' }}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            <span style={{ fontSize: '0.78rem', marginLeft: '0.25rem' }}>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
          <button 
            className="btn btn-secondary btn-icon"
            style={{ width: '100%', padding: '0.45rem', color: 'var(--danger)', borderColor: 'var(--border-color)', borderRadius: 'var(--radius-md)' }}
            onClick={handleLogout}
          >
            <LogOut size={14} />
            <span style={{ fontSize: '0.78rem', marginLeft: '0.25rem' }}>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Panel Viewport */}
      <main className="main-content">
        <header className="header">
          <div className="page-title-section">
            <h1 style={{ fontSize: '1.3rem', textTransform: 'capitalize', letterSpacing: '-0.02em' }}>
              {activeTab}
            </h1>
            <span className="page-subtitle">
              {activeTab === 'dashboard' && 'Aggregate metrics and project statuses'}
              {activeTab === 'projects' && 'Build and organize hierarchical implementation tasks'}
              {activeTab === 'gantt' && 'Chronological business day scheduler and dependency chart'}
              {activeTab === 'settings' && 'Manage integration keys and consultant team details'}
            </span>
          </div>
        </header>

        <div className="content-pane">
          {renderContent()}
        </div>
      </main>

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
