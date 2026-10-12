import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { applyChanges, closeDb, DB_NAME, loadAll, replaceAll } from '../data/db';
import { buildExport, parseImport } from '../domain/backup';
import { createTask } from '../domain/defaults';

function deleteDb() {
  return new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

describe('13. exportar, limpar e importar', () => {
  it('restaura áreas, tarefas, ocorrências, sessões e preferências sem alterações', async () => {
    const nowIso = new Date().toISOString();
    const initial = await loadAll(nowIso);
    expect(initial.areas.map((a) => a.name)).toEqual(['Holandês', 'Agência de viagens', 'Impressão 3D', 'Pães']);

    const { task, occurrences } = createTask(
      {
        areaId: initial.areas[0].id,
        title: 'Holandês',
        description: 'Duolingo',
        minutes: 15,
        kind: 'once',
        weekdays: [],
        timesPerWeek: 0,
        priority: 'alta',
        dueAt: '2026-10-14T10:00',
        reminderAt: '2026-10-14T09:00',
        dailyReminder: null,
        plannedDate: '2026-10-12',
        active: true,
      },
      '2026-10-12',
      nowIso,
    );
    await applyChanges({
      put: {
        tasks: [task],
        occurrences,
        sessions: [
          {
            id: 's1',
            occurrenceId: occurrences[0].id,
            taskId: task.id,
            start: nowIso,
            end: nowIso,
            seconds: 321,
            manual: true,
            edited: false,
            updatedAt: nowIso,
          },
        ],
        prefs: { ...initial.prefs, weekStart: 0, notifications: true },
      },
    });

    const before = await loadAll();
    const text = JSON.stringify(buildExport(before, nowIso));

    await closeDb();
    await deleteDb();
    const fresh = await loadAll();
    expect(fresh.tasks).toHaveLength(0);

    const parsed = parseImport(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    await replaceAll(parsed.file.data);
    const after = await loadAll();

    const norm = <T extends { id: string }>(l: T[]) => [...l].sort((a, b) => a.id.localeCompare(b.id));
    expect(norm(after.areas)).toEqual(norm(before.areas));
    expect(after.tasks).toEqual(before.tasks);
    expect(after.occurrences).toEqual(before.occurrences);
    expect(after.sessions).toEqual(before.sessions);
    expect(after.prefs).toEqual(before.prefs);
  });

  it('rejeita arquivos inválidos com mensagens claras', () => {
    expect(parseImport('não é json')).toMatchObject({ ok: false, error: expect.stringContaining('JSON') });
    expect(parseImport('{"app":"outro"}')).toMatchObject({ ok: false });
    expect(parseImport(JSON.stringify({ app: 'constancia', schemaVersion: 99, data: {} }))).toMatchObject({
      ok: false,
      error: expect.stringContaining('mais nova'),
    });
    expect(
      parseImport(JSON.stringify({ app: 'constancia', schemaVersion: 1, data: { areas: [{}], tasks: [] } })),
    ).toMatchObject({ ok: false });
  });
});
