import { useRef, useState } from 'react';
import { parseImport, type ExportFile } from '../domain/backup';
import { formatDateTime, toLocalDateTime } from '../domain/dates';
import type { Area, Data } from '../domain/types';
import { useStore } from '../data/store';
import { Modal, useUI } from '../ui/ui';

function download(file: ExportFile, prefix: string) {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${prefix}-${file.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const counts = (d: Data) => [
  ['Áreas', d.areas.length],
  ['Tarefas', d.tasks.length],
  ['Ocorrências', d.occurrences.length],
  ['Sessões de tempo', d.sessions.length],
  ['Avisos', d.reminders.length],
] as const;

function ImportDialog({ file, close }: { file: ExportFile; close: (ok?: boolean) => void }) {
  const { data, actions } = useStore();
  const [copied, setCopied] = useState(false);
  const current = counts(data);
  const incoming = counts(file.data);
  return (
    <Modal title="Importar cópia de segurança" onClose={() => close(false)} wide>
      <p>
        Arquivo exportado em <strong>{formatDateTime(toLocalDateTime(new Date(file.exportedAt)))}</strong> (esquema v
        {file.schemaVersion}). A importação é integral: <strong>todos os dados atuais serão substituídos</strong>.
      </p>
      <table className="summary-table">
        <thead>
          <tr>
            <th scope="col">Registro</th>
            <th scope="col">Atual (será apagado)</th>
            <th scope="col">No arquivo</th>
          </tr>
        </thead>
        <tbody>
          {current.map(([label, n], i) => (
            <tr key={label}>
              <td>{label}</td>
              <td>{n}</td>
              <td>{incoming[i][1]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">Recomendado: baixe uma cópia dos dados atuais antes de substituir.</p>
      <div className="row end">
        <button
          type="button"
          className="btn"
          onClick={() => {
            download(actions.exportFile(), 'constancia-antes-da-importacao');
            setCopied(true);
          }}
        >
          {copied ? '✓ Cópia baixada' : 'Baixar cópia dos dados atuais'}
        </button>
        <button type="button" className="btn" onClick={() => close(false)}>
          Cancelar
        </button>
        <button type="button" className="btn danger" onClick={() => close(true)}>
          Substituir tudo
        </button>
      </div>
    </Modal>
  );
}

function AreaRow({ area, first, last }: { area: Area; first: boolean; last: boolean }) {
  const { actions } = useStore();
  const [name, setName] = useState(area.name);
  return (
    <li className="area-row">
      <input
        aria-label={`Nome da área ${area.name}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name.trim() !== area.name && actions.updateArea(area, { name: name.trim() })}
      />
      <button type="button" className="icon-btn" disabled={first} onClick={() => actions.moveArea(area.id, -1)} aria-label={`Subir ${area.name}`}>
        ↑
      </button>
      <button type="button" className="icon-btn" disabled={last} onClick={() => actions.moveArea(area.id, 1)} aria-label={`Descer ${area.name}`}>
        ↓
      </button>
      <button type="button" className="btn small" onClick={() => actions.updateArea(area, { active: !area.active })}>
        {area.active ? 'Ocultar' : 'Mostrar'}
      </button>
      {!area.active && <span className="tag">Oculta</span>}
    </li>
  );
}

export function SettingsView() {
  const { data, actions } = useStore();
  const ui = useUI();
  const fileRef = useRef<HTMLInputElement>(null);
  const [newArea, setNewArea] = useState('');
  const prefs = data.prefs;
  const permission = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  const areas = [...data.areas].sort((a, b) => a.order - b.order);

  const toggleNotifications = async (on: boolean) => {
    if (on && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    await actions.setPrefs({ notifications: on });
  };

  const doExport = async () => {
    try {
      const file = actions.exportFile();
      download(file, 'constancia-backup');
      await actions.setPrefs({ lastBackupAt: file.exportedAt });
      ui.toast('Cópia de segurança exportada.');
    } catch (e) {
      ui.toast(`Falha ao exportar: ${(e as Error).message}`, { tone: 'error', sticky: true });
    }
  };

  const onImportFile = async (f: File) => {
    let text: string;
    try {
      text = await f.text();
    } catch {
      ui.toast('Não foi possível ler o arquivo selecionado.', { tone: 'error', sticky: true });
      return;
    }
    const res = parseImport(text);
    if (!res.ok) {
      ui.toast(`Importação cancelada: ${res.error}`, { tone: 'error', sticky: true });
      return;
    }
    const ok = await ui.dialog<boolean>((close) => <ImportDialog file={res.file} close={close} />);
    if (!ok) return;
    try {
      await actions.replaceAll(res.file.data);
      ui.toast('Dados importados com sucesso.');
    } catch (e) {
      ui.toast(`Falha ao importar; os dados atuais foram mantidos. ${(e as Error).message}`, { tone: 'error', sticky: true });
    }
  };

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <h1>Configurações</h1>
        </div>
      </header>

      <section className="card notice" role="note">
        <strong>Seus dados ficam apenas neste navegador, neste computador.</strong> Não há conta nem envio para
        servidores. Se você limpar os dados do site ou trocar de perfil do navegador, eles serão apagados — exporte
        cópias de segurança regularmente.
      </section>

      <section className="card" aria-labelledby="pref-title">
        <h2 id="pref-title">Preferências</h2>
        <label className="field narrow-select">
          <span>Início da semana</span>
          <select value={prefs.weekStart} onChange={(e) => actions.setPrefs({ weekStart: Number(e.target.value) as 0 | 1 })}>
            <option value={1}>Segunda-feira</option>
            <option value={0}>Domingo</option>
          </select>
        </label>
        <p className="hint">
          Data e fuso horário seguem o computador ({Intl.DateTimeFormat().resolvedOptions().timeZone}).
        </p>
        <label className="check">
          <input type="checkbox" checked={prefs.notifications} onChange={(e) => toggleNotifications(e.target.checked)} />
          Notificações do navegador para lembretes
        </label>
        <p className="hint">
          {permission === 'unsupported' && 'Este navegador não suporta notificações; os avisos aparecem apenas na página. '}
          {permission === 'denied' &&
            'O navegador bloqueou notificações para este site; os avisos aparecem apenas dentro da página. '}
          Os lembretes funcionam somente com o aplicativo aberto. Com o navegador fechado nada é enviado; avisos
          vencidos aparecem no resumo da próxima abertura.
        </p>
      </section>

      <section className="card" aria-labelledby="areas-title">
        <h2 id="areas-title">Áreas</h2>
        <ul className="plain-list">
          {areas.map((a, i) => (
            <AreaRow key={a.id} area={a} first={i === 0} last={i === areas.length - 1} />
          ))}
        </ul>
        <form
          className="row"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newArea.trim()) return;
            await actions.addArea(newArea);
            setNewArea('');
          }}
        >
          <input aria-label="Nome da nova área" placeholder="Nova área" value={newArea} onChange={(e) => setNewArea(e.target.value)} />
          <button type="submit" className="btn" disabled={!newArea.trim()}>
            Adicionar área
          </button>
        </form>
      </section>

      <section className="card" aria-labelledby="backup-title">
        <h2 id="backup-title">Cópia de segurança</h2>
        <p>
          Último backup conhecido:{' '}
          <strong>{prefs.lastBackupAt ? formatDateTime(toLocalDateTime(new Date(prefs.lastBackupAt))) : 'nunca'}</strong>
        </p>
        <div className="row">
          <button type="button" className="btn primary" onClick={doExport}>
            Exportar dados (JSON)
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            Importar cópia…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void onImportFile(f);
            }}
          />
        </div>
        <p className="hint">A importação substitui todos os dados atuais, depois de mostrar o que será trocado.</p>
      </section>
    </div>
  );
}
