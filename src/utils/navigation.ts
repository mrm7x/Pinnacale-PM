import { LayoutDashboard, ListChecks, GanttChartSquare, Gauge, MessageSquareText, CalendarDays } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// The views inside a project. 'tasks' is the legacy task list, kept in the
// type so old code paths still compile; it has no tab of its own.
export type ProjectTab = 'overview' | 'tasks' | 'tasks-v2' | 'gantt' | 'availability' | 'rag' | 'communications';

export interface ProjectTabDef {
  id: ProjectTab;
  label: string;
  icon: LucideIcon;
  customerHidden?: boolean;
}

// Single source of truth for the project tabs, so the in-page tab bar and the
// project-aware sidebar always list the same views in the same order.
export const PROJECT_TABS: ProjectTabDef[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'tasks-v2', label: 'Tasks', icon: ListChecks },
  { id: 'gantt', label: 'Gantt', icon: GanttChartSquare },
  { id: 'availability', label: 'Holiday / Availability', icon: CalendarDays, customerHidden: true },
  { id: 'rag', label: 'RAG', icon: Gauge, customerHidden: true },
  { id: 'communications', label: 'Project notes', icon: MessageSquareText, customerHidden: true },
];

export const visibleProjectTabs = (isCustomer: boolean) =>
  PROJECT_TABS.filter(t => !(t.customerHidden && isCustomer));

// Which navigation chrome the app uses. Browser-local, like the theme.
export type NavLayout = 'sidebar' | 'topbar';
const NAV_LAYOUT_KEY = 'pinnacle_nav_layout';

// Top bar is the default; the sidebar is opt-in from Settings.
export const getNavLayout = (): NavLayout =>
  localStorage.getItem(NAV_LAYOUT_KEY) === 'sidebar' ? 'sidebar' : 'topbar';

export const saveNavLayout = (layout: NavLayout) => localStorage.setItem(NAV_LAYOUT_KEY, layout);

// Projects the user actually opened, most recent first. Replaces the old
// "Recent projects" list, which was really "newest by creation date".
const RECENT_KEY = 'pinnacle_recent_projects';
const RECENT_MAX = 8;

export const getRecentProjectIds = (): string[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

export const withRecentProject = (list: string[], id: string): string[] =>
  [id, ...list.filter(x => x !== id)].slice(0, RECENT_MAX);

export const saveRecentProjectIds = (ids: string[]) => localStorage.setItem(RECENT_KEY, JSON.stringify(ids));

export const ragDotColor = (rag?: string | null) => {
  const r = (rag || 'green').toLowerCase();
  if (r === 'red') return 'var(--danger)';
  if (r === 'amber') return 'var(--warning)';
  return 'var(--success)';
};
