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
  consultantIds: string[]; // List of consultant IDs assigned
  createdAt: string;
  isTemplate?: boolean;
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
  billed?: boolean;
  sortOrder?: number;
  
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
