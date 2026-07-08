import React from "react";

/* Small building blocks composed from the token classes in app.css. Kept
   presentational - no data logic. */

export function StatCard({ label, icon, value, valueClass = "", hint, wide, accent, tone }) {
  return (
    <div
      className={
        "stat-card" +
        (wide ? " stat-card--wide" : "") +
        (accent ? " stat-card--accent" : "") +
        (tone ? " stat-card--" + tone : "")
      }
    >
      <span className="stat-card__label">
        {icon}
        {label}
      </span>
      <span className={"stat-card__value " + valueClass}>{value}</span>
      {hint != null && <span className="stat-card__hint">{hint}</span>}
    </div>
  );
}

const BADGE_LABELS = {
  unpaid: "Unpaid",
  partial: "Partial",
  paid: "Paid",
  credit: "Credit",
};

export function StatusBadge({ status, label }) {
  return (
    <span className={`badge badge--${status}`}>{label || BADGE_LABELS[status]}</span>
  );
}

export function EmptyState({ emoji = "🐾", title, children, actionLabel, onAction }) {
  return (
    <div className="empty-state">
      <div className="empty-state__emoji">{emoji}</div>
      {title && <p className="empty-state__title">{title}</p>}
      {children && <p className="empty-state__body">{children}</p>}
      {actionLabel && onAction && (
        <button
          className="cta-secondary empty-state__action"
          type="button"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function SectionHead({ title, action, onAction }) {
  return (
    <div className="section-block__head">
      <h2 className="section-block__title">{title}</h2>
      {action && (
        <button className="link-btn" onClick={onAction} type="button">
          {action}
        </button>
      )}
    </div>
  );
}

/** Labelled input using the .z-field token styles. */
export function Field({ label, hint, children, htmlFor }) {
  return (
    <div className="z-field">
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

/** Currency input with an RM prefix. */
export function MoneyInput({ value, onChange, placeholder = "0.00", id, ...rest }) {
  return (
    <div className="field-prefix">
      <span>RM</span>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
    </div>
  );
}

export function NumberInput({ value, onChange, placeholder, suffix, id, ...rest }) {
  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
}

/* Segmented control with a gliding, squish-stretch active indicator that
   travels between options - same fingerprint as the bottom nav (#13-Pass4). */
export function Segment({ options, value, onChange }) {
  const btnRefs = React.useRef({});
  const [ind, setInd] = React.useState(null);
  const [moving, setMoving] = React.useState(false);
  const first = React.useRef(true);

  // offsetLeft/offsetWidth = the option's layout box relative to the positioned.segment (immune to the uiPop click-squish transform).
  React.useLayoutEffect(() => {
    const el = btnRefs.current[value];
    if (!el) return;
    setInd({ left: el.offsetLeft, width: el.offsetWidth });
    if (!first.current) {
      setMoving(true);
      const t = setTimeout(() => setMoving(false), 520);
      return () => clearTimeout(t);
    }
    first.current = false;
  }, [value, options.length]);

  React.useEffect(() => {
    const onResize = () => {
      const el = btnRefs.current[value];
      if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [value]);

  return (
    <div className="segment" role="group">
      {ind && (
        <span
          className={"segment__indicator" + (moving ? " is-moving" : "")}
          style={{ left: ind.left, width: ind.width }}
          aria-hidden="true"
        />
      )}
      {options.map((o) => (
        <button
          key={o.value}
          ref={(el) => (btnRefs.current[o.value] = el)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
