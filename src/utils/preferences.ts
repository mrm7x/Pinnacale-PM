// Per-user UI preferences, stored in the browser (localStorage) alongside the
// saved task views. Nothing here is written to Supabase.

/** What the hover "+" on a task-list row does. */
export type QuickAddMode = 'inline' | 'form';

const quickAddKey = (userId: string) => `pinnacle_user_${userId}_quick_add_mode`;

export function getQuickAddMode(userId: string): QuickAddMode {
  try {
    return localStorage.getItem(quickAddKey(userId)) === 'form' ? 'form' : 'inline';
  } catch {
    return 'inline';
  }
}

export function setQuickAddMode(userId: string, mode: QuickAddMode): void {
  try {
    localStorage.setItem(quickAddKey(userId), mode);
  } catch { /* private mode / quota — non-fatal */ }
}
