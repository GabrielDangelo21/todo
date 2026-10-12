import { formatClock, formatDateTime, formatDuration, formatMinutes, formatShort } from '../domain/dates';
import type { TodayItem } from '../domain/planning';
import { occSeconds, runningSession } from '../domain/timer';
import { useNow, useStore } from '../data/store';
import { useItemActions } from '../ui/useItemActions';

function LiveSeconds({ occId }: { occId: string }) {
  const { data } = useStore();
  const now = useNow(1000);
  return <>{formatClock(occSeconds(occId, data.sessions, now))}</>;
}

export function StatusBadge({ icon, label, tone }: { icon: string; label: string; tone: string }) {
  return (
    <span className={`status ${tone}`}>
      <span aria-hidden="true">{icon}</span> {label}
    </span>
  );
}

export function ItemRow({ item, showResume }: { item: TodayItem; showResume?: boolean }) {
  const { data, actions } = useStore();
  const act = useItemActions();
  const { task, occ } = item;
  const area = data.areas.find((a) => a.id === task.areaId);
  const running = runningSession(data.sessions);
  const isRunning = !!occ && running?.occurrenceId === occ.id;
  const recorded = occ ? occSeconds(occ.id, data.sessions, new Date()) : 0;
  const target = { task, occ };

  let status: { icon: string; label: string; tone: string };
  if (item.kind === 'done') status = { icon: '✓', label: 'Concluída', tone: 'done' };
  else if (isRunning) status = { icon: '▶', label: 'Em andamento', tone: 'running' };
  else if (item.kind === 'deadline' && item.late) status = { icon: '⚠', label: 'Prazo vencido', tone: 'late' };
  else if (item.kind === 'overdue')
    status = { icon: '⚠', label: `Pendente desde ${formatShort(occ!.targetDate ?? occ!.plannedDate!)}`, tone: 'late' };
  else if (recorded > 0) status = { icon: '⏸', label: 'Pausada', tone: 'paused' };
  else if (item.kind === 'weekly') status = { icon: '↻', label: 'Meta semanal', tone: 'pending' };
  else status = { icon: '○', label: 'Pendente', tone: 'pending' };

  const anticipated = occ && occ.targetDate && occ.plannedDate && occ.targetDate > occ.plannedDate && item.kind !== 'done';
  const lateDone = item.kind === 'done' && occ?.targetDate && occ.doneDate && occ.targetDate !== occ.doneDate;

  return (
    <li className={`item ${status.tone}`}>
      <div className="item-main">
        <div className="item-title">
          <StatusBadge {...status} />
          <span className="title">{task.title}</span>
          {task.priority === 'alta' && <span className="tag prio">Prioridade alta</span>}
        </div>
        {task.description && <p className="item-desc">{task.description}</p>}
        <div className="meta">
          <span className="tag area">{area?.name ?? 'Sem área'}</span>
          <span>{formatMinutes(task.minutes)} previstos</span>
          {task.dueAt && <span>Prazo: {formatDateTime(task.dueAt)}</span>}
          {occ && (isRunning || recorded > 0) && (
            <span>Registrado: {isRunning ? <LiveSeconds occId={occ.id} /> : formatDuration(recorded)}</span>
          )}
          {item.kind === 'weekly' && (
            <span>
              Faltam {item.remaining} de {task.timesPerWeek} nesta semana
            </span>
          )}
          {anticipated && <span>Adiantada de {formatShort(occ!.targetDate!)}</span>}
          {lateDone && <span>Planejada para {formatShort(occ!.targetDate!)}</span>}
        </div>
      </div>
      <div className="item-actions">
        {item.kind === 'done' ? (
          <button type="button" className="btn small" onClick={() => occ && actions.reopen(occ)}>
            Desfazer conclusão
          </button>
        ) : (
          <>
            {isRunning ? (
              <button type="button" className="btn" onClick={() => act.pause()}>
                ⏸ Pausar
              </button>
            ) : (
              <button type="button" className="btn" onClick={() => act.start(target)}>
                ▶ {recorded > 0 ? 'Retomar' : 'Iniciar'}
              </button>
            )}
            <button type="button" className="btn primary" onClick={() => act.complete(target)}>
              ✓ Concluir
            </button>
            <div className="secondary-actions">
              {showResume && occ && (
                <button type="button" className="link-btn" onClick={() => actions.resumeToday(occ)}>
                  Retomar hoje
                </button>
              )}
              <button type="button" className="link-btn" onClick={() => act.addTime(target)}>
                + Tempo
              </button>
              {occ && (
                <>
                  <button type="button" className="link-btn" onClick={() => act.postpone(occ)}>
                    Adiar
                  </button>
                  <button type="button" className="link-btn" onClick={() => act.skip([occ], `"${task.title}"`)}>
                    Ignorar
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </li>
  );
}
