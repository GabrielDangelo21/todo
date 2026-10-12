export type ID = string;
/** Local calendar date, YYYY-MM-DD. */
export type DateStr = string;
/** Local date-time as produced by <input type="datetime-local">, YYYY-MM-DDTHH:mm. */
export type LocalDateTime = string;
export type WeekStart = 0 | 1;

export interface Area {
  id: ID;
  name: string;
  order: number;
  active: boolean;
  updatedAt: string;
}

export type TaskKind = 'once' | 'weekdays' | 'weekly';
export type Priority = 'baixa' | 'normal' | 'alta';

export interface Task {
  id: ID;
  areaId: ID;
  title: string;
  description: string;
  minutes: number;
  kind: TaskKind;
  /** 0 = Sunday … 6 = Saturday; used when kind === 'weekdays'. */
  weekdays: number[];
  /** Used when kind === 'weekly'. */
  timesPerWeek: number;
  priority: Priority;
  dueAt: LocalDateTime | null;
  /** Deadline reminder (once tasks). */
  reminderAt: LocalDateTime | null;
  /** Daily reminder time HH:mm (recurring tasks). */
  dailyReminder: string | null;
  startDate: DateStr;
  /** Last date for which weekday occurrences were generated. */
  generatedUntil: DateStr | null;
  active: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type OccStatus = 'pending' | 'done' | 'skipped';

export interface Occurrence {
  id: ID;
  taskId: ID;
  /** Date the rule originally scheduled; identifies the occurrence and prevents duplicates. */
  targetDate: DateStr | null;
  /** Date the user currently plans to do it (null = not planned yet). */
  plannedDate: DateStr | null;
  status: OccStatus;
  doneDate: DateStr | null;
  skippedDate: DateStr | null;
  postponedFrom: DateStr | null;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: ID;
  occurrenceId: ID;
  taskId: ID;
  start: string;
  /** null while the timer is running. */
  end: string | null;
  /** Authoritative duration for closed sessions; 0 while running. */
  seconds: number;
  manual: boolean;
  edited: boolean;
  updatedAt: string;
}

export interface Reminder {
  id: ID;
  key: string;
  taskId: ID;
  occurrenceId: ID | null;
  at: LocalDateTime;
  shown: boolean;
  snoozedUntil: string | null;
  updatedAt: string;
}

export interface Prefs {
  id: 'prefs';
  weekStart: WeekStart;
  notifications: boolean;
  timeZone: string;
  lastBackupAt: string | null;
  lastOpenDate: DateStr | null;
  updatedAt: string;
}

export interface Data {
  areas: Area[];
  tasks: Task[];
  occurrences: Occurrence[];
  sessions: Session[];
  reminders: Reminder[];
  prefs: Prefs;
}

export const LIST_STORES = ['areas', 'tasks', 'occurrences', 'sessions', 'reminders'] as const;
export type ListStore = (typeof LIST_STORES)[number];
export type StoreName = ListStore | 'prefs';

export interface Changes {
  put?: Partial<{ [K in ListStore]: Data[K] }> & { prefs?: Prefs };
  del?: Partial<Record<ListStore, ID[]>>;
}
