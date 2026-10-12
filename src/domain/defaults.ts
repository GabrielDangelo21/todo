import { addDays } from './dates';
import { makeOccurrence, newId } from './planning';
import type { Area, DateStr, Occurrence, Prefs, Priority, Task, TaskKind } from './types';

const DEFAULT_AREAS = ['Holandês', 'Agência de viagens', 'Impressão 3D', 'Pães'];

export function defaultAreas(nowIso: string): Area[] {
  return DEFAULT_AREAS.map((name, order) => ({ id: newId(), name, order, active: true, updatedAt: nowIso }));
}

export function defaultPrefs(nowIso: string): Prefs {
  return {
    id: 'prefs',
    weekStart: 1,
    notifications: false,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    lastBackupAt: null,
    lastOpenDate: null,
    updatedAt: nowIso,
  };
}

export interface TaskInput {
  areaId: string;
  title: string;
  description: string;
  minutes: number;
  kind: TaskKind;
  weekdays: number[];
  timesPerWeek: number;
  priority: Priority;
  dueAt: string | null;
  reminderAt: string | null;
  dailyReminder: string | null;
  /** One-off tasks: date planned to do it. */
  plannedDate: DateStr | null;
  active: boolean;
}

export function createTask(
  input: TaskInput,
  today: DateStr,
  nowIso: string,
): { task: Task; occurrences: Occurrence[] } {
  const task: Task = {
    id: newId(),
    areaId: input.areaId,
    title: input.title.trim(),
    description: input.description.trim(),
    minutes: input.minutes,
    kind: input.kind,
    weekdays: input.kind === 'weekdays' ? [...input.weekdays].sort() : [],
    timesPerWeek: input.kind === 'weekly' ? input.timesPerWeek : 0,
    priority: input.priority,
    dueAt: input.kind === 'once' ? input.dueAt : null,
    reminderAt: input.kind === 'once' ? input.reminderAt : null,
    dailyReminder: input.kind === 'once' ? null : input.dailyReminder,
    startDate: today,
    generatedUntil: null,
    active: input.active,
    archived: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const occurrences =
    task.kind === 'once' ? [makeOccurrence(task.id, input.plannedDate, input.plannedDate, nowIso)] : [];
  return { task, occurrences };
}

/** Applies edits; schedule changes take effect from today without backfilling past dates. */
export function updateTask(
  task: Task,
  input: TaskInput,
  pendingOnce: Occurrence | undefined,
  today: DateStr,
  nowIso: string,
): { task: Task; occurrences: Occurrence[] } {
  const scheduleChanged =
    task.kind !== input.kind || task.weekdays.join(',') !== [...input.weekdays].sort().join(',');
  const reactivated = !task.active && input.active;
  const next: Task = {
    ...task,
    areaId: input.areaId,
    title: input.title.trim(),
    description: input.description.trim(),
    minutes: input.minutes,
    kind: input.kind,
    weekdays: input.kind === 'weekdays' ? [...input.weekdays].sort() : [],
    timesPerWeek: input.kind === 'weekly' ? input.timesPerWeek : 0,
    priority: input.priority,
    dueAt: input.kind === 'once' ? input.dueAt : null,
    reminderAt: input.kind === 'once' ? input.reminderAt : null,
    dailyReminder: input.kind === 'once' ? null : input.dailyReminder,
    active: input.active,
    generatedUntil: scheduleChanged || reactivated ? addDays(today, -1) : task.generatedUntil,
    updatedAt: nowIso,
  };
  const occurrences: Occurrence[] = [];
  if (next.kind === 'once') {
    if (pendingOnce) {
      if (pendingOnce.plannedDate !== input.plannedDate) {
        occurrences.push({
          ...pendingOnce,
          plannedDate: input.plannedDate,
          targetDate: pendingOnce.targetDate ?? input.plannedDate,
          updatedAt: nowIso,
        });
      }
    } else if (task.kind !== 'once') {
      occurrences.push(makeOccurrence(next.id, input.plannedDate, input.plannedDate, nowIso));
    }
  }
  return { task: next, occurrences };
}
