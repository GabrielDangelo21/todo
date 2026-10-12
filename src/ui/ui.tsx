import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error' | 'reminder';
  actions?: ToastAction[];
}

interface UIValue {
  dialog<T>(render: (close: (value?: T) => void) => ReactNode): Promise<T | undefined>;
  confirm(opts: { title: string; message: ReactNode; ok?: string; danger?: boolean }): Promise<boolean>;
  toast(message: string, opts?: { tone?: Toast['tone']; actions?: ToastAction[]; sticky?: boolean }): void;
}

const UIContext = createContext<UIValue | null>(null);

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? 'modal wide' : 'modal'}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="modal-head">
        <h2>{title}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
          ✕
        </button>
      </header>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [dialogs, setDialogs] = useState<{ id: number; node: ReactNode }[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const dialog = useCallback(<T,>(render: (close: (value?: T) => void) => ReactNode) => {
    return new Promise<T | undefined>((resolve) => {
      const id = ++seq.current;
      const close = (value?: T) => {
        setDialogs((d) => d.filter((x) => x.id !== id));
        resolve(value);
      };
      setDialogs((d) => [...d, { id, node: render(close) }]);
    });
  }, []);

  const confirm = useCallback<UIValue['confirm']>(
    ({ title, message, ok = 'Confirmar', danger }) =>
      dialog<boolean>((close) => (
        <Modal title={title} onClose={() => close(false)}>
          <div className="confirm-msg">{message}</div>
          <div className="row end">
            <button type="button" className="btn" onClick={() => close(false)}>
              Cancelar
            </button>
            <button type="button" className={danger ? 'btn danger' : 'btn primary'} onClick={() => close(true)} autoFocus>
              {ok}
            </button>
          </div>
        </Modal>
      )).then((v) => v === true),
    [dialog],
  );

  const toast = useCallback<UIValue['toast']>(
    (message, opts = {}) => {
      const id = ++seq.current;
      setToasts((t) => [...t, { id, message, tone: opts.tone ?? 'info', actions: opts.actions }]);
      if (!opts.sticky) window.setTimeout(() => dismissToast(id), 6000);
    },
    [dismissToast],
  );

  return (
    <UIContext.Provider value={{ dialog, confirm, toast }}>
      {children}
      {dialogs.map((d) => (
        <div key={d.id}>{d.node}</div>
      ))}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            <span className="toast-msg">
              {t.tone === 'reminder' ? 'Lembrete: ' : t.tone === 'error' ? '⚠ ' : ''}
              {t.message}
            </span>
            <div className="toast-actions">
              {t.actions?.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  className="btn small"
                  onClick={() => {
                    a.onClick();
                    dismissToast(t.id);
                  }}
                >
                  {a.label}
                </button>
              ))}
              <button type="button" className="icon-btn" aria-label="Dispensar aviso" onClick={() => dismissToast(t.id)}>
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </UIContext.Provider>
  );
}

export function useUI(): UIValue {
  const v = useContext(UIContext);
  if (!v) throw new Error('useUI outside UIProvider');
  return v;
}
