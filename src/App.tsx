import { useEffect, useState } from 'react';
import { useStore } from './data/store';
import { Icon, type IconName } from './ui/icons';
import { useReminders } from './ui/useReminders';
import { HistoryView } from './views/HistoryView';
import { SettingsView } from './views/SettingsView';
import { TasksView } from './views/TasksView';
import { TimerBar } from './views/TimerBar';
import { TodayView } from './views/TodayView';

const TABS: { id: string; label: string; icon: IconName }[] = [
  { id: 'hoje', label: 'Hoje', icon: 'today' },
  { id: 'tarefas', label: 'Projetos e hábitos', icon: 'tasks' },
  { id: 'historico', label: 'Histórico', icon: 'history' },
  { id: 'config', label: 'Configurações', icon: 'settings' },
];

function tabFromHash(): string {
  const h = window.location.hash.replace('#', '');
  return TABS.find((t) => t.id === h)?.id ?? 'hoje';
}

export function App() {
  const { error } = useStore();
  const [tab, setTab] = useState(tabFromHash);
  const { missed, clearMissed } = useReminders();

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.getElementById('main')?.focus();
  }, [tab]);

  return (
    <div className="app">
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Pular para o conteúdo
      </a>
      <aside className="sidebar">
        <span className="brand">Constância</span>
        <nav aria-label="Navegação principal">
          {TABS.map((t) => (
            <a
              key={t.id}
              href={`#${t.id}`}
              className={tab === t.id ? 'nav-item on' : 'nav-item'}
              aria-current={tab === t.id ? 'page' : undefined}
            >
              <Icon name={t.icon} />
              <span>{t.label}</span>
            </a>
          ))}
        </nav>
        <p className="sidebar-foot">Dados salvos neste navegador</p>
      </aside>
      <div className="content">
        <TimerBar />
        {error && (
          <div className="banner error" role="alert">
            {error}
          </div>
        )}
        <main id="main" tabIndex={-1}>
          {tab === 'hoje' && <TodayView missed={missed} clearMissed={clearMissed} />}
          {tab === 'tarefas' && <TasksView />}
          {tab === 'historico' && <HistoryView />}
          {tab === 'config' && <SettingsView />}
        </main>
      </div>
    </div>
  );
}
