import {
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { statusLabel, statusTone } from "./status.js";

/** Shared React primitives for both frontends. */

export function Spinner({ label = "Loading" }) {
  return (
    <div className="center-pad" role="status">
      <div className="spinner" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="alert alert-error" role="alert">
      <div>{error.message ?? String(error)}</div>
      {error.requestId && (
        <div className="subtle" style={{ marginTop: 4 }}>
          Reference: <span className="mono">{error.requestId}</span>
        </div>
      )}
      {onRetry && (
        <button
          className="btn btn-sm"
          style={{ marginTop: 8 }}
          onClick={onRetry}
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function Badge({ tone = "neutral", children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function StatusBadge({ status }) {
  return <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>;
}

/**
 * Labelled form field. Pass the input as the child; `error` comes from
 * ApiError.fieldErrors.
 */
export function Field({ label, hint, error, children, required }) {
  const id = useId();
  const child = isValidElement(children)
    ? cloneElement(children, {
        id: children.props.id ?? id,
        "aria-invalid": error ? "true" : undefined,
      })
    : children;
  return (
    <div className="field">
      {label && (
        <label htmlFor={id}>
          {label}
          {required && <span aria-hidden="true"> *</span>}
        </label>
      )}
      {child}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="error">{error}</span>}
    </div>
  );
}

export function Pagination({ meta, onPage }) {
  if (!meta || meta.totalPages <= 1) return null;
  return (
    <nav className="pager" aria-label="Pagination">
      <button
        className="btn btn-sm"
        disabled={meta.page <= 1}
        onClick={() => onPage(meta.page - 1)}
      >
        ← Previous
      </button>
      <span className="subtle">
        Page {meta.page} of {meta.totalPages} · {meta.total} total
      </span>
      <button
        className="btn btn-sm"
        disabled={!meta.hasMore}
        onClick={() => onPage(meta.page + 1)}
      >
        Next →
      </button>
    </nav>
  );
}

export function Modal({ title, onClose, children, wide, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="spread" style={{ marginBottom: "1rem" }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
        {footer && (
          <div
            className="row"
            style={{ justifyContent: "flex-end", marginTop: "1.25rem" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

marked.setOptions({ gfm: true, breaks: true });

/** Markdown written by staff in the admin panel, sanitised before rendering. */
export function Markdown({ source, className = "prose" }) {
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parse(source ?? "")),
    [source],
  );
  return (
    <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

// ── Toasts ──────────────────────────────────────────────────────────────────
const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, tone = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast ${t.tone === "error" ? "toast-error" : ""}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/** Keep a document title in sync with the page. */
export function useTitle(title, suffix) {
  useEffect(() => {
    document.title = [title, suffix].filter(Boolean).join(" · ");
  }, [title, suffix]);
}

/** Small controlled-form helper: values, a setter per field, and API errors. */
export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const set = (name) => (e) => {
    const v =
      e && typeof e === "object" && "target" in e
        ? e.target.type === "checkbox"
          ? e.target.checked
          : e.target.value
        : e;
    setValues((s) => ({ ...s, [name]: v }));
  };
  const fail = (err) => {
    setErrors(err?.fieldErrors ?? {});
    setFormError(err);
  };
  const clear = () => {
    setErrors({});
    setFormError(null);
  };
  return { values, setValues, set, errors, formError, fail, clear };
}
