// Small shared building blocks so every screen labels things the same way.

export function Panel({ title, children, actions, id }) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section className="panel" aria-labelledby={headingId}>
      {(title || actions) && (
        <div className="panel-head">
          {title && <h2 id={headingId}>{title}</h2>}
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

// tone: ok | warn | danger | info | sim
export function Badge({ tone = 'info', children }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Notice({ tone = 'info', children, role }) {
  return (
    <div className={`notice ${tone}`} role={role ?? (tone === 'danger' ? 'alert' : undefined)}>
      {children}
    </div>
  );
}

export function SimBanner({ what = 'This screen is driven by the simulator' }) {
  return (
    <Notice tone="sim">
      <strong>SIMULATED.</strong> {what}. Nothing here came from a real board or microphone.
    </Notice>
  );
}

// A labelled form control with its error/help text wired up for screen readers.
export function Field({ id, label, error, warning, help, children }) {
  const describedBy = [error && `${id}-err`, warning && `${id}-warn`, help && `${id}-help`].filter(Boolean).join(' ') || undefined;
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <div className="field">
        {typeof children === 'function' ? children({ id, 'aria-describedby': describedBy, 'aria-invalid': !!error }) : children}
        {help && <p id={`${id}-help`} className="note">{help}</p>}
        {warning && <p id={`${id}-warn`} className="field-msg warn">{warning}</p>}
        {error && <p id={`${id}-err`} className="field-msg danger">{error}</p>}
      </div>
    </>
  );
}

export function ReviewBadge({ state }) {
  if (state === 'native-reviewed') return <Badge tone="ok">native-reviewed</Badge>;
  if (state === 'team-authored') return <Badge tone="info">team-authored</Badge>;
  return <Badge tone="warn">unverified</Badge>;
}
