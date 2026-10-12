import { dateOfIso } from './dates';
import type { DateStr, ID, Session } from './types';

/** Elapsed time is always derived from stored timestamps, never from an in-memory counter. */
export function sessionSeconds(s: Session, now: Date): number {
  if (s.end) return s.seconds;
  return s.seconds + Math.max(0, Math.floor((now.getTime() - Date.parse(s.start)) / 1000));
}

export function closeSession(s: Session, now: Date): Session {
  const iso = now.toISOString();
  return { ...s, end: iso, seconds: sessionSeconds(s, now), updatedAt: iso };
}

export function runningSession(sessions: Session[]): Session | undefined {
  return sessions.find((s) => s.end === null);
}

export function occSeconds(occId: ID, sessions: Session[], now: Date): number {
  let total = 0;
  for (const s of sessions) if (s.occurrenceId === occId) total += sessionSeconds(s, now);
  return total;
}

export function daySeconds(day: DateStr, sessions: Session[], now: Date): number {
  let total = 0;
  for (const s of sessions) if (dateOfIso(s.start) === day) total += sessionSeconds(s, now);
  return total;
}
