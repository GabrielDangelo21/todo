import { useState } from 'react';
import { addDays, dateOfIso, formatDuration, formatLong, formatShort, formatTime, weekStartOf } from '../domain/dates';
import { weeklySummary } from '../domain/planning';
import { daySeconds, sessionSeconds } from '../domain/timer';
import type { DateStr, Occurrence } from '../domain/types';
import { useNow, useStore } from '../data/store';
import { useUI } from '../ui/ui';
import { useItemActions } from '../ui/useItemActions';
import { StatusBadge } from './ItemRow';

function SessionList({ occ }: { occ: Occurrence }) {
  const { data, actions } = useStore();
  const act = useItemActions();
  const ui = useUI();
  const now = useNow(5000);
  const sessions = data.sessions.filter((s) => s.occurrenceId === occ.id).sort((a, b) => a.start.localeCompare(b.start));
  if (sessions.length === 0) return <p className="hint">Sem tempo registrado.</p>;
  return (
    <ul className="sessions">
      {sessions.map((s) => (
        <li key={s.id}>
          <span>
            {formatShort(dateOfIso(s.start))} {formatTime(s.start)} · {formatDuration(sessionSeconds(s, now))}
            {s.manual && ' · manual'}
            {s.edited && ' · corrigida'}
            {!s.end && ' · em andamento'}
          </span>
          {s.end && (
            <span className="row">
              <button type="button" className="link-btn" onClick={() => act.editSession(s)}>
                Corrigir
              </button>
              <button
                type="button"
                className="link-btn danger"
                onClick={async () => {
                  if (await ui.confirm({ title: 'Remover sessão', message: 'Remover este registro de tempo?', ok: 'Remover', danger: true }))
                    await actions.deleteSession(s.id);
                }}
              >
                Remover
              </button>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Day({ day }: { day: DateStr }) {
  const { data, today } = useStore();
  const now = useNow(5000);
  const tasks = new Map(data.tasks.map((t) => [t.id, t]));
  const areas = new Map(data.areas.map((a) => [a.id, a]));
  const done = data.occurrences.filter((o) => o.status === 'done' && o.doneDate === day && tasks.has(o.taskId));
  const notDone = data.occurrences.filter(
    (o) =>
      o.status !== 'done' &&
      tasks.has(o.taskId) &&
      ((o.status === 'skipped' && o.skippedDate === day) || (o.status === 'pending' && o.targetDate === day)),
  );
  const occSec = (occ: Occurrence) =>
    data.sessions.filter((s) => s.occurrenceId === occ.id).reduce((n, s) => n + sessionSeconds(s, now), 0);
  const total = daySeconds(day, data.sessions, now);

  return (
    <section className="card"aria-label={formatLong(day)}>
      <div className="row between">
        <h3 className="capitalize">{formatLong(day)}</h3>
        <span className="muted">
          {done.length} concluída(s) · {formatDuration(total)} registrados
        </span>
      </div>
      {done.length === 0 && notDone.length === 0 && <p className="empty">Nada registrado.</p>}
      <ul className="history-list">
        {done.map((o) => {
          const t = tasks.get(o.taskId)!;
          return (
            <li key={o.id}>
              <details>
                <summary>
                  <StatusBadge icon="✓" label="Concluída" tone="done" /> <strong>{t.title}</strong>{' '}
                  <span className="muted">
                    · {areas.get(t.areaId)?.name} · {formatDuration(occSec(o))} de {t.minutes} min previstos
                    {o.targetDate && o.targetDate !== day && ` · planejada para ${formatShort(o.targetDate)}`}
                  </span>
                </summary>
                <SessionList occ={o} />
              </details>
            </li>
          );
        })}
        {notDone.map((o) => {
          const t = tasks.get(o.taskId)!;
          return (
            <li key={o.id} className="not-done">
              {o.status === 'skipped' ? (
                <StatusBadge icon="✕" label="Ignorada" tone="muted" />
              ) : (
                <StatusBadge icon="○" label={day === today ? 'Pendente' : 'Ficou pendente'} tone="late" />
              )}{' '}
              <strong>{t.title}</strong> <span className="muted">· {areas.get(t.areaId)?.name}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function HistoryView() {
  const { data, today } = useStore();
  const currentWeek = weekStartOf(today, data.prefs.weekStart);
  const [weekStart, setWeekStart] = useState(currentWeek);
  const weekEnd = addDays(weekStart, 6);
  const summary = weeklySummary(data, weekStart);
  const days: DateStr[] = [];
  for (let d = weekEnd; d >= weekStart; d = addDays(d, -1)) if (d <= today) days.push(d);

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <h1>Histórico</h1>
          <p className="muted">O que foi feito, o tempo registrado e o que ficou pendente.</p>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Semana anterior">
            ‹ Anterior
          </button>
          <span className="week-label">
            {formatShort(weekStart)} – {formatShort(weekEnd)}
          </span>
          <button
            type="button"
            className="btn"
            disabled={weekStart >= currentWeek}
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            aria-label="Próxima semana"
          >
            Próxima ›
          </button>
        </div>
      </header>

      <section className="card" aria-labelledby="weekly-title">
        <h2 id="weekly-title">Resumo da semana</h2>
        {summary.length === 0 ? (
          <p className="empty">Nenhuma tarefa recorrente.</p>
        ) : (
          <table className="summary-table">
            <thead>
              <tr>
                <th scope="col">Tarefa</th>
                <th scope="col">Concluídas</th>
                <th scope="col">Meta</th>
                <th scope="col">Progresso</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((r) => (
                <tr key={r.task.id}>
                  <td>{r.task.title}</td>
                  <td>{r.done}</td>
                  <td>{r.goal}</td>
                  <td>
                    <div className="bar" role="img" aria-label={`${r.done} de ${r.goal}`}>
                      <div className="bar-fill" style={{ width: `${r.goal ? Math.min(100, (r.done / r.goal) * 100) : 0}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {days.map((d) => (
        <Day key={d} day={d} />
      ))}
    </div>
  );
}
