import { addDays, weekStartOf, weekday } from './dates';
import type { Area, Data, DateStr, ID, Occurrence, Priority, Task } from './types';

export const DEADLINE_WINDOW_DAYS = 7;
const PRIORITY_RANK: Record<Priority, number> = { alta: 0, normal: 1, baixa: 2 };

export function newId(): ID {
  return crypto.randomUUID();
}

export function makeOccurrence(
  taskId: ID,
  targetDate: DateStr | null,
  plannedDate: DateStr | null,
  nowIso: string,
): Occurrence {
  return {
    id: newId(),
    taskId,
    targetDate,
    plannedDate,
    status: 'pending',
    doneDate: null,
    skippedDate: null,
    postponedFrom: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function isPlannable(task: Task, areas: Map<ID, Area>): boolean {
  const area = areas.get(task.areaId);
  return task.active && !task.archived && !!area && area.active;
}

function areaMap(data: Data) {
  return new Map(data.areas.map((a) => [a.id, a]));
}

const occKey = (taskId: ID, date: DateStr | null) => `${taskId}|${date}`;

/**
 * Creates one occurrence per scheduled weekday from the last generated date up to today.
 * Missed dates stay as their own pending occurrence; nothing is copied forward.
 */
export function generateOccurrences(
  data: Data,
  today: DateStr,
  nowIso: string,
): { occurrences: Occurrence[]; tasks: Task[] } {
  const areas = areaMap(data);
  const existing = new Set(data.occurrences.map((o) => occKey(o.taskId, o.targetDate)));
  const occurrences: Occurrence[] = [];
  const tasks: Task[] = [];

  for (const task of data.tasks) {
    if (task.kind !== 'weekdays' || !isPlannable(task, areas)) continue;
    const from = task.generatedUntil ? addDays(task.generatedUntil, 1) : task.startDate;
    if (from > today) continue;
    for (let d = from; d <= today; d = addDays(d, 1)) {
      if (task.weekdays.includes(weekday(d)) && !existing.has(occKey(task.id, d))) {
        occurrences.push(makeOccurrence(task.id, d, d, nowIso));
        existing.add(occKey(task.id, d));
      }
    }
    tasks.push({ ...task, generatedUntil: today, updatedAt: nowIso });
  }
  return { occurrences, tasks };
}

export function dueDateOf(task: Task): DateStr | null {
  return task.dueAt ? task.dueAt.slice(0, 10) : null;
}

export function doneCountInRange(data: Data, taskId: ID, from: DateStr, to: DateStr): number {
  return data.occurrences.filter(
    (o) => o.taskId === taskId && o.status === 'done' && o.doneDate !== null && o.doneDate >= from && o.doneDate <= to,
  ).length;
}

export function weeklyRemaining(data: Data, task: Task, today: DateStr): number {
  const ws = weekStartOf(today, data.prefs.weekStart);
  return Math.max(0, task.timesPerWeek - doneCountInRange(data, task.id, ws, addDays(ws, 6)));
}

export type ItemKind = 'deadline' | 'overdue' | 'planned' | 'weekly' | 'done';

export interface TodayItem {
  key: string;
  kind: ItemKind;
  task: Task;
  occ: Occurrence | null;
  /** Weekly goal: completions still missing this week. */
  remaining?: number;
  /** Deadline already passed. */
  late?: boolean;
}

export interface TodayData {
  deadlines: TodayItem[];
  overdueGroups: { area: Area; items: TodayItem[] }[];
  planned: TodayItem[];
  done: TodayItem[];
}

export function buildToday(data: Data, today: DateStr, now: Date): TodayData {
  const areas = areaMap(data);
  const tasks = new Map(data.tasks.map((t) => [t.id, t]));
  const horizon = addDays(today, DEADLINE_WINDOW_DAYS);
  const deadlines: TodayItem[] = [];
  const overdue: TodayItem[] = [];
  const planned: TodayItem[] = [];
  const done: TodayItem[] = [];
  const tasksWithPending = new Set<ID>();

  for (const occ of data.occurrences) {
    const task = tasks.get(occ.taskId);
    if (!task) continue;
    if (occ.status === 'done') {
      if (occ.doneDate === today) done.push({ key: occ.id, kind: 'done', task, occ });
      continue;
    }
    if (occ.status !== 'pending' || !isPlannable(task, areas)) continue;
    const due = dueDateOf(task);
    if (task.kind === 'once' && task.dueAt && due && due <= horizon) {
      deadlines.push({ key: occ.id, kind: 'deadline', task, occ, late: new Date(task.dueAt) < now });
      tasksWithPending.add(task.id);
      continue;
    }
    if (!occ.plannedDate || occ.plannedDate > today) continue;
    tasksWithPending.add(task.id);
    if (occ.plannedDate < today) overdue.push({ key: occ.id, kind: 'overdue', task, occ });
    else planned.push({ key: occ.id, kind: 'planned', task, occ });
  }

  for (const task of data.tasks) {
    if (task.kind !== 'weekly' || !isPlannable(task, areas) || tasksWithPending.has(task.id)) continue;
    const remaining = weeklyRemaining(data, task, today);
    if (remaining > 0) planned.push({ key: `weekly:${task.id}`, kind: 'weekly', task, occ: null, remaining });
  }

  const areaOrder = (t: Task) => areas.get(t.areaId)?.order ?? 999;
  const byPriority = (a: TodayItem, b: TodayItem) =>
    PRIORITY_RANK[a.task.priority] - PRIORITY_RANK[b.task.priority] ||
    areaOrder(a.task) - areaOrder(b.task) ||
    a.task.title.localeCompare(b.task.title, 'pt-BR');

  deadlines.sort((a, b) => (a.task.dueAt ?? '').localeCompare(b.task.dueAt ?? ''));
  planned.sort(byPriority);
  done.sort((a, b) => (a.occ?.updatedAt ?? '').localeCompare(b.occ?.updatedAt ?? ''));

  const groups = new Map<ID, TodayItem[]>();
  for (const item of overdue) {
    const list = groups.get(item.task.areaId) ?? [];
    list.push(item);
    groups.set(item.task.areaId, list);
  }
  const overdueGroups = [...groups.entries()]
    .map(([areaId, items]) => ({
      area: areas.get(areaId)!,
      items: items.sort((a, b) => (a.occ!.plannedDate ?? '').localeCompare(b.occ!.plannedDate ?? '')),
    }))
    .sort((a, b) => a.area.order - b.area.order);

  return { deadlines, overdueGroups, planned, done };
}

export interface BringCandidate {
  task: Task;
  /** Scheduled date being anticipated (weekday tasks). */
  date: DateStr | null;
  occ: Occurrence | null;
}

/** Tasks that can be brought into today: upcoming weekday dates and unplanned/future one-off tasks. */
export function bringToTodayCandidates(data: Data, today: DateStr): BringCandidate[] {
  const areas = areaMap(data);
  const existing = new Set(data.occurrences.map((o) => occKey(o.taskId, o.targetDate)));
  const result: BringCandidate[] = [];
  for (const task of data.tasks) {
    if (!isPlannable(task, areas)) continue;
    if (task.kind === 'weekdays') {
      for (let i = 1; i <= 7; i++) {
        const d = addDays(today, i);
        if (task.weekdays.includes(weekday(d))) {
          if (!existing.has(occKey(task.id, d))) result.push({ task, date: d, occ: null });
          break;
        }
      }
    } else if (task.kind === 'once') {
      const occ = data.occurrences.find((o) => o.taskId === task.id && o.status === 'pending');
      if (occ && (!occ.plannedDate || occ.plannedDate > today)) result.push({ task, date: null, occ });
    }
  }
  return result.sort((a, b) => a.task.title.localeCompare(b.task.title, 'pt-BR'));
}

export interface WeeklySummaryRow {
  task: Task;
  done: number;
  goal: number;
}

export function weeklySummary(data: Data, weekStart: DateStr): WeeklySummaryRow[] {
  const weekEnd = addDays(weekStart, 6);
  const rows: WeeklySummaryRow[] = [];
  for (const task of data.tasks) {
    if (task.kind === 'once') continue;
    const done = doneCountInRange(data, task.id, weekStart, weekEnd);
    if (task.archived && done === 0) continue;
    let goal = task.timesPerWeek;
    if (task.kind === 'weekdays') {
      goal = 0;
      for (let d = weekStart; d <= weekEnd; d = addDays(d, 1)) {
        if (d >= task.startDate && task.weekdays.includes(weekday(d))) goal++;
      }
    }
    rows.push({ task, done, goal });
  }
  return rows.sort((a, b) => a.task.title.localeCompare(b.task.title, 'pt-BR'));
}

/** Next date the task is expected (weekday tasks) or its planned date (one-off). */
export function nextDateOf(data: Data, task: Task, today: DateStr): DateStr | null {
  if (task.kind === 'once') {
    const occ = data.occurrences.find((o) => o.taskId === task.id && o.status === 'pending');
    return occ?.plannedDate ?? dueDateOf(task);
  }
  if (task.kind === 'weekdays') {
    const closed = new Set(
      data.occurrences.filter((o) => o.taskId === task.id && o.status !== 'pending').map((o) => o.targetDate),
    );
    for (let i = 0; i <= 7; i++) {
      const d = addDays(today, i);
      if (d >= task.startDate && task.weekdays.includes(weekday(d)) && !closed.has(d)) return d;
    }
  }
  return null;
}
