import type { Task } from '../types';

/**
 * Checks if a date falls on a weekend.
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

/**
 * Formats a Date object to YYYY-MM-DD in local time.
 */
export function formatDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parses a YYYY-MM-DD string into a local Date object.
 */
export function parseDate(dateStr: string): Date {
  const parts = dateStr.split('-');
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

/**
 * Returns a schedule point (date and AM/PM period) given a start date and half-day offset.
 * Skipping weekends (Saturdays and Sundays).
 */
export function getSchedulePoint(startDateStr: string, halfDaysFromStart: number): { date: string; period: 'AM' | 'PM' } {
  let currentDate = parseDate(startDateStr);
  
  // Roll forward to Monday if the project start date falls on a weekend
  while (isWeekend(currentDate)) {
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  let currentPeriod: 'AM' | 'PM' = 'AM';
  
  for (let i = 0; i < halfDaysFromStart; i++) {
    if (currentPeriod === 'AM') {
      currentPeriod = 'PM';
    } else {
      currentPeriod = 'AM';
      currentDate.setDate(currentDate.getDate() + 1);
      while (isWeekend(currentDate)) {
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }
  }
  
  return {
    date: formatDate(currentDate),
    period: currentPeriod
  };
}

/**
 * Detects cycles in task dependencies.
 * Returns true if a cycle is detected.
 */
export function hasCircularDependency(tasks: Task[]): boolean {
  const adjList = new Map<string, string[]>();
  tasks.forEach(t => {
    adjList.set(t.id, t.predecessorIds || []);
  });

  const visited = new Set<string>();
  const recStack = new Set<string>();

  function dfs(taskId: string): boolean {
    if (recStack.has(taskId)) return true;
    if (visited.has(taskId)) return false;

    visited.add(taskId);
    recStack.add(taskId);

    const neighbors = adjList.get(taskId) || [];
    for (const neighbor of neighbors) {
      // Check if neighbor exists in current list of tasks to avoid dead references
      if (adjList.has(neighbor)) {
        if (dfs(neighbor)) return true;
      }
    }

    recStack.delete(taskId);
    return false;
  }

  for (const task of tasks) {
    if (dfs(task.id)) {
      return true;
    }
  }

  return false;
}

/**
 * Calculates the number of working half-days between projectStartDateStr and targetDateStr.
 */
export function getHalfDaysBetween(projectStartDateStr: string, targetDateStr: string): number {
  const projStart = parseDate(projectStartDateStr);
  const target = parseDate(targetDateStr);
  
  if (target <= projStart) return 0;
  
  let current = new Date(projStart);
  let halfDays = 0;
  let period: 'AM' | 'PM' = 'AM';
  
  while (formatDate(current) !== formatDate(target) || period !== 'AM') {
    if (isWeekend(current)) {
      current.setDate(current.getDate() + 1);
      continue;
    }
    
    if (formatDate(current) === formatDate(target)) {
      break;
    }
    
    if (period === 'AM') {
      period = 'PM';
    } else {
      period = 'AM';
      current.setDate(current.getDate() + 1);
    }
    halfDays++;
  }
  
  return halfDays;
}

/**
 * Calculates start and end dates for all tasks based on dependencies, Durations, and Hierarchy.
 * Uses a topological sort to compute scheduling.
 */
export function calculateTaskSchedules(projectStartDate: string, tasks: Task[]): Task[] {
  if (tasks.length === 0) return [];
  
  // 1. Identify leaf vs parent tasks.
  const parentIds = new Set<string>();
  tasks.forEach(t => {
    if (t.parentId) {
      parentIds.add(t.parentId);
    }
  });

  // 2. Clone tasks to avoid mutating state directly
  const scheduledTasks = tasks.map(t => ({
    ...t,
    // Snap to 0.5 increments; allow 0 (means "derive from due date" for leaves).
    durationDays: Math.max(0, Math.round(t.durationDays * 2) / 2),
    predecessorIds: t.predecessorIds || []
  }));

  // Detect cycle
  if (hasCircularDependency(scheduledTasks)) {
    // If cycle exists, schedule everything from project start date as a fallback to avoid crashing
    return scheduledTasks.map(t => {
      const halfDays = Math.round(t.durationDays * 2);
      const startPoint = getSchedulePoint(projectStartDate, 0);
      const endPoint = getSchedulePoint(projectStartDate, Math.max(1, halfDays) - 1);
      return {
        ...t,
        plannedStartDate: startPoint.date,
        plannedEndDate: endPoint.date,
        startHalfDay: 0,
        endHalfDay: Math.max(1, halfDays) - 1
      };
    });
  }

  // 3. Resolve schedule indices (in half-day units).
  // Map of taskId -> { startHalfDay, endHalfDay }
  const scheduleIndices = new Map<string, { start: number; end: number }>();

  // Topological sorting helper
  const resolved = new Set<string>();
  const taskMap = new Map<string, typeof scheduledTasks[0]>();
  scheduledTasks.forEach(t => taskMap.set(t.id, t));

  function resolveTask(taskId: string) {
    if (resolved.has(taskId)) return;

    const task = taskMap.get(taskId);
    if (!task) return;

    // First resolve all predecessors
    task.predecessorIds.forEach(predId => {
      resolveTask(predId);
    });

    const isParent = parentIds.has(taskId);

    if (task.customStartDate) {
      // If a task has an explicit custom start date, it is scheduled independently.
      const customStartHalfDay = getHalfDaysBetween(projectStartDate, task.customStartDate);
      const durationHalfDays = Math.round(task.durationDays * 2);
      const endHalfDay = customStartHalfDay + Math.max(1, durationHalfDays) - 1;
      scheduleIndices.set(taskId, { start: customStartHalfDay, end: endHalfDay });
      
      // If it is a parent task, we also resolve its children so their times bubble up correctly.
      if (isParent) {
        const children = scheduledTasks.filter(t => t.parentId === taskId);
        children.forEach(child => resolveTask(child.id));
      }
    } else if (isParent) {
      // Parents without custom start date will have their indices calculated from their children after children resolve.
      const children = scheduledTasks.filter(t => t.parentId === taskId);
      children.forEach(child => resolveTask(child.id));

      const childIndices = children
        .map(child => scheduleIndices.get(child.id))
        .filter((idx): idx is { start: number; end: number } => idx !== undefined);

      if (childIndices.length > 0) {
        const minStart = Math.min(...childIndices.map(c => c.start));
        const maxEnd = Math.max(...childIndices.map(c => c.end));
        scheduleIndices.set(taskId, { start: minStart, end: maxEnd });
        // Update parent's duration to reflect children's span
        task.durationDays = (maxEnd - minStart + 1) / 2;
      } else {
        // Empty parent: default schedule
        scheduleIndices.set(taskId, { start: 0, end: Math.round(task.durationDays * 2) - 1 });
      }
    } else {
      // Leaf task: start index is max(predecessor.end + 1) or baseline from parent's custom start date.
      let maxPredecessorEnd = -1;

      // Direct predecessors
      task.predecessorIds.forEach(predId => {
        const predIdx = scheduleIndices.get(predId);
        if (predIdx) {
          maxPredecessorEnd = Math.max(maxPredecessorEnd, predIdx.end);
        }
      });

      // Parent predecessors (recursive parent traversal)
      let currentParentId = task.parentId;
      while (currentParentId) {
        const parent = taskMap.get(currentParentId);
        if (parent) {
          parent.predecessorIds.forEach(predId => {
            const predIdx = scheduleIndices.get(predId);
            if (predIdx) {
              maxPredecessorEnd = Math.max(maxPredecessorEnd, predIdx.end);
            }
          });
          currentParentId = parent.parentId;
        } else {
          break;
        }
      }

      // Check if any ancestor has a custom start date as a baseline
      let baselineStart = 0;
      let checkParentId = task.parentId;
      while (checkParentId) {
        const parent = taskMap.get(checkParentId);
        if (parent && parent.customStartDate) {
          baselineStart = getHalfDaysBetween(projectStartDate, parent.customStartDate);
          break;
        }
        checkParentId = parent ? parent.parentId : null;
      }

      const startHalfDay = maxPredecessorEnd === -1 ? baselineStart : Math.max(baselineStart, maxPredecessorEnd + 1);
      let durationHalfDays = Math.round(task.durationDays * 2);
      // If no explicit duration is budgeted (0) and a due date exists, derive the
      // duration from the span between the task's resolved start and its due date.
      if (durationHalfDays === 0 && task.dueDate) {
        const startPoint = getSchedulePoint(projectStartDate, startHalfDay);
        const dueHalfDays = getHalfDaysBetween(projectStartDate, task.dueDate);
        durationHalfDays = Math.max(1, dueHalfDays - startHalfDay + 1);
        task.durationDays = durationHalfDays / 2; // reflect derived duration on the task
        void startPoint; // start date string is mapped back in step 4; kept for clarity
      }
      const endHalfDay = startHalfDay + Math.max(1, durationHalfDays) - 1;

      scheduleIndices.set(taskId, { start: startHalfDay, end: endHalfDay });
    }

    resolved.add(taskId);
  }

  // Resolve all tasks
  scheduledTasks.forEach(t => resolveTask(t.id));

  // Double check parent boundaries. If children shifts occurred, parents might need recalculation.
  // We do a second pass to adjust parent tasks from bottom up.
  let parentsNeedAdjustment = true;
  while (parentsNeedAdjustment) {
    parentsNeedAdjustment = false;
    for (const task of scheduledTasks) {
      if (parentIds.has(task.id)) {
        const children = scheduledTasks.filter(t => t.parentId === task.id);
        const childIndices = children
          .map(c => scheduleIndices.get(c.id))
          .filter((idx): idx is { start: number; end: number } => idx !== undefined);

        if (childIndices.length > 0) {
          const minStart = Math.min(...childIndices.map(c => c.start));
          const maxEnd = Math.max(...childIndices.map(c => c.end));
          const currentIdx = scheduleIndices.get(task.id);
          
          if (!currentIdx || currentIdx.start !== minStart || currentIdx.end !== maxEnd) {
            scheduleIndices.set(task.id, { start: minStart, end: maxEnd });
            task.durationDays = (maxEnd - minStart + 1) / 2;
            parentsNeedAdjustment = true; // Loop again to bubble up adjustments
          }
        }
      }
    }
  }

  // 4. Map schedule indices back to date strings.
  scheduledTasks.forEach(task => {
    const indices = scheduleIndices.get(task.id);
    if (indices) {
      const startPoint = getSchedulePoint(projectStartDate, indices.start);
      const endPoint = getSchedulePoint(projectStartDate, indices.end);
      task.plannedStartDate = startPoint.date;
      task.plannedEndDate = endPoint.date;
      task.startHalfDay = indices.start;
      task.endHalfDay = indices.end;
    }
  });

  return scheduledTasks;
}
