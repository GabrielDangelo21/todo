import { useState } from 'react';
import { addDays, formatDuration } from '../domain/dates';
import { occSeconds, runningSession } from '../domain/timer';
import type { Occurrence, Session } from '../domain/types';
import { useStore, type TimerTarget } from '../data/store';
import { Modal, useUI } from './ui';

function MinutesDialog({
  title,
  intro,
  initial,
  okLabel,
  allowZero,
  close,
}: {
  title: string;
  intro: string;
  initial: number;
  okLabel: string;
  allowZero?: boolean;
  close: (v?: number) => void;
}) {
  const [value, setValue] = useState(String(initial));
  const n = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(n) && n >= 0 && (allowZero || n > 0) && n <= 24 * 60;
  return (
    <Modal title={title} onClose={() => close(undefined)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) close(Math.round(n * 60));
        }}
      >
        <p>{intro}</p>
        <label className="field">
          <span>Minutos</span>
          <input type="number" min={allowZero ? 0 : 1} max={1440} step={1} value={value} onChange={(e) => setValue(e.target.value)} autoFocus required />
        </label>
        {!valid && <p className="hint error">Informe um número de minutos válido.</p>}
        <div className="row end">
          <button type="button" className="btn" onClick={() => close(undefined)}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={!valid}>
            {okLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DateDialog({ title, initial, min, close }: { title: string; initial: string; min: string; close: (v?: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <Modal title={title} onClose={() => close(undefined)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value) close(value);
        }}
      >
        <label className="field">
          <span>Nova data</span>
          <input type="date" min={min} value={value} onChange={(e) => setValue(e.target.value)} autoFocus required />
        </label>
        <div className="row end">
          <button type="button" className="btn" onClick={() => close(undefined)}>
            Cancelar
          </button>
          <button type="submit" className="btn primary">
            Adiar
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function useItemActions() {
  const { data, today, actions } = useStore();
  const ui = useUI();

  const titleOf = (taskId: string) => data.tasks.find((t) => t.id === taskId)?.title ?? 'outra tarefa';

  return {
    async start(target: TimerTarget) {
      const res = await actions.startTimer(target);
      if (res !== 'conflict') return;
      const running = runningSession(data.sessions);
      const runningTitle = running ? titleOf(running.taskId) : 'a tarefa atual';
      const choice = await ui.dialog<'switch' | 'keep'>((close) => (
        <Modal title="Já há um cronômetro ativo" onClose={() => close('keep')}>
          <p>
            O cronômetro de <strong>{runningTitle}</strong> está em andamento. Só uma tarefa pode ser cronometrada por
            vez.
          </p>
          <div className="row end">
            <button type="button" className="btn" onClick={() => close('keep')} autoFocus>
              Continuar com {runningTitle}
            </button>
            <button type="button" className="btn primary" onClick={() => close('switch')}>
              Pausar e trocar para {target.task.title}
            </button>
          </div>
        </Modal>
      ));
      if (choice === 'switch') await actions.startTimer(target, { force: true });
    },

    pause: () => actions.pauseTimer(),

    async complete(target: TimerTarget) {
      const recorded = target.occ ? occSeconds(target.occ.id, data.sessions, new Date()) : 0;
      if (recorded > 0) {
        await actions.complete(target);
        return;
      }
      const seconds = await ui.dialog<number>((close) => (
        <MinutesDialog
          title={`Concluir: ${target.task.title}`}
          intro="Nenhum tempo foi cronometrado. Quanto tempo você dedicou? Use 0 para concluir sem registrar tempo."
          initial={target.task.minutes}
          okLabel="Concluir"
          allowZero
          close={close}
        />
      ));
      if (seconds !== undefined) await actions.complete(target, seconds);
    },

    async addTime(target: TimerTarget) {
      const seconds = await ui.dialog<number>((close) => (
        <MinutesDialog
          title={`Registrar tempo: ${target.task.title}`}
          intro="Registre manualmente o tempo dedicado a esta tarefa."
          initial={target.task.minutes}
          okLabel="Registrar"
          close={close}
        />
      ));
      if (seconds) await actions.addManualTime(target, seconds);
    },

    async postpone(occ: Occurrence) {
      const date = await ui.dialog<string>((close) => (
        <DateDialog title="Adiar ocorrência" initial={addDays(today, 1)} min={addDays(today, 1)} close={close} />
      ));
      if (date) await actions.postpone(occ, date);
    },

    async skip(occs: Occurrence[], label: string) {
      const ok = await ui.confirm({
        title: 'Ignorar',
        message: `${label} será encerrada como não feita. O registro continua no histórico.`,
        ok: 'Ignorar',
      });
      if (ok) await actions.skip(occs);
    },

    async editSession(session: Session) {
      const seconds = await ui.dialog<number>((close) => (
        <MinutesDialog
          title="Corrigir tempo da sessão"
          intro={`Tempo atual: ${formatDuration(session.seconds)}.`}
          initial={Math.round(session.seconds / 60)}
          okLabel="Salvar"
          allowZero
          close={close}
        />
      ));
      if (seconds !== undefined) await actions.editSession(session, seconds);
    },
  };
}
