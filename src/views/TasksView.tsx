import { useState } from 'react';
import { addDays, formatDateTime, formatMinutes, formatShort, WEEKDAY_SHORT, orderedWeekdays } from '../domain/dates';
import { doneCountInRange, nextDateOf, weeklyRemaining } from '../domain/planning';
import type { Task } from '../domain/types';
import { useStore } from '../data/store';
import { useUI } from '../ui/ui';
import { StatusBadge } from './ItemRow';
import { TaskForm } from './TaskForm';

type Filter = 'todas' | 'recorrentes' | 'pontuais' | 'concluidas' | 'arquivadas';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'recorrentes', label: 'Recorrentes' },
  { id: 'pontuais', label: 'Pontuais' },
  { id: 'concluidas', label: 'Concluídas' },
  { id: 'arquivadas', label: 'Arquivadas' },
];

export function TasksView() {
  const { data, today, actions } = useStore();
  const ui = useUI();
  const [filter, setFilter] = useState<Filter>('todas');

  const onceDone = (t: Task) =>
    t.kind === 'once' && !data.occurrences.some((o) => o.taskId === t.id && o.status === 'pending');

  const matches = (t: Task) => {
    switch (filter) {
      case 'todas':
        return !t.archived;
      case 'recorrentes':
        return !t.archived && t.kind !== 'once';
      case 'pontuais':
        return !t.archived && t.kind === 'once' && !onceDone(t);
      case 'concluidas':
        return !t.archived && onceDone(t);
      case 'arquivadas':
        return t.archived;
    }
  };

  const openForm = (task?: Task) => ui.dialog<void>((close) => <TaskForm task={task} close={() => close()} />);

  const schedule = (t: Task) => {
    if (t.kind === 'weekdays') {
      if (t.weekdays.length === 7) return 'Todos os dias';
      return orderedWeekdays(data.prefs.weekStart)
        .filter((d) => t.weekdays.includes(d))
        .map((d) => WEEKDAY_SHORT[d])
        .join(', ');
    }
    if (t.kind === 'weekly') return `${t.timesPerWeek}× por semana`;
    return t.dueAt ? `Pontual · prazo ${formatDateTime(t.dueAt)}` : 'Pontual';
  };

  const areas = [...data.areas].sort((a, b) => a.order - b.order);
  const tasks = data.tasks.filter(matches);

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <h1>Projetos e hábitos</h1>
          <p className="muted">Tarefas por área, próximas datas e progresso recente.</p>
        </div>
        <button type="button" className="btn primary" onClick={() => openForm()}>
          + Nova tarefa
        </button>
      </header>

      <div className="filters" role="group" aria-label="Filtrar tarefas">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={filter === f.id ? 'chip on' : 'chip'}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {tasks.length === 0 && <p className="empty">Nenhuma tarefa neste filtro.</p>}

      {areas.map((area) => {
        const list = tasks
          .filter((t) => t.areaId === area.id)
          .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
        if (list.length === 0) return null;
        return (
          <section key={area.id} aria-label={area.name}>
            <h2>
              {area.name} {!area.active && <span className="tag">Área oculta</span>}
            </h2>
            <ul className="items">
              {list.map((t) => {
                const next = nextDateOf(data, t, today);
                const recent = doneCountInRange(data, t.id, addDays(today, -6), today);
                const pendingOnce =
                  t.kind === 'once' ? data.occurrences.find((o) => o.taskId === t.id && o.status === 'pending') : undefined;
                const status = t.archived
                  ? { icon: '▣', label: 'Arquivada', tone: 'muted' }
                  : !t.active
                    ? { icon: '⏸', label: 'Pausada', tone: 'paused' }
                    : onceDone(t)
                      ? { icon: '✓', label: 'Concluída', tone: 'done' }
                      : { icon: '●', label: 'Ativa', tone: 'pending' };
                return (
                  <li key={t.id} className="item">
                    <div className="item-main">
                      <div className="item-title">
                        <StatusBadge {...status} />
                        <span className="title">{t.title}</span>
                        {t.priority === 'alta' && <span className="tag prio">Prioridade alta</span>}
                      </div>
                      {t.description && <p className="item-desc">{t.description}</p>}
                      <div className="meta">
                        <span>{schedule(t)}</span>
                        <span>{formatMinutes(t.minutes)}</span>
                        {next && !t.archived && <span>Próxima: {next === today ? 'hoje' : formatShort(next)}</span>}
                        {t.kind === 'weekly' && !t.archived && (
                          <span>Faltam {weeklyRemaining(data, t, today)} nesta semana</span>
                        )}
                        {t.kind !== 'once' && <span>Últimos 7 dias: {recent} concluída(s)</span>}
                        {(t.reminderAt || t.dailyReminder) && (
                          <span>Lembrete: {t.dailyReminder ?? formatDateTime(t.reminderAt!)}</span>
                        )}
                      </div>
                    </div>
                    <div className="item-actions">
                      <button type="button" className="btn small" onClick={() => openForm(t)}>
                        Editar
                      </button>
                      {pendingOnce && pendingOnce.plannedDate !== today && !t.archived && (
                        <button type="button" className="btn small" onClick={() => actions.bringToToday(t, null, pendingOnce)}>
                          Fazer hoje
                        </button>
                      )}
                      {!t.archived && (
                        <button type="button" className="btn small" onClick={() => actions.setTaskFlags(t, { active: !t.active })}>
                          {t.active ? 'Pausar' : 'Reativar'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => actions.setTaskFlags(t, { archived: !t.archived })}
                      >
                        {t.archived ? 'Desarquivar' : 'Arquivar'}
                      </button>
                      <button
                        type="button"
                        className="btn small danger"
                        onClick={async () => {
                          const ok = await ui.confirm({
                            title: 'Excluir tarefa',
                            message: (
                              <>
                                Excluir <strong>{t.title}</strong> remove a tarefa e todo o seu histórico de ocorrências e
                                sessões. Para apenas tirá-la do planejamento, use Arquivar.
                              </>
                            ),
                            ok: 'Excluir definitivamente',
                            danger: true,
                          });
                          if (ok) await actions.deleteTask(t.id);
                        }}
                      >
                        Excluir
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
