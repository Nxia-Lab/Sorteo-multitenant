export default function Shell({
  eyebrow,
  title,
  description,
  children,
  aside,
  actions,
  quickAccess,
  topLabel = 'Panel de sorteos',
  topSubtitle = '',
  topLabelClassName = '',
  accentColor = '',
  brandLogoUrl = '',
  brandName = '',
}) {
  const hasAside = Boolean(aside);
  const fallbackBrandLogo = '/default-brand-logo.png';
  const shellStyle = accentColor
    ? {
        '--accent-strong': accentColor,
        '--accent-blue': accentColor,
      }
    : undefined;
  const glowStyle = accentColor
    ? {
        backgroundColor: accentColor,
      }
    : undefined;

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)] transition-colors duration-300" style={shellStyle}>
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 lg:py-10">
        <div className="relative mb-5 grid grid-cols-1 items-center gap-4 overflow-hidden rounded-[24px] border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-4 text-center shadow-[var(--shell-shadow)] backdrop-blur sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-6 xl:px-10">
          {accentColor ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-10 -top-10 h-28 w-28 rounded-full blur-3xl"
              style={glowStyle}
            />
          ) : null}
          {accentColor ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px]"
              style={{ backgroundColor: accentColor }}
            />
          ) : null}
          <div className="flex justify-center sm:justify-self-start">
            <img
              alt={brandName || topLabel}
              className="h-14 w-14 shrink-0 rounded-2xl border border-[var(--border-soft)] bg-[var(--panel)] object-contain p-1 shadow-[var(--card-shadow)] ring-1 ring-[var(--accent-soft)] sm:h-16 sm:w-16"
              src={brandLogoUrl || fallbackBrandLogo}
            />
          </div>
          <div className="min-w-0 text-center">
            <p className={`break-words text-lg font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)] sm:text-xl ${topLabelClassName}`}>{topLabel}</p>
            {brandName ? (
              <p className="mt-1 break-words text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)] sm:text-base">
                {brandName}
              </p>
            ) : null}
            {topSubtitle ? (
              <p className="mt-1 break-words text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-secondary)] sm:text-base">
                {topSubtitle}
              </p>
            ) : null}
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-self-end">
            {quickAccess}
            {actions}
          </div>
        </div>

        <div className={`grid min-h-screen gap-6 ${hasAside ? 'lg:grid-cols-[1.6fr_0.4fr]' : 'lg:grid-cols-1'}`}>
          <section className="relative overflow-hidden rounded-[28px] border border-[var(--border-soft)] bg-[var(--panel)] p-5 shadow-[var(--shell-shadow)] backdrop-blur sm:p-6 xl:p-10">
            <div className="absolute inset-0 -z-10 bg-grid bg-[size:32px_32px] opacity-[var(--grid-opacity)]" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent-strong)] to-transparent" />
            {accentColor ? <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-[var(--accent-strong)] opacity-90" /> : null}
            {eyebrow ? <p className="text-left text-base font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)] sm:text-lg">{eyebrow}</p> : null}
            <h1 className="max-w-3xl text-left text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
              {title}
            </h1>
            {description ? <p className="mt-4 max-w-2xl text-left text-sm leading-6 text-[var(--text-secondary)] sm:text-base">{description}</p> : null}
            <div className="mt-6 sm:mt-8">{children}</div>
          </section>

          {hasAside ? <aside className="flex flex-col gap-6">{aside}</aside> : null}
        </div>
      </div>
    </div>
  );
}
