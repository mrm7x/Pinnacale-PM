export type Tier = 'superuser' | 'admin' | 'normal';

export const canCreateProject = (role: string) => role === 'Manager' || role === 'Project Manager';
export const canEditProject = (role: string) => role !== 'Read only';
export const canDeleteProject = (role: string) => role === 'Manager' || role === 'Project Manager';
export const canCreateTask = (role: string) => role !== 'Read only';
export const canEditTask = (role: string) => role !== 'Read only';
export const canDeleteTask = (role: string) => role === 'Manager' || role === 'Project Manager' || role === 'Lead Consultant';
export const canManageUsers = (tier: Tier) => tier === 'superuser' || tier === 'admin';
export const canEditUsers = (tier: Tier) => tier === 'superuser' || tier === 'admin';
export const canManageDatabase = (tier: Tier) => tier === 'superuser';
