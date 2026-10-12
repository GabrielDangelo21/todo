import { useState } from 'react';
import { formatClock, formatMinutes } from '../domain/dates';
import { occSeconds, runningSession } from '../domain/timer';
import { useNow, useStore } from '../data/store';
import { useItemActions } from '../ui/useItemActions';

const DISMISS_KEY = 'constancia.timerNoticeDismissed';

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

export function TimerBar() {
  const { data } = useStore();
  const act = useItemActions();
  const now = useNow(1000);
  const [dismissed, setDismissed] = useState(readDismissed);
  const running = runningSession(data.sessions);
  if (!running) return null;
  const task = data.tasks.find((t) => t.id === running.taskId);
  const occ = data.occurrences.find((o) => o.id === running.occurrenceId);
  if (!task || !occ) return null;
  const elapsed = occSeconds(occ.id, data.sessions, now);
  const reached = elapsed >= task.minutes * 60 && dismissed !== occ.id;

  const dismiss = () => {
    setDismissed(occ.id);
    try {
      localStorage.setItem(DISMISS_KEY, occ.id);
    } catch {
      /* per-viewer convenience only */
    }
  };

  return (
    <div className="timer-bar" role="region" aria-label="Cronômetro ativo">
      <div className="timer-info">
        <span className="status running">
          <span aria-hidden="true">▶</span> Em andamento
        </span>
        <strong>{task.title}</strong>
        <span className="timer-clock" aria-live="off">
          {formatClock(elapsed)}
        </span>
        <span className="muted">de {formatMinutes(task.minutes)} previstos</span>
      </div>
      {reached && (
        <div className="timer-notice" role="status">
          Tempo previsto atingido.
          <button type="button" className="link-btn" onClick={dismiss}>
            Continuar
          </button>
        </div>
      )}
      <div className="row">
        <button type="button" className="btn" onClick={() => act.pause()}>
          ⏸ Pausar
        </button>
        <button type="button" className="btn primary" onClick={() => act.complete({ task, occ })}>
          ✓ Concluir
        </button>
      </div>
    </div>
  );
}
