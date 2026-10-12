import type { DateStr, LocalDateTime, WeekStart } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateStr(d: Date): DateStr {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toLocalDateTime(d: Date): LocalDateTime {
  return `${toDateStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseDate(s: DateStr): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: DateStr, n: number): DateStr {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export function weekday(s: DateStr): number {
  return parseDate(s).getDay();
}

export function weekStartOf(s: DateStr, weekStart: WeekStart): DateStr {
  return addDays(s, -((weekday(s) - weekStart + 7) % 7));
}

export function daysBetween(from: DateStr, to: DateStr): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
}

export function dateOfIso(iso: string): DateStr {
  return toDateStr(new Date(iso));
}

export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function orderedWeekdays(weekStart: WeekStart): number[] {
  return Array.from({ length: 7 }, (_, i) => (i + weekStart) % 7);
}

const longFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

export function formatLong(s: DateStr): string {
  return longFmt.format(parseDate(s));
}

export function formatShort(s: DateStr): string {
  const d = parseDate(s);
  return `${WEEKDAY_SHORT[d.getDay()].toLowerCase()} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

export function formatDateTime(dt: LocalDateTime): string {
  const d = new Date(dt);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDuration(seconds: number): string {
  const totalMin = Math.floor(seconds / 60);
  if (totalMin < 1) return seconds > 0 ? '< 1 min' : '0 min';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${pad(m)} min`;
}

export function formatMinutes(minutes: number): string {
  return formatDuration(minutes * 60);
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
