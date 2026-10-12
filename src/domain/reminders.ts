import { formatDateTime } from './dates';
import { isPlannable, weeklyRemaining } from './planning';
import type { Data, DateStr, ID, LocalDateTime } from './types';

export interface DueReminder {
  key: string;
  taskId: ID;
  occurrenceId: ID | null;
  at: LocalDateTime;
  title: string;
  body: string;
}

export function reminderCandidates(data: Data, today: DateStr): DueReminder[] {
  const areas = new Map(data.areas.map((a) => [a.id, a]));
  const out: DueReminder[] = [];
  for (const task of data.tasks) {
    if (!isPlannable(task, areas)) continue;
    if (task.kind === 'once') {
      if (!task.reminderAt) continue;
      const occ = data.occurrences.find((o) => o.taskId === task.id && o.status === 'pending');
      if (!occ) continue;
      out.push({
        key: `due:${occ.id}:${task.reminderAt}`,
        taskId: task.id,
        occurrenceId: occ.id,
        at: task.reminderAt,
        title: task.title,
        body: task.dueAt ? `Prazo: ${formatDateTime(task.dueAt)}` : 'Lembrete da tarefa',
      });
    } else if (task.dailyReminder) {
      const pending = data.occurrences.find(
        (o) => o.taskId === task.id && o.status === 'pending' && o.plannedDate !== null && o.plannedDate <= today,
      );
      const hasWork = task.kind === 'weekly' ? weeklyRemaining(data, task, today) > 0 || !!pending : !!pending;
      if (!hasWork) continue;
      out.push({
        key: `daily:${task.id}:${today}`,
        taskId: task.id,
        occurrenceId: pending?.id ?? null,
        at: `${today}T${task.dailyReminder}`,
        title: task.title,
        body: `${task.minutes} min previstos para hoje`,
      });
    }
  }
  return out;
}

/** A reminder fires once; it only returns if the user snoozed it or a new occurrence creates a new key. */
export function dueReminders(data: Data, today: DateStr, now: Date): DueReminder[] {
  const state = new Map(data.reminders.map((r) => [r.key, r]));
  return reminderCandidates(data, today).filter((c) => {
    if (new Date(c.at) > now) return false;
    const rec = state.get(c.key);
    if (!rec) return true;
    return !rec.shown && rec.snoozedUntil !== null && new Date(rec.snoozedUntil) <= now;
  });
}
