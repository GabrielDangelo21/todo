import { useMemo, useState } from 'react';
import { daysBetween, formatDateTime, formatDuration, formatLong, formatShort } from '../domain/dates';
import { bringToTodayCandidates, buildToday, type TodayData } from '../domain/planning';
import type { DueReminder } from '../domain/reminders';
import { daySeconds, occSeconds } from '../domain/timer';
import { useNow, useStore } from '../data/store';
import { areaColor, StatCard } from '../ui/icons';
import { Modal, useUI } from '../ui/ui';
import { useItemActions } from '../ui/useItemActions';
import { ItemRow } from './ItemRow';

const COLLAPSE_THRESHOLD = 4;

function Totals({ view }: { view: TodayData }) {
  const { data, today } = useStore();
  const now = useNow(1000);
  let remaining = 0;
  for (const item of [...view.planned, ...view.deadlines]) {
    if (item.kind === 'deadline' && !item.late && item.task.dueAt!.slice(0, 10) > today) continue;
    const spent = item.occ ? occSeconds(item.occ.id, data.sessions, now) : 0;
    remaining += Math.max(0, item.task.minutes * 60 - spent);
  }
  const pending = view.overdueGroups.reduce((n, g) => n + g.items.length, 0);
  const late = view.deadlines.filter((d) => d.late).length;
  return (
    <div className="stats" aria-label="Resumo do dia">
      <StatCard label="Ainda previstos" value={formatDuration(remaining)} tone="cyan" />
      <StatCard label="Registrados hoje" value={formatDuration(daySeconds(today, data.sessions, now))} tone="green" />
      <StatCard label="Concluídas hoje" value={String(view.done.length)} tone="violet" />
      <StatCard label="Pendências" value={String(pending)} tone="amber" />
      <StatCard label="Prazos vencidos" value={String(late)} tone="red" />
    </div>
  );
}

function MorningSummary({ view, missed, onClose }: { view: TodayData; missed: DueReminder[]; onClose: () => void }) {
  const late = view.deadlines.filter((d) => d.late).length;
  const pending = view.overdueGroups.reduce((n, g) => n + g.items.length, 0);
  return (
    <section className="card summary" aria-labelledby="summary-title">
      <div className="row between">
        <h2 id="summary-title">Resumo do dia</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar resumo">
          ✕
        </button>
      </div>
      <ul className="summary-list">
        <li>
          <strong>{view.deadlines.length}</strong> prazo(s) nos próximos dias{late > 0 && <>, <strong>{late}</strong> vencido(s)</>}
        </li>
        <li>
          <strong>{pending}</strong> pendência(s) de dias anteriores
        </li>
        <li>
          <strong>{view.planned.length}</strong> atividade(s) planejada(s) para hoje
        </li>
      </ul>
      {missed.length > 0 && (
        <>
          <h3>Avisos enquanto o aplicativo estava fechado</h3>
          <ul className="summary-list">
            {missed.map((m) => (
              <li key={m.key}>
                <strong>{m.title}</strong> — {m.body} (aviso de {formatDateTime(m.at)})
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function QuickAdd() {
  const { data, actions } = useStore();
  const areas = data.areas.filter((a) => a.active).sort((a, b) => a.order - b.order);
  const [title, setTitle] = useState('');
  const [areaId, setAreaId] = useState(areas[0]?.id ?? '');
  const [minutes, setMinutes] = useState('');
  const valid = title.trim() && areaId && Number(minutes) >= 1;
  return (
    <form
      className="quick-add"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        await actions.quickAddToday(title, areaId, Math.round(Number(minutes)));
        setTitle('');
      }}
    >
      <label className="field grow">
        <span>Nova tarefa pontual para hoje</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Entregar pedido de pães" required />
      </label>
      <label className="field">
        <span>Área</span>
        <select value={areaId} onChange={(e) => setAreaId(e.target.value)} required>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field narrow">
        <span>Minutos</span>
        <input type="number" min={1} max={1440} placeholder="15" value={minutes} onChange={(e) => setMinutes(e.target.value)} required />
      </label>
      <button type="submit" className="btn primary" disabled={!valid}>
        Adicionar
      </button>
    </form>
  );
}

function BringDialog({ close }: { close: () => void }) {
  const { data, today, actions } = useStore();
  const candidates = bringToTodayCandidates(data, today);
  return (
    <Modal title="Fazer hoje" onClose={close} wide>
      <p className="hint">
        Adiante uma atividade recorrente (ela conta na semana e não se repete no dia original) ou planeje para hoje uma
        tarefa pontual.
      </p>
      {candidates.length === 0 ? (
        <p className="empty">Nenhuma tarefa disponível para trazer para hoje.</p>
      ) : (
        <ul className="plain-list">
          {candidates.map((c) => (
            <li key={`${c.task.id}-${c.date}`} className="row between">
              <span>
                <strong>{c.task.title}</strong>{' '}
                <span className="muted">
                  {c.date
                    ? `· prevista para ${formatShort(c.date)}`
                    : c.occ?.plannedDate
                      ? `· planejada para ${formatShort(c.occ.plannedDate)}`
                      : '· sem data'}
                </span>
              </span>
              <button
                type="button"
                className="btn small"
                onClick={async () => {
                  await actions.bringToToday(c.task, c.date, c.occ);
                  close();
                }}
              >
                Fazer hoje
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

export function TodayView({ missed, clearMissed }: { missed: DueReminder[]; clearMissed: () => void }) {
  const { data, today, morning, dismissMorning } = useStore();
  const ui = useUI();
  const act = useItemActions();
  const minuteNow = useNow(30_000);
  const view = useMemo(() => buildToday(data, today, minuteNow), [data, today, minuteNow]);
  const pendingCount = view.overdueGroups.reduce((n, g) => n + g.items.length, 0);
  const backupAge = data.prefs.lastBackupAt ? daysBetween(data.prefs.lastBackupAt.slice(0, 10), today) : null;

  return (
    <div className="view">
      {(morning || missed.length > 0) && (
        <MorningSummary
          view={view}
          missed={missed}
          onClose={() => {
            dismissMorning();
            clearMissed();
          }}
        />
      )}

      <header className="view-head">
        <div>
          <h1>Hoje</h1>
          <p className="muted capitalize">{formatLong(today)}</p>
        </div>
      </header>
      <Totals view={view} />

      <section className="card">
        <QuickAdd />
        <div className="row">
          <button type="button" className="btn" onClick={() => ui.dialog<void>((close) => <BringDialog close={() => close()} />)}>
            Adiantar ou trazer tarefa para hoje…
          </button>
        </div>
      </section>

      <section aria-labelledby="sec-deadlines">
        <h2 id="sec-deadlines">Prazos</h2>
        {view.deadlines.length === 0 ? (
          <p className="empty">Nenhum prazo vencido ou nos próximos 7 dias.</p>
        ) : (
          <ul className="items">
            {view.deadlines.map((item) => (
              <ItemRow key={item.key} item={item} />
            ))}
          </ul>
        )}
      </section>

      {pendingCount > 0 && (
        <section aria-labelledby="sec-overdue">
          <h2 id="sec-overdue">Pendentes de dias anteriores ({pendingCount})</h2>
          {view.overdueGroups.map((g) => (
            <details key={g.area.id} className="group" open={pendingCount <= COLLAPSE_THRESHOLD}>
              <summary>
                <span className="dot" style={{ background: areaColor(g.area.order) }} />
                <span className="group-title">{g.area.name}</span>
                <span className="count">{g.items.length} pendente(s)</span>
              </summary>
              <div className="group-tools">
                <button
                  type="button"
                  className="link-btn"
                  onClick={() =>
                    act.skip(
                      g.items.map((i) => i.occ!),
                      `Todas as ${g.items.length} pendência(s) de ${g.area.name}`,
                    )
                  }
                >
                  Ignorar todas desta área
                </button>
              </div>
              <ul className="items">
                {g.items.map((item) => (
                  <ItemRow key={item.key} item={item} showResume />
                ))}
              </ul>
            </details>
          ))}
        </section>
      )}

      <section aria-labelledby="sec-planned">
        <h2 id="sec-planned">Planejadas para hoje</h2>
        {view.planned.length === 0 ? (
          <p className="empty">Nada planejado. Adicione uma tarefa acima ou cadastre hábitos em Tarefas.</p>
        ) : (
          <ul className="items">
            {view.planned.map((item) => (
              <ItemRow key={item.key} item={item} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="sec-done">
        <h2 id="sec-done">Concluídas hoje</h2>
        {view.done.length === 0 ? (
          <p className="empty">Nenhuma ainda.</p>
        ) : (
          <ul className="items">
            {view.done.map((item) => (
              <ItemRow key={item.key} item={item} />
            ))}
          </ul>
        )}
      </section>

      {(backupAge === null || backupAge >= 7) && (
        <p className="hint backup-hint">
          {backupAge === null
            ? 'Você ainda não exportou uma cópia de segurança.'
            : `Último backup há ${backupAge} dias.`}{' '}
          Os dados ficam apenas neste navegador — exporte uma cópia em Configurações.
        </p>
      )}
    </div>
  );
}
