import {
  createContext,
  cloneElement,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";
import { stateName, type Row } from "./api";
export const NotifyContext = createContext<(text: string) => void>(() => {});
export const useNotify = () => useContext(NotifyContext);
export function PageTitle({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-title">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
      </div>
      {children}
    </header>
  );
}
export function Panel({
  title,
  children,
  actions,
}: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="panel">
      {(title || actions) && (
        <header className="section-heading">
          <h2>{title}</h2>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}
export function Badge({ value }: { value: string }) {
  return (
    <span className={"badge badge-" + value}>{stateName[value] ?? value}</span>
  );
}
export function ErrorBox({
  error,
  retry,
}: {
  error: string;
  retry?: () => void;
}) {
  return error ? (
    <div role="alert" className="error-box">
      <span>{error}</span>
      {retry && <button onClick={retry}>重试</button>}
    </div>
  ) : null;
}
export function Load({
  loading,
  error,
  retry,
  children,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
  children?: ReactNode;
}) {
  if (error) return <ErrorBox error={error} retry={retry} />;
  if (loading && !children)
    return (
      <p role="status" className="empty">
        正在读取…
      </p>
    );
  return (
    <>
      {loading && (
        <p role="status" className="loading-line">
          正在更新…
        </p>
      )}
      {children}
    </>
  );
}
export function Empty({
  children = "这里暂时没有记录。",
}: {
  children?: ReactNode;
}) {
  return <p className="empty">{children}</p>;
}
export function Pager({
  page,
  total,
  size = 20,
  onChange,
  count,
}: {
  page: number;
  total?: number;
  size?: number;
  onChange: (v: number) => void;
  count?: number;
}) {
  return (
    <nav className="pager" aria-label="分页">
      <span>
        {total === undefined
          ? "第 " + page + " 页"
          : "共 " +
            total +
            " 条 · 第 " +
            page +
            " / " +
            Math.max(1, Math.ceil(total / size)) +
            " 页"}
      </span>
      <button disabled={page <= 1} onClick={() => onChange(page - 1)}>
        上一页
      </button>
      <button
        disabled={
          total === undefined ? (count ?? 0) < size : page * size >= total
        }
        onClick={() => onChange(page + 1)}
      >
        下一页
      </button>
    </nav>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const generated = useId();
  const control = isValidElement(children) ? children as ReactElement<{id?: string; 'aria-describedby'?: string}> : null;
  const id = control?.props.id ?? generated;
  const hintId = id + '-hint';
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {control ? cloneElement(control, {id, ...(hint ? {'aria-describedby': [control.props['aria-describedby'], hintId].filter(Boolean).join(' ')} : {})}) : children}
      {hint && <small id={hintId}>{hint}</small>}
    </div>
  );
}
export function FormError({ error }: { error: string }) {
  return <ErrorBox error={error} />;
}
export function useUnsaved(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const fn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [dirty]);
}
export function Dialog({
  title,
  children,
  onClose,
  dirty = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  dirty?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId(),
    [discard, setDiscard] = useState(false);
  useUnsaved(dirty);
  const close = () => (dirty ? setDiscard(true) : onClose());
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      previous?.focus();
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={id}
      onClickCapture={(e) => {
        const button = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-dialog-dismiss]");
        if (!button || button.disabled) return;
        e.preventDefault();
        e.stopPropagation();
        close();
      }}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header className="dialog-heading">
        <h2 id={id}>{title}</h2>
        <button aria-label="关闭" onClick={close}>
          ×
        </button>
      </header>
      {discard ? (
        <div className="dialog-body">
          <h3>放弃尚未保存的修改？</h3>
          <p>已经保存的内容不受影响。</p>
          <div className="actions">
            <button onClick={() => setDiscard(false)}>继续编辑</button>
            <button className="danger" onClick={onClose}>
              放弃修改
            </button>
          </div>
        </div>
      ) : (
        <div className="dialog-body">{children}</div>
      )}
    </dialog>,
    document.body,
  );
}
export function Confirm({
  title,
  description,
  onConfirm,
  onClose,
  action = "确认",
  danger = false,
  reason = false,
}: {
  title: string;
  description: ReactNode;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
  action?: string;
  danger?: boolean;
  reason?: boolean;
}) {
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Dialog title={title} onClose={() => !busy && onClose()}>
      <p>{description}</p>
      {reason && (
        <Field label="处理原因">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            rows={3}
          />
        </Field>
      )}
      <FormError error={error} />
      <div className="actions">
        <button disabled={busy} onClick={onClose}>
          取消
        </button>
        <button
          className={danger ? "danger" : "primary"}
          disabled={busy || (reason && text.trim().length < 4)}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onConfirm(text);
              onClose();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "正在处理…" : action}
        </button>
      </div>
    </Dialog>
  );
}
export function KeyValues({ items }: { items: Record<string, ReactNode> }) {
  return (
    <dl className="key-values">
      {Object.entries(items).map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
export function ListSelect({
  items,
  selected,
  onSelect,
  render,
}: {
  items: Row[];
  selected: string;
  onSelect: (id: string) => void;
  render: (r: Row) => ReactNode;
}) {
  return (
    <div className="record-list">
      {items.length ? (
        items.map((r) => (
          <button
            key={r.id}
            className={"record " + (selected === r.id ? "selected" : "")}
            onClick={() => onSelect(r.id)}
            aria-pressed={selected === r.id}
          >
            {render(r)}
          </button>
        ))
      ) : (
        <Empty />
      )}
    </div>
  );
}
export function BeijingInput({
  value,
  onChange,
  id,
  'aria-describedby': describedBy,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  'aria-describedby'?: string;
}) {
  return (
    <input
      id={id}
      aria-describedby={describedBy}
      type="datetime-local"
      value={
        value
          ? new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 16)
          : ""
      }
      onChange={(e) =>
        onChange(
          e.target.value
            ? new Date(e.target.value + ":00+08:00").toISOString()
            : "",
        )
      }
    />
  );
}
