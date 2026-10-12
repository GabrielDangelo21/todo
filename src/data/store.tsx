import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { buildExport } from '../domain/backup';
import { addDays, toDateStr } from '../domain/dates';
import { createTask, updateTask, type TaskInput } from '../domain/defaults';
import { generateOccurrences, makeOccurrence, newId } from '../domain/planning';
import { closeSession, runningSession } from '../domain/timer';
import type { Area, Changes, Data, DateStr, ID, Occurrence, Prefs, Session, Task } from '../domain/types';
import { applyToData } from './applyChanges';
import * as db from './db';

export interface TimerTarget {
  task: Task;
  occ: Occurrence | null;
}

function nowIso() {
  return new Date().toISOString();
}

export function createActions(
  get: () => Data,
  getToday: () => DateStr,
  commit: (ch: Changes) => Promise<void>,
  replace: (data: Data) => Promise<void>,
) {
  /** Weekly-goal items have no occurrence until work starts on them. */
  function ensureOcc(target: TimerTarget, ch: Changes): Occurrence {
    if (target.occ) return target.occ;
    const today = getToday();
    const occ = makeOccurrence(target.task.id, today, today, nowIso());
    (ch.put!.occurrences ??= []).push(occ);
    return occ;
  }

  function touchOcc(occId: ID, patch: Partial<Occurrence>): Changes {
    const occ = get().occurrences.find((o) => o.id === occId);
    if (!occ) return {};
    return { put: { occurrences: [{ ...occ, ...patch, updatedAt: nowIso() }] } };
  }

  function manualSession(occ: Occurrence, seconds: number): Session {
    const end = new Date();
    return {
      id: newId(),
      occurrenceId: occ.id,
      taskId: occ.taskId,
      start: new Date(end.getTime() - seconds * 1000).toISOString(),
      end: end.toISOString(),
      seconds,
      manual: true,
      edited: false,
      updatedAt: end.toISOString(),
    };
  }

  return {
    // ---------- Areas ----------
    async addArea(name: string) {
      const areas = get().areas;
      const area: Area = {
        id: newId(),
        name: name.trim(),
        order: areas.reduce((m, a) => Math.max(m, a.order), -1) + 1,
        active: true,
        updatedAt: nowIso(),
      };
      await commit({ put: { areas: [area] } });
    },
    async updateArea(area: Area, patch: Partial<Area>) {
      await commit({ put: { areas: [{ ...area, ...patch, updatedAt: nowIso() }] } });
    },
    async moveArea(areaId: ID, dir: -1 | 1) {
      const sorted = [...get().areas].sort((a, b) => a.order - b.order);
      const i = sorted.findIndex((a) => a.id === areaId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= sorted.length) return;
      const t = nowIso();
      await commit({
        put: {
          areas: [
            { ...sorted[i], order: sorted[j].order, updatedAt: t },
            { ...sorted[j], order: sorted[i].order, updatedAt: t },
          ],
        },
      });
    },

    // ---------- Tasks ----------
    async createTask(input: TaskInput) {
      const { task, occurrences } = createTask(input, getToday(), nowIso());
      await commit({ put: { tasks: [task], occurrences } });
      return task;
    },
    async updateTask(task: Task, input: TaskInput) {
      const pendingOnce = get().occurrences.find((o) => o.taskId === task.id && o.status === 'pending');
      const res = updateTask(task, input, task.kind === 'once' ? pendingOnce : undefined, getToday(), nowIso());
      await commit({ put: { tasks: [res.task], occurrences: res.occurrences } });
    },
    async setTaskFlags(task: Task, patch: { active?: boolean; archived?: boolean }) {
      const resumes = (patch.active === true && !task.active) || (patch.archived === false && task.archived);
      const generatedUntil = resumes && task.kind === 'weekdays' ? addDays(getToday(), -1) : task.generatedUntil;
      const ch: Changes = { put: { tasks: [{ ...task, ...patch, generatedUntil, updatedAt: nowIso() }] } };
      const running = runningSession(get().sessions);
      if ((patch.archived || patch.active === false) && running?.taskId === task.id) {
        ch.put!.sessions = [closeSession(running, new Date())];
      }
      await commit(ch);
    },
    async deleteTask(taskId: ID) {
      const d = get();
      await commit({
        del: {
          tasks: [taskId],
          occurrences: d.occurrences.filter((o) => o.taskId === taskId).map((o) => o.id),
          sessions: d.sessions.filter((s) => s.taskId === taskId).map((s) => s.id),
          reminders: d.reminders.filter((r) => r.taskId === taskId).map((r) => r.id),
        },
      });
    },
    async quickAddToday(title: string, areaId: ID, minutes: number) {
      const today = getToday();
      const { task, occurrences } = createTask(
        {
          areaId,
          title,
          description: '',
          minutes,
          kind: 'once',
          weekdays: [],
          timesPerWeek: 0,
          priority: 'normal',
          dueAt: null,
          reminderAt: null,
          dailyReminder: null,
          plannedDate: today,
          active: true,
        },
        today,
        nowIso(),
      );
      await commit({ put: { tasks: [task], occurrences } });
    },

    // ---------- Occurrences ----------
    /** Anticipates a weekday occurrence (keeps its scheduled date, so it is not generated again) or plans a one-off task for today. */
    async bringToToday(task: Task, date: DateStr | null, occ: Occurrence | null) {
      const today = getToday();
      if (occ) {
        await commit(touchOcc(occ.id, { plannedDate: today, targetDate: occ.targetDate ?? today, postponedFrom: occ.plannedDate }));
      } else {
        await commit({ put: { occurrences: [makeOccurrence(task.id, date ?? today, today, nowIso())] } });
      }
    },
    async resumeToday(occ: Occurrence) {
      await commit(touchOcc(occ.id, { plannedDate: getToday(), postponedFrom: occ.plannedDate }));
    },
    async postpone(occ: Occurrence, date: DateStr) {
      await commit(touchOcc(occ.id, { plannedDate: date, postponedFrom: occ.plannedDate }));
    },
    async skip(occs: Occurrence[]) {
      const t = nowIso();
      const today = getToday();
      const ids = new Set(occs.map((o) => o.id));
      const ch: Changes = {
        put: { occurrences: occs.map((o) => ({ ...o, status: 'skipped' as const, skippedDate: today, updatedAt: t })) },
      };
      const running = runningSession(get().sessions);
      if (running && ids.has(running.occurrenceId)) ch.put!.sessions = [closeSession(running, new Date())];
      await commit(ch);
    },
    async complete(target: TimerTarget, manualSeconds = 0) {
      const ch: Changes = { put: { occurrences: [], sessions: [] } };
      const occ = ensureOcc(target, ch);
      const running = runningSession(get().sessions);
      if (running && running.occurrenceId === occ.id) ch.put!.sessions!.push(closeSession(running, new Date()));
      if (manualSeconds > 0) ch.put!.sessions!.push(manualSession(occ, manualSeconds));
      const finished: Occurrence = { ...occ, status: 'done', doneDate: getToday(), skippedDate: null, updatedAt: nowIso() };
      ch.put!.occurrences = [...ch.put!.occurrences!.filter((o) => o.id !== occ.id), finished];
      await commit(ch);
    },
    async reopen(occ: Occurrence) {
      await commit(touchOcc(occ.id, { status: 'pending', doneDate: null, skippedDate: null }));
    },

    // ---------- Timer & sessions ----------
    async startTimer(target: TimerTarget, opts: { force?: boolean } = {}): Promise<'started' | 'conflict'> {
      const running = runningSession(get().sessions);
      if (running && target.occ && running.occurrenceId === target.occ.id) return 'started';
      if (running && !opts.force) return 'conflict';
      const ch: Changes = { put: { occurrences: [], sessions: [] } };
      if (running) ch.put!.sessions!.push(closeSession(running, new Date()));
      const occ = ensureOcc(target, ch);
      const t = nowIso();
      ch.put!.sessions!.push({
        id: newId(),
        occurrenceId: occ.id,
        taskId: occ.taskId,
        start: t,
        end: null,
        seconds: 0,
        manual: false,
        edited: false,
        updatedAt: t,
      });
      await commit(ch);
      return 'started';
    },
    async pauseTimer() {
      const running = runningSession(get().sessions);
      if (running) await commit({ put: { sessions: [closeSession(running, new Date())] } });
    },
    async addManualTime(target: TimerTarget, seconds: number) {
      if (seconds <= 0) return;
      const ch: Changes = { put: { occurrences: [], sessions: [] } };
      const occ = ensureOcc(target, ch);
      ch.put!.sessions!.push(manualSession(occ, seconds));
      await commit(ch);
    },
    async editSession(session: Session, seconds: number) {
      await commit({ put: { sessions: [{ ...session, seconds, edited: true, updatedAt: nowIso() }] } });
    },
    async deleteSession(sessionId: ID) {
      await commit({ del: { sessions: [sessionId] } });
    },

    // ---------- Reminders ----------
    async markReminders(items: { key: string; taskId: ID; occurrenceId: ID | null; at: string }[], snoozeMinutes = 0) {
      if (items.length === 0) return;
      const existing = new Map(get().reminders.map((r) => [r.key, r]));
      const t = new Date();
      const snoozedUntil = snoozeMinutes > 0 ? new Date(t.getTime() + snoozeMinutes * 60_000).toISOString() : null;
      await commit({
        put: {
          reminders: items.map((it) => ({
            id: existing.get(it.key)?.id ?? newId(),
            key: it.key,
            taskId: it.taskId,
            occurrenceId: it.occurrenceId,
            at: it.at,
            shown: snoozeMinutes === 0,
            snoozedUntil,
            updatedAt: t.toISOString(),
          })),
        },
      });
    },

    // ---------- Preferences & backup ----------
    async setPrefs(patch: Partial<Prefs>) {
      await commit({ put: { prefs: { ...get().prefs, ...patch, updatedAt: nowIso() } } });
    },
    /** The file records its own export time as the last backup, so restoring it keeps that date. */
    exportFile() {
      const t = nowIso();
      const d = get();
      return buildExport({ ...d, prefs: { ...d.prefs, lastBackupAt: t } }, t);
    },
    async replaceAll(data: Data) {
      await replace(data);
    },
  };
}

export type Actions = ReturnType<typeof createActions>;

interface StoreValue {
  data: Data;
  today: DateStr;
  actions: Actions;
  /** Set when the app is first opened on a new day. */
  morning: boolean;
  dismissMorning: () => void;
  error: string | null;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data | null>(null);
  const [today, setToday] = useState(() => toDateStr(new Date()));
  const [morning, setMorning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef<Data | null>(null);
  const todayRef = useRef(today);
  todayRef.current = today;
  /** Writes are serialized; reloads wait for them so they never read a stale database. */
  const writes = useRef<Promise<void>>(Promise.resolve());

  const reload = () => {
    let mine: Promise<void> | null = null;
    const p: Promise<void> = writes.current.then(async () => {
      const d = await db.loadAll();
      // A commit queued meanwhile is already reflected in memory; don't overwrite it.
      if (writes.current !== mine) return;
      dataRef.current = d;
      setData(d);
    });
    mine = p.catch(() => undefined);
    writes.current = mine;
    return p;
  };

  const commit = async (ch: Changes) => {
    if (!dataRef.current) return;
    dataRef.current = applyToData(dataRef.current, ch);
    setData(dataRef.current);
    const write = writes.current.then(() => db.applyChanges(ch));
    writes.current = write.catch(() => undefined);
    try {
      await write;
    } catch (e) {
      setError(`Não foi possível salvar no navegador: ${(e as Error).message}`);
      await reload();
    }
  };

  const actions = useMemo(() => {
    const replace = async (next: Data) => {
      const write = writes.current.then(() => db.replaceAll(next));
      writes.current = write.catch(() => undefined);
      await write;
      dataRef.current = next;
      setData(next);
    };
    return createActions(() => dataRef.current!, () => todayRef.current, commit, replace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markOpened = (d: Data, day: DateStr) => {
    if (d.prefs.lastOpenDate !== day) {
      setMorning(true);
      void actions.setPrefs({ lastOpenDate: day });
    }
  };

  const loadStarted = useRef(false);
  useEffect(() => {
    if (loadStarted.current) return;
    loadStarted.current = true;
    writes.current = db
      .loadAll()
      .then((d) => {
        dataRef.current = d;
        setData(d);
        markOpened(d, todayRef.current);
      })
      .catch((e: Error) => setError(`Não foi possível abrir os dados locais: ${e.message}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Day rollover and returning to the tab (data may have changed in another tab).
  useEffect(() => {
    const check = () => {
      const d = toDateStr(new Date());
      if (d !== todayRef.current) {
        setToday(d);
        if (dataRef.current) markOpened(dataRef.current, d);
      }
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      check();
      if (dataRef.current) void reload();
    };
    const id = window.setInterval(check, 30_000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Materialize weekday occurrences whenever tasks or the day change.
  const tasks = data?.tasks;
  useEffect(() => {
    if (!dataRef.current) return;
    const g = generateOccurrences(dataRef.current, today, nowIso());
    if (g.occurrences.length || g.tasks.length) {
      void commit({ put: { occurrences: g.occurrences, tasks: g.tasks } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, tasks]);

  if (error && !data) {
    return (
      <div className="fatal" role="alert">
        <h1>Constância</h1>
        <p>{error}</p>
        <p>Verifique se o navegador permite armazenamento local para este site.</p>
      </div>
    );
  }
  if (!data) return <div className="loading">Carregando…</div>;

  return (
    <StoreContext.Provider
      value={{ data, today, actions, morning, dismissMorning: () => setMorning(false), error }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useStore outside StoreProvider');
  return v;
}

export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
