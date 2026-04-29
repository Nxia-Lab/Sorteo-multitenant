import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import LoadingDots from '../components/LoadingDots';
import Shell from '../components/Shell';
import {
  createTenantParticipant,
  getTenantDisplayName,
  subscribeTenant,
  subscribeTenantBranches,
  subscribeTenantRaffles,
} from '../lib/portal';

function isWithinWindow(startAt, endAt) {
  if (!startAt || !endAt) {
    return false;
  }

  const now = Date.now();
  return now >= new Date(startAt?.toDate?.() || startAt).getTime() && now <= new Date(endAt?.toDate?.() || endAt).getTime();
}

function getBranchDisplayName(branch) {
  return String(branch?.name || branch?.slug || branch?.id || 'Sucursal').trim();
}

export default function RegisterPage() {
  const { tenantId = '', branchSlug = '' } = useParams();
  const [tenant, setTenant] = useState(null);
  const [branches, setBranches] = useState([]);
  const [raffles, setRaffles] = useState([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({
    nombre: '',
    dni: '',
    telefono: '',
  });
  const [status, setStatus] = useState({
    type: 'idle',
    message: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!tenantId) {
      setLoadError('Falta la empresa en el enlace.');
      setReady(true);
      return undefined;
    }

    const unsubscribeTenant = subscribeTenant(
      tenantId,
      (data) => {
        setTenant(data);
        setReady(true);
        setLoadError(data ? '' : 'No encontramos la empresa de este QR.');
      },
      (error) => {
        setLoadError(error?.message || 'No pudimos cargar la empresa.');
        setReady(true);
      },
    );
    const unsubscribeBranches = subscribeTenantBranches(tenantId, setBranches, (error) => {
      setLoadError(error?.message || 'No pudimos cargar las sucursales.');
    });
    const unsubscribeRaffles = subscribeTenantRaffles(tenantId, setRaffles, (error) => {
      setLoadError(error?.message || 'No pudimos cargar los sorteos.');
    });

    return () => {
      unsubscribeTenant();
      unsubscribeBranches();
      unsubscribeRaffles();
    };
  }, [tenantId]);

  const currentBranch = useMemo(
    () => branches.find((branch) => String(branch.slug || branch.id || '').toLowerCase() === String(branchSlug).toLowerCase()) || null,
    [branchSlug, branches],
  );
  const branchName = currentBranch ? getBranchDisplayName(currentBranch) : '';
  const matchingRaffles = useMemo(
    () =>
      raffles.filter(
        (raffle) =>
          raffle.status === 'active' &&
          Array.isArray(raffle.enabledBranches) &&
          raffle.enabledBranches.includes(branchName) &&
          isWithinWindow(raffle.startAt, raffle.endAt),
      ),
    [branchName, raffles],
  );
  const activeRaffle = matchingRaffles[0] || null;
  const bannerUrl = activeRaffle?.bannerUrl || activeRaffle?.imageUrl || tenant?.branding?.bannerUrl || '/sorteo-banner.jpeg';
  const hasConflict = matchingRaffles.length > 1;
  const isReady = Boolean(tenant?.status === 'active' && currentBranch?.active !== false && activeRaffle?.id && !hasConflict);
  const showStatusModal = status.type !== 'idle' && status.type !== 'loading';

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
    setFieldErrors((current) => ({
      ...current,
      [name]: '',
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const dni = form.dni.replace(/\D+/g, '');
    const trimmedName = form.nombre.trim();
    const trimmedPhone = form.telefono.trim();

    if (!tenantId || !currentBranch) {
      setStatus({ type: 'error', message: 'El QR no corresponde a una sucursal válida.' });
      return;
    }

    if (hasConflict) {
      setStatus({ type: 'error', message: 'Hay más de un sorteo activo para esta sucursal. Avisale al administrador.' });
      return;
    }

    if (!activeRaffle?.id) {
      setStatus({ type: 'error', message: 'No hay un sorteo activo para esta sucursal en este momento.' });
      return;
    }

    const nextFieldErrors = {
      nombre: trimmedName ? '' : 'Ingresá nombre y apellido.',
      dni: dni ? '' : 'Ingresá el DNI solo con números.',
      telefono: trimmedPhone ? '' : 'Ingresá un teléfono de contacto.',
    };

    if (Object.values(nextFieldErrors).some(Boolean)) {
      setFieldErrors(nextFieldErrors);
      setStatus({ type: 'error', message: 'Completá nombre, DNI y teléfono antes de continuar.' });
      return;
    }

    try {
      setIsSubmitting(true);
      setStatus({ type: 'loading', message: '' });

      await createTenantParticipant(tenantId, {
        dni,
        nombre: trimmedName,
        telefono: trimmedPhone,
        sucursal: branchName,
        raffleId: activeRaffle.id,
        raffleName: activeRaffle.name,
        jornadaKey: activeRaffle.id,
        jornadaLabel: activeRaffle.name,
        jornadaStartAt: activeRaffle.startAt?.toDate?.() || activeRaffle.startAt || new Date(),
        jornadaEndAt: activeRaffle.endAt?.toDate?.() || activeRaffle.endAt || new Date(),
      });

      setForm({ nombre: '', dni: '', telefono: '' });
      setFieldErrors({});
      setRegistrationComplete(true);
      setStatus({
        type: 'success',
        message: `Tu chance en ${activeRaffle.name} quedó registrada para ${branchName}.`,
      });
    } catch (error) {
      setStatus({
        type: 'error',
        message: error?.message || 'No pudimos guardar la inscripción. Intentá otra vez.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function closeStatusModal() {
    setStatus({ type: 'idle', message: '' });
  }

  return (
    <Shell
      accentColor={tenant?.branding?.primaryColor || ''}
      brandLogoUrl={tenant?.branding?.logoUrl || ''}
      brandName={tenant?.branding?.displayName || tenant?.branding?.name || getTenantDisplayName(tenant)}
      description={branchName ? `Registro para ${branchName}.` : 'Escaneá el QR de tu sucursal.'}
      eyebrow="Registro de participante"
      title={activeRaffle?.name || 'Sorteo vigente'}
      topLabel={getTenantDisplayName(tenant)}
      topSubtitle={branchName || 'Sucursal'}
    >
      {registrationComplete ? (
        <div className="flex min-h-[52vh] items-center justify-center">
          <div className="w-full max-w-xl rounded-[30px] border border-emerald-400/30 bg-emerald-400/10 px-6 py-8 text-center shadow-[var(--card-shadow)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10 text-3xl text-emerald-500">
              ✓
            </div>
            <p className="mt-5 text-sm font-semibold uppercase tracking-[0.28em] text-emerald-600">Registro correcto</p>
            <h2 className="mt-3 text-3xl font-semibold text-[var(--text-primary)]">Participación registrada</h2>
            <p className="mx-auto mt-3 max-w-md text-base leading-7 text-[var(--text-secondary)]">
              {status.message || 'Tu participación quedó registrada correctamente.'}
            </p>
            <button
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-strong)] px-6 py-3 text-sm font-semibold text-white transition hover:scale-[1.01]"
              onClick={() => {
                setRegistrationComplete(false);
                setStatus({ type: 'idle', message: '' });
              }}
              type="button"
            >
              Registrar otra compra
            </button>
          </div>
        </div>
      ) : showStatusModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm" role="presentation">
          <div className={`w-full max-w-md rounded-[30px] border bg-[var(--panel)] p-6 text-center shadow-[var(--shell-shadow)] ${
            status.type === 'success' ? 'border-emerald-400/30' : 'border-rose-400/30'
          }`} aria-live="assertive" aria-modal="true" role="dialog">
            <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full border text-3xl ${
              status.type === 'success'
                ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-500'
                : 'border-rose-400/30 bg-rose-400/10 text-rose-500'
            }`}>
              {status.type === 'success' ? '✓' : '!'}
            </div>
            <h3 className="mt-5 text-2xl font-semibold text-[var(--text-primary)]">
              {status.type === 'success' ? 'Participación registrada' : 'No se pudo registrar'}
            </h3>
            <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{status.message}</p>
            <button
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-strong)] px-6 py-3 text-sm font-semibold text-white"
              onClick={closeStatusModal}
              type="button"
            >
              Cerrar
            </button>
          </div>
        </div>
      ) : null}

      {!registrationComplete ? (
        !ready ? (
          <LoadingDots label="Preparando registro" />
        ) : loadError ? (
          <div className="rounded-[24px] border border-rose-400/30 bg-rose-400/10 px-5 py-4 text-sm text-rose-600">
            {loadError}
          </div>
        ) : (
          <div className="space-y-6">
          <div className="overflow-hidden rounded-[28px] border border-[var(--border-soft)] bg-[var(--panel-muted)] shadow-[var(--card-shadow)]">
            <img
              alt={activeRaffle?.name || 'Banner del sorteo'}
              className="h-auto max-h-[620px] min-h-[260px] w-full object-contain sm:min-h-[360px] lg:min-h-[460px]"
              src={bannerUrl}
            />
          </div>

          <form className="participant-form-shell space-y-5" noValidate onSubmit={handleSubmit}>
            <div className="participant-form-shell__header">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Datos del participante</p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Esta participación queda asociada a la sucursal {branchName || 'indicada'}.
              </p>
            </div>

            {!isReady ? (
              <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-600">
                {hasConflict
                  ? 'Hay más de un sorteo activo para esta sucursal.'
                  : 'No hay un sorteo activo disponible para esta sucursal en este momento.'}
              </div>
            ) : null}

            <div className="grid gap-5 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-[var(--text-secondary)]">Nombre</span>
                <input
                  aria-describedby={fieldErrors.nombre ? 'nombre-error' : undefined}
                  aria-invalid={Boolean(fieldErrors.nombre)}
                  autoComplete="name"
                  className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                  disabled={!isReady || isSubmitting}
                  name="nombre"
                  onChange={updateField}
                  placeholder="Nombre y apellido"
                  required
                  type="text"
                  value={form.nombre}
                />
                {fieldErrors.nombre ? (
                  <p className="text-sm text-rose-500" id="nombre-error" role="alert">{fieldErrors.nombre}</p>
                ) : null}
              </label>

              <label className="space-y-2">
                <span className="text-sm text-[var(--text-secondary)]">DNI</span>
                <input
                  aria-describedby={fieldErrors.dni ? 'dni-error' : 'dni-helper'}
                  aria-invalid={Boolean(fieldErrors.dni)}
                  autoComplete="off"
                  className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                  disabled={!isReady || isSubmitting}
                  inputMode="numeric"
                  maxLength={12}
                  name="dni"
                  onChange={updateField}
                  pattern="[0-9]*"
                  placeholder="Solo números"
                  required
                  value={form.dni}
                />
                {fieldErrors.dni ? (
                  <p className="text-sm text-rose-500" id="dni-error" role="alert">{fieldErrors.dni}</p>
                ) : (
                  <p className="text-xs text-[var(--text-secondary)]" id="dni-helper">Sin puntos ni espacios.</p>
                )}
              </label>
            </div>

            <label className="block space-y-2">
              <span className="text-sm text-[var(--text-secondary)]">Teléfono</span>
              <input
                aria-describedby={fieldErrors.telefono ? 'telefono-error' : undefined}
                aria-invalid={Boolean(fieldErrors.telefono)}
                autoComplete="tel"
                className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                disabled={!isReady || isSubmitting}
                inputMode="tel"
                name="telefono"
                onChange={updateField}
                placeholder="Ej: 11 5555 5555"
                required
                type="tel"
                value={form.telefono}
              />
              {fieldErrors.telefono ? (
                <p className="text-sm text-rose-500" id="telefono-error" role="alert">{fieldErrors.telefono}</p>
              ) : null}
            </label>

            <div className="flex flex-col gap-4 border-t border-[var(--border-soft)] pt-5 sm:flex-row sm:items-center sm:justify-between">
              <button
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-strong)] px-6 py-3 text-sm font-semibold text-white transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                disabled={!isReady || isSubmitting}
                type="submit"
              >
                {isSubmitting ? 'Enviando...' : 'Registrar participación'}
              </button>
              {status.type === 'loading' ? <LoadingDots label="Guardando inscripción" /> : null}
            </div>
          </form>
          </div>
        )
      ) : null}
    </Shell>
  );
}
