import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyToData } from '../data/applyChanges';
import { createActions } from '../data/store';
import { addDays } from '../domain/dates';
import { defaultAreas, defaultPrefs, type TaskInput } from '../domain/defaults';
import { buildToday, bringToTodayCandidates, generateOccurrences, weeklyRemaining, weeklySummary } from '../domain/planning';
import { dueReminders } from '../domain/reminders';
import { occSeconds, runningSession } from '../domain/timer';
import type { Changes, Data } from '../domain/types';

// 2026-10-12 is a Monday.
const MON = '2026-10-12';

function harness(startDay = MON) {
  const iso = new Date(`${startDay}T08:00:00`).toISOString();
  let data: Data = {
    areas: defaultAreas(iso),
    tasks: [],
    occurrences: [],
    sessions: [],
    reminders: [],
    prefs: defaultPrefs(iso),
  };
  let today = startDay;
  const commit = async (ch: Changes) => {
    data = applyToData(data, ch);
  };
  const actions = createActions(
    () => data,
    () => today,
    commit,
    async (d) => {
      data = d;
    },
  );
  const h = {
    actions,
    get data() {
      return data;
    },
    get today() {
      return today;
    },
    area: (name: string) => data.areas.find((a) => a.name === name)!.id,
    /** Advances the clock to a given day/time and runs occurrence generation, like opening the app. */
    goTo(day: string, time = '08:00') {
      today = day;
      vi.setSystemTime(new Date(`${day}T${time}:00`));
      const g = generateOccurrences(data, today, new Date().toISOString());
      data = applyToData(data, { put: { occurrences: g.occurrences, tasks: g.tasks } });
    },
    view: () => buildToday(data, today, new Date()),
  };
  h.goTo(startDay);
  return h;
}

function input(over: Partial<TaskInput>): TaskInput {
  return {
    areaId: '',
    title: 'Tarefa',
    description: '',
    minutes: 15,
    kind: 'once',
    weekdays: [],
    timesPerWeek: 0,
    priority: 'normal',
    dueAt: null,
    reminderAt: null,
    dailyReminder: null,
    plannedDate: null,
    active: true,
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Critérios de aceitação', () => {
  it('7. holandês 15 min todos os dias: aparece em Hoje, é cronometrado e a conclusão vai para o histórico', async () => {
    const h = harness();
    const task = await h.actions.createTask(
      input({ title: 'Holandês', areaId: h.area('Holandês'), kind: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] }),
    );
    h.goTo(MON, '08:00');
    const item = h.view().planned.find((i) => i.task.id === task.id)!;
    expect(item).toBeDefined();
    expect(item.task.minutes).toBe(15);

    await h.actions.startTimer({ task, occ: item.occ });
    vi.setSystemTime(new Date(`${MON}T08:16:00`));
    await h.actions.complete({ task, occ: item.occ });

    const occ = h.data.occurrences.find((o) => o.id === item.occ!.id)!;
    expect(occ.status).toBe('done');
    expect(occ.doneDate).toBe(MON);
    expect(occSeconds(occ.id, h.data.sessions, new Date())).toBe(16 * 60);
    expect(runningSession(h.data.sessions)).toBeUndefined();
    expect(h.view().done.map((i) => i.task.id)).toContain(task.id);
    expect(weeklySummary(h.data, MON).find((r) => r.task.id === task.id)).toMatchObject({ done: 1, goal: 7 });
  });

  it('8. redes sociais seg/qua/sex: só é planejada nesses dias e a não feita reaparece como pendente', async () => {
    const h = harness();
    const task = await h.actions.createTask(
      input({ title: 'Redes sociais', areaId: h.area('Agência de viagens'), kind: 'weekdays', weekdays: [1, 3, 5] }),
    );
    h.goTo(MON);
    expect(h.view().planned.some((i) => i.task.id === task.id)).toBe(true);

    h.goTo(addDays(MON, 1)); // Tuesday
    const tue = h.view();
    expect(tue.planned.some((i) => i.task.id === task.id)).toBe(false);
    const pending = tue.overdueGroups.flatMap((g) => g.items).filter((i) => i.task.id === task.id);
    expect(pending).toHaveLength(1);
    expect(pending[0].occ!.targetDate).toBe(MON);

    h.goTo(addDays(MON, 2)); // Wednesday: new separate occurrence + the Monday one still pending
    const wed = h.view();
    expect(wed.planned.filter((i) => i.task.id === task.id)).toHaveLength(1);
    expect(wed.overdueGroups.flatMap((g) => g.items).filter((i) => i.task.id === task.id)).toHaveLength(1);
    expect(h.data.occurrences.filter((o) => o.taskId === task.id)).toHaveLength(2);
  });

  it('9. estudo de 3D 3x/semana: cada conclusão reduz o saldo e a antecipação não duplica', async () => {
    const h = harness();
    const study = await h.actions.createTask(
      input({ title: 'Estudo de 3D', areaId: h.area('Impressão 3D'), kind: 'weekly', timesPerWeek: 3 }),
    );
    let item = h.view().planned.find((i) => i.task.id === study.id)!;
    expect(item.remaining).toBe(3);
    await h.actions.complete({ task: study, occ: null }, 30 * 60);
    expect(weeklyRemaining(h.data, study, h.today)).toBe(2);
    item = h.view().planned.find((i) => i.task.id === study.id)!;
    expect(item.remaining).toBe(2);

    // Anticipating a weekday activity: Wednesday's occurrence done on Monday is not generated again.
    const prints = await h.actions.createTask(
      input({ title: 'Projeto 3D', areaId: h.area('Impressão 3D'), kind: 'weekdays', weekdays: [3] }),
    );
    h.goTo(MON);
    const cand = bringToTodayCandidates(h.data, h.today).find((c) => c.task.id === prints.id)!;
    expect(cand.date).toBe(addDays(MON, 2));
    await h.actions.bringToToday(cand.task, cand.date, null);
    const anticipated = h.view().planned.find((i) => i.task.id === prints.id)!;
    await h.actions.complete({ task: prints, occ: anticipated.occ }, 60);

    h.goTo(addDays(MON, 2));
    expect(h.data.occurrences.filter((o) => o.taskId === prints.id)).toHaveLength(1);
    expect(h.view().planned.some((i) => i.task.id === prints.id)).toBe(false);
    expect(weeklySummary(h.data, MON).find((r) => r.task.id === prints.id)).toMatchObject({ done: 1, goal: 1 });
  });

  it('10. check-in com prazo: aparece antes, fica atrasado depois e gera aviso com o app aberto', async () => {
    const h = harness();
    const due = `${addDays(MON, 2)}T10:00`;
    const task = await h.actions.createTask(
      input({ title: 'Check-in cliente', areaId: h.area('Agência de viagens'), dueAt: due, reminderAt: due }),
    );
    let deadline = h.view().deadlines.find((i) => i.task.id === task.id)!;
    expect(deadline.late).toBe(false);
    expect(dueReminders(h.data, h.today, new Date())).toHaveLength(0);

    h.goTo(addDays(MON, 2), '10:01');
    const fired = dueReminders(h.data, h.today, new Date());
    expect(fired.map((r) => r.taskId)).toEqual([task.id]);
    await h.actions.markReminders(fired);
    expect(dueReminders(h.data, h.today, new Date())).toHaveLength(0); // not repeated

    await h.actions.markReminders(fired, 15); // "lembrar mais tarde"
    vi.setSystemTime(new Date(`${h.today}T10:20:00`));
    expect(dueReminders(h.data, h.today, new Date())).toHaveLength(1);

    h.goTo(addDays(MON, 3));
    deadline = h.view().deadlines.find((i) => i.task.id === task.id)!;
    expect(deadline.late).toBe(true);
  });

  it('11. cronômetro: pausar, recarregar e retomar sem perda nem contagem duplicada', async () => {
    const h = harness();
    const task = await h.actions.createTask(
      input({ title: 'Cotação', areaId: h.area('Agência de viagens'), plannedDate: MON }),
    );
    const occ = h.view().planned.find((i) => i.task.id === task.id)!.occ!;
    vi.setSystemTime(new Date(`${MON}T09:00:00`));
    await h.actions.startTimer({ task, occ });
    vi.setSystemTime(new Date(`${MON}T09:10:00`));
    await h.actions.pauseTimer();

    // "Reload": recompute purely from persisted records after serialization.
    const reloaded: Data = JSON.parse(JSON.stringify(h.data));
    vi.setSystemTime(new Date(`${MON}T09:30:00`));
    expect(occSeconds(occ.id, reloaded.sessions, new Date())).toBe(600);

    await h.actions.startTimer({ task, occ });
    vi.setSystemTime(new Date(`${MON}T09:35:00`));
    // Reload while running: elapsed comes from the stored start timestamp.
    const whileRunning: Data = JSON.parse(JSON.stringify(h.data));
    expect(occSeconds(occ.id, whileRunning.sessions, new Date())).toBe(900);
    expect(await h.actions.startTimer({ task, occ })).toBe('started'); // same task: no second session
    expect(h.data.sessions.filter((s) => s.end === null)).toHaveLength(1);

    await h.actions.pauseTimer();
    expect(occSeconds(occ.id, h.data.sessions, new Date(`${MON}T12:00:00`))).toBe(900);
  });

  it('11b. só um cronômetro ativo: iniciar outro pede escolha e trocar pausa o anterior', async () => {
    const h = harness();
    const a = await h.actions.createTask(input({ title: 'A', areaId: h.area('Pães'), plannedDate: MON }));
    const b = await h.actions.createTask(input({ title: 'B', areaId: h.area('Pães'), plannedDate: MON }));
    const occA = h.data.occurrences.find((o) => o.taskId === a.id)!;
    const occB = h.data.occurrences.find((o) => o.taskId === b.id)!;
    await h.actions.startTimer({ task: a, occ: occA });
    expect(await h.actions.startTimer({ task: b, occ: occB })).toBe('conflict');
    await h.actions.startTimer({ task: b, occ: occB }, { force: true });
    expect(runningSession(h.data.sessions)!.occurrenceId).toBe(occB.id);
    expect(h.data.sessions.filter((s) => s.end === null)).toHaveLength(1);
  });

  it('12. ausente por dias: o resumo mostra prazos e pendências sem descartar nada', async () => {
    const h = harness();
    const dutch = await h.actions.createTask(
      input({ title: 'Holandês', areaId: h.area('Holandês'), kind: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] }),
    );
    const due = await h.actions.createTask(
      input({ title: 'Entrega 3D', areaId: h.area('Impressão 3D'), dueAt: `${addDays(MON, 2)}T18:00` }),
    );
    h.goTo(MON);
    h.goTo(addDays(MON, 4)); // reopens Friday

    const v = h.view();
    const dutchPending = v.overdueGroups.find((g) => g.area.name === 'Holandês')!.items;
    expect(dutchPending.map((i) => i.occ!.targetDate)).toEqual([MON, addDays(MON, 1), addDays(MON, 2), addDays(MON, 3)]);
    expect(v.planned.some((i) => i.task.id === dutch.id)).toBe(true);
    expect(v.deadlines.find((i) => i.task.id === due.id)!.late).toBe(true);
    expect(h.data.occurrences.every((o) => o.status === 'pending')).toBe(true);
  });

  it('pendência pode ser adiada (mantendo a ligação) ou ignorada sem apagar o registro', async () => {
    const h = harness();
    const t = await h.actions.createTask(input({ title: 'X', areaId: h.area('Pães'), plannedDate: MON }));
    h.goTo(addDays(MON, 1));
    const occ = h.view().overdueGroups[0].items[0].occ!;
    await h.actions.postpone(occ, addDays(MON, 3));
    const moved = h.data.occurrences.find((o) => o.id === occ.id)!;
    expect(moved).toMatchObject({ plannedDate: addDays(MON, 3), targetDate: MON, postponedFrom: MON });
    expect(h.view().overdueGroups).toHaveLength(0);

    await h.actions.skip([moved]);
    expect(h.data.occurrences.find((o) => o.id === occ.id)!.status).toBe('skipped');
    expect(h.data.tasks.some((x) => x.id === t.id)).toBe(true);
  });

  it('conclusão atrasada conta no dia em que foi feita e preserva a data planejada', async () => {
    const h = harness();
    const t = await h.actions.createTask(
      input({ title: 'Revisão', areaId: h.area('Holandês'), kind: 'weekdays', weekdays: [1] }),
    );
    h.goTo(MON);
    h.goTo(addDays(MON, 2));
    const occ = h.view().overdueGroups[0].items[0].occ!;
    await h.actions.complete({ task: t, occ }, 600);
    const done = h.data.occurrences.find((o) => o.id === occ.id)!;
    expect(done.doneDate).toBe(addDays(MON, 2));
    expect(done.targetDate).toBe(MON);
  });

  it('arquivar retira do planejamento sem apagar o histórico; excluir remove tudo', async () => {
    const h = harness();
    const t = await h.actions.createTask(
      input({ title: 'Diária', areaId: h.area('Holandês'), kind: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] }),
    );
    h.goTo(MON);
    const occ = h.view().planned[0].occ!;
    await h.actions.complete({ task: t, occ }, 300);
    await h.actions.setTaskFlags(h.data.tasks[0], { archived: true });
    h.goTo(addDays(MON, 1));
    expect(h.view().planned).toHaveLength(0);
    expect(h.data.occurrences).toHaveLength(1);
    expect(h.data.sessions).toHaveLength(1);

    await h.actions.deleteTask(t.id);
    expect(h.data.tasks).toHaveLength(0);
    expect(h.data.occurrences).toHaveLength(0);
    expect(h.data.sessions).toHaveLength(0);
  });
});
