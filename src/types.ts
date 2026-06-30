/** Internal user roles. Drives project/task capabilities (see permissions.ts). */
export type Role = 'Manager' | 'Project Manager' | 'Consultant' | 'Read only';

/** Admin-power axis (orthogonal to role). Customers are always 'normal'. */
export type Tier = 'superuser' | 'admin' | 'normal';

/** Which profile table the signed-in user resolves to. */
export type ActorType = 'internal' | 'customer';

/**
 * Unified view of the active user, regardless of which table they came from.
 * Permission helpers consume this so callers don't need to branch on actorType.
 */
export interface ActiveUser {
  id: string;
  name: string;
  email: string;
  role: Role | 'Customer';   // 'Customer' only when actorType === 'customer'
  tier: Tier;
  actorType: ActorType;
  avatarColor: string;       // for UI rendering (avatar badges, hero)
}

export interface Consultant {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarColor: string;
  tier: Tier;
}

/**
 * External party. Lives in a separate `customers` table; authenticates via the
 * same Supabase Auth flow as consultants. tier is forced to 'normal' by a DB
 * CHECK constraint — a customer can never be admin/superuser.
 */
export interface Customer {
  id: string;
  name: string;
  email: string;
  company?: string | null;
  avatarColor: string;
  tier: Tier;                // always 'normal'
}

export interface Project {
  id: string;
  name: string;
  clientName: string;
  description: string;
  budgetDays: number; // In days (e.g., 20.5)
  startDate: string; // YYYY-MM-DD
  targetGoLiveDate?: string; // YYYY-MM-DD
  consultantIds: string[]; // Keep for legacy / fallback
  projectManagerId?: string | null;
  leadConsultantId?: string | null;
  customerId?: string | null;
  projectResourceIds?: string[]; // New replacement for consultantIds
  trelloLink?: string | null;
  sharepointLink?: string | null;
  sageCrmLink?: string | null;
  ragScope?: string;
  ragSchedule?: string;
  ragCosts?: string;
  ragBenefits?: string;
  ragOverall?: string;
  ragScopeReason?: string;
  ragScheduleReason?: string;
  ragCostsReason?: string;
  ragBenefitsReason?: string;
  ragOverallReason?: string;
  ragScopeRisks?: { id: string; text: string; done: boolean }[];
  ragScheduleRisks?: { id: string; text: string; done: boolean }[];
  ragCostsRisks?: { id: string; text: string; done: boolean }[];
  ragBenefitsRisks?: { id: string; text: string; done: boolean }[];
  ragOverallRisks?: { id: string; text: string; done: boolean }[];
  status: 'new' | 'in progress' | 'on hold' | 'completed' | 'cancelled';
  phase?: string | null; // Human-readable delivery phase (e.g. 'Discovery', 'Implementation', 'Hypercare')
  createdAt: string;
  isTemplate?: boolean;
  icon?: string;
  colorTheme?: string;
}

export interface Communication {
  id: string;
  projectId: string;
  subject: string;
  type: 'Teams call' | 'email' | 'in person meeting';
  description: string;
  creatorId: string | null;
  createdAt: string;
  noteType?: 'decision' | 'risk' | 'action' | 'update' | 'idea';
  pinned?: boolean;
}

export interface Task {
  id: string;
  projectId: string;
  parentId: string | null; // For subtasks
  name: string;
  description: string;
  durationDays: number; // e.g., 0.5, 1.0, 2.5
  assignedConsultantId: string | null;
  predecessorIds: string[]; // Dependencies
  status: 'not_started' | 'in_progress' | 'completed' | 'on_hold';
  pinkNumber?: string;
  sortOrder?: number;
  customStartDate?: string | null;
  progress?: number; // 0-100, stored on leaf tasks; parents compute a rollup
  dueDate?: string | null; // YYYY-MM-DD; when set & durationDays === 0, duration is derived
  taskOwner?: 'Pinnacle' | 'Customer' | 'Pinnacle/Customer'; // default 'Pinnacle'; Customer days don't count to budget
  
  // Computed scheduling fields (dynamically calculated)
  plannedStartDate?: string; // YYYY-MM-DD
  plannedEndDate?: string; // YYYY-MM-DD
  startHalfDay?: number;
  endHalfDay?: number;
}

// ---------------------------------------------------------------------------
// Task views — saved column / filter / font configurations for the Tasks page.
// Scoped per user + per project, persisted to localStorage.
// ---------------------------------------------------------------------------

export type StatusFilter = 'all' | 'not_started' | 'in_progress' | 'on_hold' | 'completed';
export type OwnerFilter = 'all' | 'pinnacle' | 'customer' | 'shared';
export type TaskViewMode = 'list' | 'kanban';
export type KanbanGroupMode = 'status' | 'parent' | 'assignee';

/** Identifiers for the columns rendered in the Tasks list. `name` is always shown. */
export type TaskColumnId = 'name' | 'assignee' | 'duration' | 'start' | 'due' | 'progress' | 'status';

export interface TaskView {
  id: string;
  name: string;
  columns: TaskColumnId[];        // ordered list of visible columns
  hideCompleted: boolean;
  ownerFilter: OwnerFilter;
  assigneeFilter: string;         // 'all' | 'unassigned' | <consultantId>
  statusFilter: StatusFilter;
  onlyMine: boolean;
  viewMode: TaskViewMode;
  kanbanGroupMode: KanbanGroupMode;
  fontScale: number;              // 1 = default; 0.8–1.5 range
  isBuiltIn?: boolean;            // the seeded "Default View" cannot be deleted
}
