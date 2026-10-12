import { useEffect, useRef, useState } from 'react';
import { dueReminders, type DueReminder } from '../domain/reminders';
import { useStore } from '../data/store';
import { useUI } from './ui';

const CHECK_MS = 20_000;

/**
 * Fires reminders while the page is open. Reminders whose time passed while the app was
 * closed are collected for the morning summary instead of firing a burst of notifications.
 */
export function useReminders() {
  const store = useStore();
  const ui = useUI();
  const latest = useRef(store);
  latest.current = store;
  const openedAt = useRef(new Date());
  const [missed, setMissed] = useState<DueReminder[]>([]);

  useEffect(() => {
    const tick = () => {
      const { data, today, actions } = latest.current;
      const now = new Date();
      const due = dueReminders(data, today, now);
      if (due.length === 0) return;
      const known = new Set(data.reminders.map((r) => r.key));
      const old = due.filter((r) => new Date(r.at) < openedAt.current && !known.has(r.key));
      const fresh = due.filter((r) => !old.includes(r));
      if (old.length) setMissed((m) => [...m, ...old]);
      for (const r of fresh) {
        ui.toast(`${r.title} — ${r.body}`, {
          tone: 'reminder',
          sticky: true,
          actions: [{ label: 'Lembrar em 15 min', onClick: () => void latest.current.actions.markReminders([r], 15) }],
        });
        if (data.prefs.notifications && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            new Notification(r.title, { body: r.body, tag: r.key, icon: './icon.svg' });
          } catch {
            /* some browsers only allow notifications from a service worker */
          }
        }
      }
      void actions.markReminders(due);
    };
    const first = window.setTimeout(tick, 1500);
    const id = window.setInterval(tick, CHECK_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [ui]);

  return { missed, clearMissed: () => setMissed([]) };
}
