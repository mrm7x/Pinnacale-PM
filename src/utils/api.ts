import { getSupabaseClient, isSupabaseConfigured } from './supabase';
import type { Project, Task, Consultant, Communication, Customer, ProjectAvailability, AvailabilityCode } from '../types';

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
    projectManagerId: db.project_manager_id,
    leadConsultantId: db.lead_consultant_id,
    customerId: db.customer_id,
    projectResourceIds: db.project_resource_ids || [],
    trelloLink: db.trello_link,
    sharepointLink: db.sharepoint_link,
    sageCrmLink: db.sage_crm_link,
    ragScope: db.rag_scope,
    ragSchedule: db.rag_schedule,
    ragCosts: db.rag_costs,
    ragBenefits: db.rag_benefits,
    ragOverall: db.rag_overall,
    status: db.status || 'new',
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
    project_manager_id: p.projectManagerId || null,
    lead_consultant_id: p.leadConsultantId || null,
    customer_id: p.customerId || null,
    project_resource_ids: p.projectResourceIds || [],
    trello_link: p.trelloLink || null,
    sharepoint_link: p.sharepointLink || null,
    sage_crm_link: p.sageCrmLink || null,
    rag_scope: p.ragScope || 'green',
    rag_schedule: p.ragSchedule || 'green',
    rag_costs: p.ragCosts || 'green',
    rag_benefits: p.ragBenefits || 'green',
    rag_overall: p.ragOverall || 'green',
    status: p.status || 'new',
    is_template: !!p.isTemplate,
    created_at: p.createdAt
  };
}

function mapCommunicationFromDb(db: any): Communication {
  return {
    id: db.id,
    projectId: db.project_id,
    subject: db.subject,
    type: db.type,
    description: db.description || '',
    creatorId: db.creator_id,
    createdAt: db.created_at
  };
}

function mapCommunicationToDb(c: Communication) {
  return {
    id: c.id,
    project_id: c.projectId,
    subject: c.subject,
    type: c.type,
    description: c.description,
    creator_id: c.creatorId,
    created_at: c.createdAt
  };
}

function mapAvailabilityFromDb(db: any): ProjectAvailability {
  const raw: Record<string, string> = db.days && typeof db.days === 'object' ? db.days : {};
  // "Other commitment" was saved as T before its code became O.
  const days = Object.fromEntries(Object.entries(raw).map(([d, c]) => [d, c === 'T' ? 'O' : c]));
  return {
    id: db.id,
    projectId: db.project_id,
    personName: db.person_name,
    sortOrder: Number(db.sort_order) || 0,
    days: days as Record<string, AvailabilityCode>,
  };
}

function mapAvailabilityToDb(a: ProjectAvailability) {
  return {
    id: a.id,
    project_id: a.projectId,
    person_name: a.personName,
    sort_order: a.sortOrder,
    days: a.days,
  };
}

// Offline (no Supabase) storage: every project's rows in one localStorage key.
const AVAILABILITY_KEY = 'pinnacle_availability';
const readLocalAvailability = (): ProjectAvailability[] => {
  try { return JSON.parse(localStorage.getItem(AVAILABILITY_KEY) || '[]'); } catch { return []; }
};
const writeLocalAvailability = (rows: ProjectAvailability[]) =>
  localStorage.setItem(AVAILABILITY_KEY, JSON.stringify(rows));

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
    plannedStartDate: db.planned_start_date || null,
    plannedEndDate: db.planned_end_date || null,
    startHalfDay: Number(db.start_half_day),
    endHalfDay: Number(db.end_half_day),
    pinkNumber: db.pink_number || '',
    sortOrder: db.sort_order ? Number(db.sort_order) : 0,
    customStartDate: db.custom_start_date || null,
    progress: db.progress != null ? Number(db.progress) : 0,
    dueDate: db.due_date || null,
    taskOwner: db.task_owner || 'Pinnacle',
    startPeriod: db.start_period || null
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
    planned_start_date: t.plannedStartDate,
    planned_end_date: t.plannedEndDate,
    start_half_day: t.startHalfDay,
    end_half_day: t.endHalfDay,
    pink_number: t.pinkNumber || '',
    sort_order: t.sortOrder || 0,
    custom_start_date: t.customStartDate || null,
    progress: t.progress ?? 0,
    due_date: t.dueDate || null,
    task_owner: t.taskOwner || 'Pinnacle',
    start_period: t.startPeriod || null
  };
}

function mapConsultantFromDb(db: any): Consultant {
  return {
    id: db.id,
    name: db.name,
    email: db.email,
    role: db.role,
    avatarColor: db.avatar_color,
    tier: db.tier as any
  };
}

function mapConsultantToDb(c: Consultant) {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    role: c.role,
    avatar_color: c.avatarColor,
    tier: c.tier
  };
}

function mapCustomerFromDb(db: any): Customer {
  return {
    id: db.id,
    name: db.name,
    email: db.email,
    company: db.company || null,
    avatarColor: db.avatar_color || '#0d9488',
    tier: 'normal' // forced by DB CHECK constraint; always 'normal'
  };
}

function mapCustomerToDb(c: Customer) {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    company: c.company || null,
    avatar_color: c.avatarColor,
    tier: 'normal'
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
        // Page through every row. An unbounded .select('*') is silently capped
        // by PostgREST's max-rows (1000 by default), which drops whole projects'
        // tasks once the table grows past it. Ordering by id makes the disjoint
        // .range() windows stable.
        // ponytail: full client-side task load; move to per-project fetch if the
        // table gets large enough that paging every task on load hurts.
        const PAGE = 1000;
        const rows: any[] = [];
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await client
            .from('tasks').select('*').order('id', { ascending: true })
            .range(from, from + PAGE - 1);
          if (error) throw error;
          const batch = data || [];
          rows.push(...batch);
          if (batch.length < PAGE) break;
        }
        return rows.map(mapTaskFromDb);
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
    // Real UPDATE (not upsert) for an existing task row. Required for users who
    // have UPDATE-but-not-INSERT RLS rights (e.g. a customer editing a
    // customer-owned task): Postgres evaluates the INSERT policy's WITH CHECK
    // for every row of an `INSERT ... ON CONFLICT DO UPDATE`, so a .upsert()
    // is rejected even when the row exists and the UPDATE policy would allow it.
    update: async (task: Task): Promise<void> => {
      if (isSupabaseConfigured()) {
        const client = getSupabaseClient() as any;
        const { error } = await client.from('tasks').update(mapTaskToDb(task)).eq('id', task.id);
        if (error) throw error;
      }
    },
    updateMultiple: async (tasksList: Task[]): Promise<void> => {
      if (!isSupabaseConfigured()) return;
      const client = getSupabaseClient() as any;
      // Update rows individually so each is subject to the UPDATE policy only
      // (an upsert would also evaluate the INSERT policy and fail for users
      // without insert rights). Sequential keeps it simple and surfaces the
      // first error; task lists per save are small.
      for (const t of tasksList) {
        const { error } = await client.from('tasks').update(mapTaskToDb(t)).eq('id', t.id);
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
  },

  customers: {
    getAll: async (): Promise<Customer[]> => {
      if (isSupabaseConfigured()) {
        const client = getSupabaseClient() as any;
        const { data, error } = await client.from('customers').select('*').order('name', { ascending: true });
        if (error) throw error;
        return (data || []).map(mapCustomerFromDb);
      } else {
        const saved = localStorage.getItem('pinnacle_customers');
        return saved ? JSON.parse(saved) : [];
      }
    },
    save: async (customer: Customer): Promise<void> => {
      if (isSupabaseConfigured()) {
        const client = getSupabaseClient() as any;
        const { error } = await client.from('customers').upsert(mapCustomerToDb(customer));
        if (error) throw error;
      }
    },
    saveAll: async (customersList: Customer[]): Promise<void> => {
      if (isSupabaseConfigured()) {
        const client = getSupabaseClient() as any;
        const { error } = await client.from('customers').upsert(customersList.map(mapCustomerToDb));
        if (error) throw error;
      }
    },
    delete: async (id: string): Promise<void> => {
      if (isSupabaseConfigured()) {
        const client = getSupabaseClient() as any;
        const { error } = await client.from('customers').delete().eq('id', id);
        if (error) throw error;
      }
    }
  },

  availability: {
    getByProject: async (projectId: string): Promise<ProjectAvailability[]> => {
      if (isSupabaseConfigured()) {
        const client = getSupabaseClient() as any;
        const { data, error } = await client.from('project_availability').select('*')
          .eq('project_id', projectId).order('sort_order', { ascending: true });
        if (error) throw error;
        return (data || []).map(mapAvailabilityFromDb);
      }
      return readLocalAvailability()
        .filter(r => r.projectId === projectId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
    },
    saveMany: async (rows: ProjectAvailability[]): Promise<void> => {
      if (rows.length === 0) return;
      if (isSupabaseConfigured()) {
        const client = getSupabaseClient() as any;
        const { error } = await client.from('project_availability').upsert(rows.map(mapAvailabilityToDb));
        if (error) throw error;
        return;
      }
      const ids = new Set(rows.map(r => r.id));
      writeLocalAvailability([...readLocalAvailability().filter(r => !ids.has(r.id)), ...rows]);
    },
    deleteMany: async (ids: string[]): Promise<void> => {
      if (ids.length === 0) return;
      if (isSupabaseConfigured()) {
        const client = getSupabaseClient() as any;
        const { error } = await client.from('project_availability').delete().in('id', ids);
        if (error) throw error;
        return;
      }
      const drop = new Set(ids);
      writeLocalAvailability(readLocalAvailability().filter(r => !drop.has(r.id)));
    }
  },

  communications: {
    getAll: async (): Promise<Communication[]> => {
      if (isSupabaseConfigured()) {
        const client = getSupabaseClient() as any;
        const { data, error } = await client.from('communications').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return (data || []).map(mapCommunicationFromDb);
      } else {
        const saved = localStorage.getItem('pinnacle_communications');
        return saved ? JSON.parse(saved) : [];
      }
    },
    save: async (communication: Communication): Promise<void> => {
      if (isSupabaseConfigured()) {
        const client = getSupabaseClient() as any;
        const { error } = await client.from('communications').upsert(mapCommunicationToDb(communication));
        if (error) throw error;
      }
    },
    delete: async (id: string): Promise<void> => {
      if (isSupabaseConfigured()) {
        const client = getSupabaseClient() as any;
        const { error } = await client.from('communications').delete().eq('id', id);
        if (error) throw error;
      }
    }
  }
};
