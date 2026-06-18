import type { Project } from '../types';

// Canonical phase definitions: one solid accent color per phase.
// This is the single source of truth for phase colors across the app.
export interface PhaseMeta {
  /** Solid accent hex used for borders, buttons, icons, etc. */
  accent: string;
  /** Soft translucent background tint (rgba) for badges/pills. */
  bg: string;
  /** Readable text color for use on top of `bg`. */
  text: string;
  /** Human-readable label. */
  label: string;
}

export const PHASES: Record<string, PhaseMeta> = {
  'Discovery':      { accent: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)',  text: '#3b82f6', label: 'Discovery' },
  'Planning':       { accent: '#6b7280', bg: 'rgba(107, 114, 128, 0.12)', text: '#6b7280', label: 'Planning' },
  'Implementation': { accent: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)',  text: '#8b5cf6', label: 'Implementation' },
  'Testing':        { accent: '#0ea5e9', bg: 'rgba(14, 165, 233, 0.12)',   text: '#0ea5e9', label: 'Testing' },
  'Hypercare':      { accent: '#10b981', bg: 'rgba(16, 185, 129, 0.12)',  text: '#10b981', label: 'Hypercare' },
  'Support':        { accent: '#14b8a6', bg: 'rgba(20, 184, 166, 0.12)',  text: '#14b8a6', label: 'Support' }
};

/** Fallback phase derived from status when no explicit phase is set. */
const STATUS_FALLBACK: Record<string, string> = {
  'new': 'Discovery',
  'in progress': 'Implementation',
  'completed': 'Hypercare'
};

export const PHASE_ORDER = ['Discovery', 'Planning', 'Implementation', 'Testing', 'Hypercare', 'Support'];

/** Resolve the effective phase label for a project (explicit phase, or status-derived fallback). */
export function resolvePhase(project: { phase?: string | null; status?: string }): string {
  if (project.phase && PHASES[project.phase]) return project.phase;
  if (project.phase) return project.phase; // respect custom phase labels even if not in PHASES
  return STATUS_FALLBACK[project.status || ''] || 'Planning';
}

/** Resolve the metadata (accent/bg/text/label) for a project's effective phase. */
export function resolvePhaseMeta(project: { phase?: string | null; status?: string }): PhaseMeta {
  const phase = resolvePhase(project);
  return PHASES[phase] || { accent: '#6b7280', bg: 'rgba(107, 114, 128, 0.12)', text: '#6b7280', label: phase };
}

/**
 * The accent color for a project. Linked to the project's phase so that every
 * phase has a consistent identity. Falls back to the app primary blue.
 */
export function getProjectAccent(project: { phase?: string | null; status?: string; colorTheme?: string | null }): string {
  return resolvePhaseMeta(project).accent;
}
