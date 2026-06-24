export interface Consultant {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarColor: string;
  tier: 'superuser' | 'admin' | 'normal';
  passwordHash?: string;
  mustResetPassword?: boolean;
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
  o365TaskId?: string | null;
  o365CalendarEventId?: string | null;
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

export interface O365Config {
  clientId: string;
  tenantId: string;
  redirectUri: string;
  todoListName: string;
  isEnabled: boolean;
}
