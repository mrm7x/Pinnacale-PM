export type Tier = 'admin' | 'project_manager' | 'consultant' | 'read_only';

export const canCreateProject = (tier: Tier) => tier === 'admin' || tier === 'project_manager';
export const canEditProject = (tier: Tier) => tier === 'admin' || tier === 'project_manager';
export const canDeleteProject = (tier: Tier) => tier === 'admin' || tier === 'project_manager'; // adjust if needed
export const canCreateTask = (tier: Tier) => tier !== 'read_only';
export const canEditTask = (tier: Tier) => tier !== 'read_only';
export const canDeleteTask = (tier: Tier) => tier === 'admin' || tier === 'project_manager';
export const canManageUsers = (tier: Tier) => tier === 'admin';
export const canEditUsers = (tier: Tier) => tier === 'admin' || tier === 'project_manager';
