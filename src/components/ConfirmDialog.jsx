export default function ConfirmDialog({
  open,
  eyebrow = 'Confirmar acción',
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  confirmTone = 'primary',
  details = [],
  loading = false,
  onCancel,
  onConfirm,
}) {
  if (!open) {
    return null;
  }

  const primaryClassName = confirmTone === 'danger'
    ? 'bg-rose-600 text-white shadow-[0_12px_30px_rgba(225,29,72,0.24)] hover:bg-rose-700'
    : 'bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-blue)] text-white shadow-[0_12px_30px_color-mix(in_srgb,var(--accent-strong)_26%,transparent)] hover:scale-[1.01]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm" role="presentation">
      <div
        aria-labelledby="confirm-dialog-title"
        aria-modal="true"
        className="w-full max-w-lg rounded-[28px] border border-[var(--border-soft)] bg-[var(--panel)] p-6 shadow-[var(--shell-shadow)]"
        role="dialog"
      >
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">{eyebrow}</p>
        <h3 className="mt-3 text-2xl font-semibold text-[var(--text-primary)]" id="confirm-dialog-title">{title}</h3>
        {description ? (
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
        ) : null}

        {details.length > 0 ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {details.map((detail) => (
              <div className="rounded-[18px] border border-[var(--border-soft)] bg-[var(--panel-muted)] p-3" key={detail.label}>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--accent-strong)]">{detail.label}</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{detail.value}</p>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--panel-muted)] px-6 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent-strong)] hover:text-[var(--accent-strong)]"
            disabled={loading}
            onClick={onCancel}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className={`inline-flex min-h-11 items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${primaryClassName}`}
            disabled={loading}
            onClick={onConfirm}
            type="button"
          >
            {loading ? 'Procesando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
