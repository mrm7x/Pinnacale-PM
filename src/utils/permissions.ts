import type { ActiveUser, Consultant, Tier, Project, Task } from '../types';

// Re-export the canonical types for callers that import from here.
export type { ActiveUser, Tier };

// ---------------------------------------------------------------------------
// ActiveUser construction
// ---------------------------------------------------------------------------

export function activeUserFromConsultant(c: Consultant): ActiveUser {
  return { id: c.id, name: c.name, email: c.email, role: c.role, tier: c.tier, actorType: 'internal', avatarColor: c.avatarColor };
}

export function activeUserFromCustomer(c: {
  id: string; name: string; email: string; avatarColor: string; tier: Tier; company?: string | null;
}): ActiveUser {
  return { id: c.id, name: c.name, email: c.email, role: 'Customer', tier: c.tier, actorType: 'customer', avatarColor: c.avatarColor };
}

// ---------------------------------------------------------------------------
// Identity predicates
// ---------------------------------------------------------------------------

export const isCustomer = (user: ActiveUser | null | undefined): boolean =>
  !!user && user.actorType === 'customer';

export const isAdmin = (user: ActiveUser | null | undefined): boolean =>
  !!user && user.actorType === 'internal' && (user.tier === 'superuser' || user.tier === 'admin');

export const isSuperuser = (user: ActiveUser | null | undefined): boolean =>
  !!user && user.actorType === 'internal' && user.tier === 'superuser';

export const isManager = (user: ActiveUser | null | undefined): boolean =>
  !!user && user.actorType === 'internal' && (user.role === 'Manager' || user.role === 'Project Manager');

export const isReadOnly = (user: ActiveUser | null | undefined): boolean =>
  !!user && user.actorType === 'internal' && user.role === 'Read only';

// ---------------------------------------------------------------------------
// Project membership / visibility
// ---------------------------------------------------------------------------

/** Is the user the assigned customer on this project? */
export function isProjectCustomer(user: ActiveUser | null | undefined, project: Project): boolean {
  if (!user) return false;
  if (user.actorType !== 'customer') return false;
  return (project.customerId ?? null) === user.id;
}

/** Is the user the lead consultant or PM of this project? */
export function isProjectLead(user: ActiveUser | null | undefined, project: Project): boolean {
  if (!user || user.actorType !== 'internal') return false;
  return project.leadConsultantId === user.id || project.projectManagerId === user.id;
}

/** Is the user a member (resource/lead/PM) of this project? */
export function isProjectMember(user: ActiveUser | null | undefined, project: Project): boolean {
  if (!user || user.actorType !== 'internal') return false;
  if (isProjectLead(user, project)) return true;
  const resources = project.projectResourceIds ?? [];
  const legacy = project.consultantIds ?? [];
  return resources.includes(user.id) || legacy.includes(user.id);
}

/** Can the user SEE this project? (mirrors the projects SELECT RLS policy) */
export function canSeeProject(user: ActiveUser | null | undefined, project: Project): boolean {
  if (!user) return false;
  // Managers/PMs and read-only internals see all projects.
  if (user.actorType === 'internal' && (isManager(user) || isReadOnly(user))) return true;
  // Admins see all.
  if (isAdmin(user)) return true;
  // Consultants see projects they're a member of.
  if (isProjectMember(user, project)) return true;
  // Customers see only the project they're the customer of.
  if (isProjectCustomer(user, project)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Project mutation permissions
// ---------------------------------------------------------------------------

export function canCreateProject(user: ActiveUser | null | undefined): boolean {
  if (isManager(user)) return true;
  if (isAdmin(user)) return true;
  return false;
}

export function canEditProject(user: ActiveUser | null | undefined, project: Project): boolean {
  if (isManager(user)) return true;
  if (isAdmin(user)) return true;
  if (isProjectLead(user, project)) return true;
  if (isProjectMember(user, project)) return true;
  return false;
}

export function canDeleteProject(user: ActiveUser | null | undefined): boolean {
  if (isManager(user)) return true;
  if (isAdmin(user)) return true;
  return false;
}

export function canDuplicateProject(user: ActiveUser | null | undefined): boolean {
  if (isManager(user)) return true;
  if (isAdmin(user)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// RAG / project health
// ---------------------------------------------------------------------------

/** Who can edit project health (RAG)? Managers/PMs, admins, the project lead, or any member. */
export function canManageRag(user: ActiveUser | null | undefined, project?: Project): boolean {
  if (isManager(user)) return true;
  if (isAdmin(user)) return true;
  if (project) {
    if (isProjectLead(user, project)) return true;
    if (isProjectMember(user, project)) return true;
  }
  return false;
}

/** Who can SEE project health? Never customers. */
export function canSeeRag(user: ActiveUser | null | undefined): boolean {
  return !isCustomer(user);
}

// ---------------------------------------------------------------------------
// Communications / project notes
// ---------------------------------------------------------------------------

export function canManageCommunications(user: ActiveUser | null | undefined, project: Project): boolean {
  if (isManager(user)) return true;
  if (isAdmin(user)) return true;
  if (isProjectLead(user, project)) return true;
  // Internal members (non-customer) may add notes.
  return isProjectMember(user, project);
}

// ---------------------------------------------------------------------------
// Task permissions
// ---------------------------------------------------------------------------

export function canCreateTask(user: ActiveUser | null | undefined, project: Project): boolean {
  if (isManager(user)) return true;
  if (isAdmin(user)) return true;
  if (isProjectLead(user, project)) return true;
  if (isProjectMember(user, project)) return true;
  return false;
}

/**
 * Can the user edit this task?
 *  - managers/PMs       -> any task
 *  - admin/superuser    -> any task
 *  - project lead       -> any task on their project
 *  - resource consultant-> any task on the project they're a member of
 *  - customer on project-> only customer-owned tasks (task_owner Customer | Pinnacle/Customer)
 */
export function canEditTask(
  user: ActiveUser | null | undefined,
  task: Task,
  project: Project
): boolean {
  if (!user) return false;
  if (isManager(user)) return true;
  if (isAdmin(user)) return true;
  if (isProjectLead(user, project)) return true;

  if (user.actorType === 'internal') {
    // Resource consultant: any task on the project they're a member of.
    if (isProjectMember(user, project)) return true;
    return false;
  }

  // Customer: only customer-owned tasks on the project they own.
  if (isProjectCustomer(user, project)) {
    const owner = task.taskOwner ?? 'Pinnacle';
    return owner === 'Customer' || owner === 'Pinnacle/Customer';
  }

  return false;
}

export function canDeleteTask(
  user: ActiveUser | null | undefined,
  _task: Task,
  project: Project
): boolean {
  if (isManager(user)) return true;
  if (isAdmin(user)) return true;
  if (isProjectLead(user, project)) return true;
  if (isProjectMember(user, project)) return true;
  return false;
}

/** Convenience: can the user edit ANY task on this project (for bulk actions)? */
export function canEditAnyTask(user: ActiveUser | null | undefined, project: Project): boolean {
  if (isManager(user)) return true;
  if (isAdmin(user)) return true;
  if (isProjectLead(user, project)) return true;
  if (isProjectMember(user, project)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Gantt — customers always view-only.
// ---------------------------------------------------------------------------

export function canEditGantt(user: ActiveUser | null | undefined): boolean {
  if (isCustomer(user)) return false;
  // Read-only role can never edit — unless tier grants admin powers (most permissive wins).
  if (isReadOnly(user) && !isAdmin(user)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// User / customer management (tier axis). Mirrors the old helpers.
// ---------------------------------------------------------------------------

export const canManageUsers = (tier: Tier | undefined): boolean =>
  tier === 'superuser' || tier === 'admin';

export const canEditUsers = (tier: Tier | undefined): boolean =>
  tier === 'superuser' || tier === 'admin';

export const canManageDatabase = (tier: Tier | undefined): boolean =>
  tier === 'superuser';

/** Only admins can manage customers (create/edit/delete external parties). */
export const canManageCustomers = (user: ActiveUser | null | undefined): boolean =>
  isAdmin(user);
