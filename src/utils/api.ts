import { getSupabaseClient, isSupabaseConfigured } from './supabase';
import type { Project, Task, Consultant } from '../types';

// Helper translations: database (snake_case) <-> client (camelCase)

function mapProjectFromDb(db: any): Project {
  return {
    id: db.id,
    name: db.name,
    clientName: db.client_name,
    description: db.description || '',
    budgetDays: Number(db.budget_days),
    startDate: db.start_date,
    targetGoLiveDate: db.target_go_live_date || undefined,
    consultantIds: db.consultant_ids || [],
    isTemplate: !!db.is_template,
    createdAt: db.created_at
  };
}

function mapProjectToDb(p: Project) {
  return {
    id: p.id,
    name: p.name,
    client_name: p.clientName,
    description: p.description,
    budget_days: p.budgetDays,
    start_date: p.startDate,
    target_go_live_date: p.targetGoLiveDate || '',
    consultant_ids: p.consultantIds,
    is_template: !!p.isTemplate,
    created_at: p.createdAt
  };
}

function mapTaskFromDb(db: any): Task {
  return {
    id: db.id,
    projectId: db.project_id,
    parentId: db.parent_id || null,
    name: db.name,
    description: db.description || '',
    durationDays: Number(db.duration_days),
    assignedConsultantId: db.assigned_consultant_id || null,
    predecessorIds: db.predecessor_ids || [],
    status: db.status,
    o365TaskId: db.o365_task_id || null,
    o365CalendarEventId: db.o365_calendar_event_id || null,
    plannedStartDate: db.planned_start_date || null,
    plannedEndDate: db.planned_end_date || null,
    startHalfDay: Number(db.start_half_day),
    endHalfDay: Number(db.end_half_day),
    pinkNumber: db.pink_number || '',
    billed: !!db.billed,
    sortOrder: db.sort_order ? Number(db.sort_order) : 0,
    customStartDate: db.custom_start_date || null
  };
}

function mapTaskToDb(t: Task) {
  return {
    id: t.id,
    project_id: t.projectId,
    parent_id: t.parentId,
    name: t.name,
    description: t.description,
    duration_days: t.durationDays,
    assigned_consultant_id: t.assignedConsultantId,
    predecessor_ids: t.predecessorIds,
    status: t.status,
    o365_task_id: t.o365TaskId,
    o365_calendar_event_id: t.o365CalendarEventId,
    planned_start_date: t.plannedStartDate,
    planned_end_date: t.plannedEndDate,
    start_half_day: t.startHalfDay,
    end_half_day: t.endHalfDay,
    pink_number: t.pinkNumber || '',
    billed: !!t.billed,
    sort_order: t.sortOrder || 0,
    custom_start_date: t.customStartDate || null
  };
}

function mapConsultantFromDb(db: any): Consultant {
  return {
    id: db.id,
    name: db.name,
    email: db.email,
    role: db.role,
    avatarColor: db.avatar_color,
    tier: db.tier as any,
    passwordHash: db.password_hash || undefined,
    mustResetPassword: !!db.must_reset_password
  };
}

function mapConsultantToDb(c: Consultant) {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    role: c.role,
    avatar_color: c.avatarColor,
    tier: c.tier,
    password_hash: c.passwordHash || null,
    must_reset_password: c.mustResetPassword
  };
}

// Service definition
export const api = {
  projects: {
    getAll: async (): Promise<Project[]> => {
      if (isSupabaseConfigured()) {
        const client = getSupabaseClient() as any;
        const { data, error } = await client.from('projects').select('*').order('created_at', { ascending: true });
        if (error) throw error;
        return (data || []).map(mapProjectFromDb);
      } else {
        const saved = localStorage.getItem('pinnacle_projects');
        return saved ? JSON.parse(saved) : [];
      }
    },
    save: async (project: Project): Promise<void> => {
      if (isSupabaseConfigured()) {
        const client = getSupabaseClient() as any;
        const { error } = await client.from('projects').upsert(mapProjectToDb(project));
        if (error) throw error;
      } else {
        // Handled collectively by state setters in App.tsx fallback
      }
    },
    saveAll: async (projectsList: Project[]): Promise<void> => {
      if (isSupabaseConfigured()) {
        const client = getSupabaseClient() as any;
        const { error } = await client.from('projects').upsert(projectsList.map(mapProjectToDb));
        if (error) throw error;
      }
    },
    delete: async (id: string): Promise<void> => {
      if (isSupabaseConfigured()) {
        const client = getSupabaseClient() as any;
        const { error } = await client.from('projects').delete().eq('id', id);
        if (error) throw error;
      }
    }
  },

  tasks: {
    getAll: async (): Promise<Task[]> => {
      if (isSupabaseConfigured()) {
        const client = getSupabaseClient() as any;
        const { data, error } = await client.from('tasks').select('*');
        if (error) throw error;
        return (data || []).map(mapTaskFromDb);
      } else {
        const saved = localStorage.getItem('pinnacle_tasks');
        return saved ? JSON.parse(saved) : [];
      }
    },
    save: async (task: Task): Promise<void> => {
      if (isSupabaseConfigured()) {
        const client = getSupabaseClient() as any;
        const { error } = await client.from('tasks').upsert(mapTaskToDb(task));
        if (error) throw error;
      }
    },
    saveAll: async (tasksList: Task[]): Promise<void> => {
      if (isSupabaseConfigured()) {
        const client = getSupabaseClient() as any;
        const { error } = await client.from('tasks').upsert(tasksList.map(mapTaskToDb));
        if (error) throw error;
      }
    },
    delete: async (id: string): Promise<void> => {
      if (isSupabaseConfigured()) {
        const client = getSupabaseClient() as any;
        const { error } = await client.from('tasks').delete().eq('id', id);
        if (error) throw error;
      }
    },
    deleteMultiple: async (ids: string[]): Promise<void> => {
      if (isSupabaseConfigured()) {
        const client = getSupabaseClient() as any;
        const { error } = await client.from('tasks').delete().in('id', ids);
        if (error) throw error;
      }
    }
  },

  consultants: {
    getAll: async (): Promise<Consultant[]> => {
      if (isSupabaseConfigured()) {
        const client = getSupabaseClient() as any;
        const { data, error } = await client.from('consultants').select('*').order('name', { ascending: true });
        if (error) throw error;
        return (data || []).map(mapConsultantFromDb);
      } else {
        const saved = localStorage.getItem('pinnacle_consultants');
        return saved ? JSON.parse(saved) : [];
      }
    },
    save: async (consultant: Consultant): Promise<void> => {
      if (isSupabaseConfigured()) {
        const client = getSupabaseClient() as any;
        const { error } = await client.from('consultants').upsert(mapConsultantToDb(consultant));
        if (error) throw error;
      }
    },
    saveAll: async (consultantsList: Consultant[]): Promise<void> => {
      if (isSupabaseConfigured()) {
        const client = getSupabaseClient() as any;
        const { error } = await client.from('consultants').upsert(consultantsList.map(mapConsultantToDb));
        if (error) throw error;
      }
    },
    delete: async (id: string): Promise<void> => {
      if (isSupabaseConfigured()) {
        const client = getSupabaseClient() as any;
        const { error } = await client.from('consultants').delete().eq('id', id);
        if (error) throw error;
      }
    }
  }
};
