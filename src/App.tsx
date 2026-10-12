import { useEffect, useState } from 'react';
import { useStore } from './data/store';
import { useReminders } from './ui/useReminders';
import { HistoryView } from './views/HistoryView';
import { SettingsView } from './views/SettingsView';
import { TasksView } from './views/TasksView';
import { TimerBar } from './views/TimerBar';
import { TodayView } from './views/TodayView';

const TABS = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'tarefas', label: 'Projetos e hábitos' },
  { id: 'historico', label: 'Histórico' },
  { id: 'config', label: 'Configurações' },
] as const;
type Tab = (typeof TABS)[number]['id'];

function tabFromHash(): Tab {
  const h = window.location.hash.replace('#', '');
  return (TABS.find((t) => t.id === h)?.id ?? 'hoje') as Tab;
}

export function App() {
  const { error } = useStore();
  const [tab, setTab] = useState<Tab>(tabFromHash);
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
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
        Pular para o conteúdo
      </a>
      <header className="topbar">
        <span className="brand">
          <img src="./icon.svg" alt="" width={24} height={24} /> Constância
        </span>
        <nav aria-label="Navegação principal">
          {TABS.map((t) => (
            <a key={t.id} href={`#${t.id}`} className={tab === t.id ? 'tab on' : 'tab'} aria-current={tab === t.id ? 'page' : undefined}>
              {t.label}
            </a>
          ))}
        </nav>
      </header>
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
  );
}
