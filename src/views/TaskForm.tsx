import { useState } from 'react';
import { orderedWeekdays, WEEKDAY_SHORT } from '../domain/dates';
import type { TaskInput } from '../domain/defaults';
import type { Priority, Task, TaskKind } from '../domain/types';
import { useStore } from '../data/store';
import { Modal } from '../ui/ui';

export function TaskForm({ task, close }: { task?: Task; close: () => void }) {
  const { data, today, actions } = useStore();
  const areas = [...data.areas].sort((a, b) => a.order - b.order).filter((a) => a.active || a.id === task?.areaId);
  const pendingOnce = task ? data.occurrences.find((o) => o.taskId === task.id && o.status === 'pending') : undefined;

  const [title, setTitle] = useState(task?.title ?? '');
  const [areaId, setAreaId] = useState(task?.areaId ?? areas[0]?.id ?? '');
  const [minutes, setMinutes] = useState(task ? String(task.minutes) : '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [kind, setKind] = useState<TaskKind>(task?.kind ?? 'once');
  const [weekdays, setWeekdays] = useState<number[]>(task?.weekdays ?? []);
  const [timesPerWeek, setTimesPerWeek] = useState(task?.timesPerWeek ? String(task.timesPerWeek) : '');
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'normal');
  const [plannedDate, setPlannedDate] = useState(task ? (pendingOnce?.plannedDate ?? '') : today);
  const [dueAt, setDueAt] = useState(task?.dueAt ?? '');
  const [reminderOn, setReminderOn] = useState(!!(task?.reminderAt || task?.dailyReminder));
  const [reminderAt, setReminderAt] = useState(task?.reminderAt ?? '');
  const [dailyReminder, setDailyReminder] = useState(task?.dailyReminder ?? '08:00');
  const [active, setActive] = useState(task?.active ?? true);
  const [errors, setErrors] = useState<string[]>([]);

  const toggleDay = (d: number) => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]));

  const submit = async () => {
    const errs: string[] = [];
    const mins = Number(minutes);
    const times = Number(timesPerWeek);
    if (!title.trim()) errs.push('Informe o título.');
    if (!areaId) errs.push('Escolha uma área.');
    if (!Number.isInteger(mins) || mins < 1 || mins > 1440) errs.push('A duração deve ser um número inteiro de minutos (1 a 1440).');
    if (kind === 'weekdays' && weekdays.length === 0) errs.push('Selecione ao menos um dia da semana.');
    if (kind === 'weekly' && (!Number.isInteger(times) || times < 1 || times > 7)) errs.push('A meta semanal deve ser de 1 a 7 vezes.');
    if (kind === 'once' && reminderOn && !reminderAt) errs.push('Informe a data e hora do lembrete.');
    if (kind !== 'once' && reminderOn && !dailyReminder) errs.push('Informe o horário do lembrete diário.');
    setErrors(errs);
    if (errs.length) return;

    const input: TaskInput = {
      areaId,
      title,
      description,
      minutes: mins,
      kind,
      weekdays,
      timesPerWeek: times,
      priority,
      dueAt: dueAt || null,
      reminderAt: reminderOn && reminderAt ? reminderAt : null,
      dailyReminder: reminderOn && dailyReminder ? dailyReminder : null,
      plannedDate: plannedDate || null,
      active,
    };
    if (task) await actions.updateTask(task, input);
    else await actions.createTask(input);
    close();
  };

  return (
    <Modal title={task ? 'Editar tarefa' : 'Nova tarefa'} onClose={close} wide>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {errors.length > 0 && (
          <ul className="form-errors" role="alert">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <label className="field">
          <span>Título *</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required maxLength={120} />
        </label>
        <div className="grid-3">
          <label className="field">
            <span>Área *</span>
            <select value={areaId} onChange={(e) => setAreaId(e.target.value)} required>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Duração (min) *</span>
            <input type="number" min={1} max={1440} placeholder="15" value={minutes} onChange={(e) => setMinutes(e.target.value)} required />
          </label>
          <label className="field">
            <span>Prioridade</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="baixa">Baixa</option>
              <option value="normal">Normal</option>
              <option value="alta">Alta</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span>Descrição curta</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
        </label>

        <label className="field">
          <span>Tipo</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as TaskKind)}>
            <option value="once">Tarefa pontual</option>
            <option value="weekdays">Repetição em dias específicos da semana</option>
            <option value="weekly">Meta de X vezes por semana</option>
          </select>
        </label>

        {kind === 'weekdays' && (
          <fieldset className="field">
            <legend>Dias da semana *</legend>
            <div className="weekdays">
              {orderedWeekdays(data.prefs.weekStart).map((d) => (
                <label key={d} className={weekdays.includes(d) ? 'day on' : 'day'}>
                  <input type="checkbox" checked={weekdays.includes(d)} onChange={() => toggleDay(d)} />
                  {WEEKDAY_SHORT[d]}
                </label>
              ))}
              <button type="button" className="link-btn" onClick={() => setWeekdays([0, 1, 2, 3, 4, 5, 6])}>
                Todos os dias
              </button>
            </div>
          </fieldset>
        )}

        {kind === 'weekly' && (
          <label className="field narrow">
            <span>Vezes por semana *</span>
            <input type="number" min={1} max={7} placeholder="3" value={timesPerWeek} onChange={(e) => setTimesPerWeek(e.target.value)} />
          </label>
        )}

        {kind === 'once' && (
          <div className="grid-2">
            <label className="field">
              <span>Planejar para (opcional)</span>
              <input type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} />
            </label>
            <label className="field">
              <span>Prazo (opcional)</span>
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => {
                  setDueAt(e.target.value);
                  if (e.target.value && !reminderAt) {
                    setReminderAt(e.target.value);
                    setReminderOn(true);
                  }
                }}
              />
            </label>
          </div>
        )}

        <fieldset className="field">
          <legend>Lembrete no navegador</legend>
          <label className="check">
            <input type="checkbox" checked={reminderOn} onChange={(e) => setReminderOn(e.target.checked)} />
            {kind === 'once' ? 'Avisar em uma data e hora' : 'Aviso diário enquanto houver atividade no dia'}
          </label>
          {reminderOn &&
            (kind === 'once' ? (
              <input
                type="datetime-local"
                aria-label="Data e hora do lembrete"
                value={reminderAt}
                onChange={(e) => setReminderAt(e.target.value)}
              />
            ) : (
              <input type="time" aria-label="Horário do lembrete diário" value={dailyReminder} onChange={(e) => setDailyReminder(e.target.value)} />
            ))}
          <p className="hint">
            Os lembretes só aparecem enquanto o aplicativo estiver aberto no navegador. Avisos que vencerem com o
            navegador fechado aparecem no resumo da próxima abertura.
          </p>
        </fieldset>

        {task && (
          <label className="check">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Ativa (desmarque para pausar sem arquivar)
          </label>
        )}

        <div className="row end">
          <button type="button" className="btn" onClick={close}>
            Cancelar
          </button>
          <button type="submit" className="btn primary">
            {task ? 'Salvar' : 'Criar tarefa'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
