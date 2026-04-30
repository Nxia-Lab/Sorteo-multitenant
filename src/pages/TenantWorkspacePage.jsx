import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { signOut, updatePassword } from 'firebase/auth';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useNavigate, useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import Card from '../components/Card';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingDots from '../components/LoadingDots';
import QRCodeCard from '../components/QRCodeCard';
import Shell from '../components/Shell';
import { getAuthSessionSnapshot, subscribeAuthSession } from '../lib/authSession';
import { auth, db } from '../lib/firebase';
import { formatDate, formatDateRange, toDatetimeLocalValue } from '../lib/format';
import {
  createTenantParticipant,
  createTenantRaffle,
  fetchTenantById,
  getTenantDisplayName,
  subscribeTenant,
  subscribeTenantBranches,
  subscribeTenantParticipants,
  subscribeTenantRaffles,
  subscribeUserProfile,
  updateTenantRaffle,
} from '../lib/portal';
import { validateStrongPassword } from '../lib/passwordPolicy';
import {
  buildDrawResult,
  buildExportableCustomers,
  buildRaffleMonitor,
  createReportHash,
  getOperationalRaffleStatus,
  getRaffleStatusLabel,
} from '../lib/raffleLogic';
import { uploadBrandLogoFile } from '../lib/storage';
import { getRoleLabel, ROLES } from '../lib/tenantModel';

function StatCard({ label, value, hint }) {
  return (
    <Card>
      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-[var(--text-primary)]">{value}</p>
      {hint ? <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{hint}</p> : null}
    </Card>
  );
}

function toDateInputValue(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value?.toDate?.() || value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return toDatetimeLocalValue(date).slice(0, 10);
}

function dateInputToStartOfDay(value) {
  return new Date(`${value}T00:00:00`);
}

function dateInputToEndOfDay(value) {
  return new Date(`${value}T23:59:00`);
}

function isSameLocalDate(firstDate, secondDate) {
  return (
    firstDate.getFullYear() === secondDate.getFullYear() &&
    firstDate.getMonth() === secondDate.getMonth() &&
    firstDate.getDate() === secondDate.getDate()
  );
}

function canExecuteRaffleToday(raffle) {
  const end = new Date(raffle?.endAt?.toDate?.() || raffle?.endAt);
  return !Number.isNaN(end.getTime()) && isSameLocalDate(new Date(), end) && raffle?.status === 'active';
}

function countRaffleParticipants(participants, raffleId) {
  return participants.filter((participant) => participant.raffleId === raffleId).length;
}

function sanitizeFilename(value) {
  return String(value || 'empresa')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'empresa';
}

export default function TenantWorkspacePage() {
  const { tenantId } = useParams();
  const navigate = useNavigate();
  const { authUser, authReady } = useSyncExternalStore(
    subscribeAuthSession,
    getAuthSessionSnapshot,
    getAuthSessionSnapshot,
  );
  const expiredRafflesRef = useRef(new Set());
  const currentUser = authUser || auth.currentUser;
  const [profile, setProfile] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [profileReady, setProfileReady] = useState(false);
  const [tenantReady, setTenantReady] = useState(false);
  const [tenantBranches, setTenantBranches] = useState([]);
  const [tenantRaffles, setTenantRaffles] = useState([]);
  const [tenantParticipants, setTenantParticipants] = useState([]);
  const [raffleName, setRaffleName] = useState('');
  const [raffleStartAt, setRaffleStartAt] = useState('');
  const [raffleEndAt, setRaffleEndAt] = useState('');
  const [raffleMode, setRaffleMode] = useState('global');
  const [raffleWinners, setRaffleWinners] = useState('1');
  const [raffleAlternates, setRaffleAlternates] = useState('2');
  const [editingRaffleId, setEditingRaffleId] = useState('');
  const [drawRaffleId, setDrawRaffleId] = useState('');
  const [drawSaving, setDrawSaving] = useState(false);
  const [drawPreview, setDrawPreview] = useState(null);
  const [drawRevealCount, setDrawRevealCount] = useState(0);
  const [drawRolling, setDrawRolling] = useState(false);
  const [drawConfirmOpen, setDrawConfirmOpen] = useState(false);
  const [statusConfirmRaffle, setStatusConfirmRaffle] = useState(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [selectedBranchNames, setSelectedBranchNames] = useState([]);
  const [participantName, setParticipantName] = useState('');
  const [participantDni, setParticipantDni] = useState('');
  const [participantPhone, setParticipantPhone] = useState('');
  const [participantBranch, setParticipantBranch] = useState('');
  const [participantRaffleId, setParticipantRaffleId] = useState('');
  const [participantSaving, setParticipantSaving] = useState(false);
  const [participantMessage, setParticipantMessage] = useState('');
  const [participantError, setParticipantError] = useState('');
  const [raffleSaving, setRaffleSaving] = useState(false);
  const [raffleMessage, setRaffleMessage] = useState('');
  const [raffleError, setRaffleError] = useState('');
  const [profileError, setProfileError] = useState('');
  const [tenantError, setTenantError] = useState('');
  const [logoutError, setLogoutError] = useState('');
  const [authMissing, setAuthMissing] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordChangeSaving, setPasswordChangeSaving] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState('');
  const [passwordChangeMessage, setPasswordChangeMessage] = useState('');
  const [activeSection, setActiveSection] = useState('resumen');
  const [settingsForm, setSettingsForm] = useState({
    displayName: '',
    brandingDisplayName: '',
    primaryColor: '#007de8',
    logoUrl: '',
  });
  const [settingsLogoFile, setSettingsLogoFile] = useState(null);
  const [settingsLogoPreview, setSettingsLogoPreview] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const branches = Array.isArray(tenant?.branches) ? tenant.branches : [];
  const visibleBranches = tenantBranches.length > 0 ? tenantBranches : branches;
  const activeBranches = useMemo(
    () => visibleBranches.filter((branch) => branch.active !== false),
    [visibleBranches],
  );
  const tenantActiveRaffles = useMemo(
    () => tenantRaffles.filter((raffle) => ['draft', 'active', 'paused'].includes(raffle.status)),
    [tenantRaffles],
  );
  const completedTenantRaffles = useMemo(
    () => tenantRaffles.filter((raffle) => ['manual_closed', 'expired', 'completed'].includes(raffle.status)),
    [tenantRaffles],
  );
  const participantableRaffles = useMemo(() => tenantActiveRaffles.filter((raffle) => raffle.id), [tenantActiveRaffles]);
  const selectedParticipantRaffle = useMemo(
    () => participantableRaffles.find((raffle) => raffle.id === participantRaffleId) ?? participantableRaffles[0] ?? null,
    [participantRaffleId, participantableRaffles],
  );
  const tenantParticipantsForRaffle = useMemo(() => {
    if (!selectedParticipantRaffle?.id) {
      return tenantParticipants;
    }

    return tenantParticipants.filter((participant) => participant.raffleId === selectedParticipantRaffle.id);
  }, [selectedParticipantRaffle, tenantParticipants]);
  const exportableCustomers = useMemo(() => buildExportableCustomers(tenantParticipants), [tenantParticipants]);
  const raffleMonitors = useMemo(() => {
    const monitors = new Map();
    tenantActiveRaffles.forEach((raffle) => {
      monitors.set(raffle.id, buildRaffleMonitor(raffle, tenantParticipants, activeBranches));
    });
    return monitors;
  }, [activeBranches, tenantActiveRaffles, tenantParticipants]);
  const requiresPasswordChange = Boolean(profile?.mustChangePassword && profile?.role !== ROLES.SUPERADMIN);

  const drawPreviewPicks = useMemo(() => {
    if (!drawPreview?.groups?.length) {
      return [];
    }

    return drawPreview.groups.flatMap((group) => [
      ...(group.winners || []).map((participant, index) => ({
        ...participant,
        group: group.group,
        kind: 'Ganador',
        orderLabel: `Titular ${index + 1}`,
      })),
      ...(group.alternates || []).map((participant, index) => ({
        ...participant,
        group: group.group,
        kind: 'Suplente',
        orderLabel: `Suplente ${index + 1}`,
      })),
    ]);
  }, [drawPreview]);
  const activeDrawRaffle = useMemo(
    () => tenantActiveRaffles.find((raffle) => raffle.id === drawRaffleId) || null,
    [drawRaffleId, tenantActiveRaffles],
  );

  useEffect(() => {
    if (!drawRolling || drawRevealCount >= drawPreviewPicks.length) {
      if (drawRolling && drawPreviewPicks.length > 0) {
        setDrawRolling(false);
      }
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setDrawRevealCount((current) => Math.min(current + 1, drawPreviewPicks.length));
    }, 850);

    return () => window.clearTimeout(timeoutId);
  }, [drawPreviewPicks.length, drawRevealCount, drawRolling]);

  useEffect(() => {
    if (activeBranches.length === 0) {
      return;
    }

    setSelectedBranchNames((current) => {
      if (current.length > 0) {
        return current;
      }

      return activeBranches.map((branch) => branch.name || branch.slug || branch.id).filter(Boolean);
    });
  }, [activeBranches]);

  useEffect(() => {
    if (!tenantId || tenantId === 'global' || !['superadmin', 'tenant_admin'].includes(profile?.role)) {
      return;
    }

    const now = new Date();
    tenantRaffles
      .filter((raffle) => ['draft', 'active', 'paused'].includes(raffle.status))
      .filter((raffle) => {
        const end = new Date(raffle?.endAt?.toDate?.() || raffle?.endAt);
        return !Number.isNaN(end.getTime()) && end < now && !expiredRafflesRef.current.has(raffle.id);
      })
      .forEach((raffle) => {
        expiredRafflesRef.current.add(raffle.id);
        updateTenantRaffle(tenantId, raffle.id, {
          status: 'expired',
        }).catch(() => {
          expiredRafflesRef.current.delete(raffle.id);
        });
      });
  }, [profile?.role, tenantId, tenantRaffles]);

  useEffect(() => {
    setActiveSection('resumen');
  }, [tenantId]);

  useEffect(() => {
    if (tenantId === 'global') {
      navigate('/admin', { replace: true });
    }
  }, [navigate, tenantId]);

  useEffect(() => {
    if (raffleStartAt || raffleEndAt) {
      return;
    }

    const today = toDatetimeLocalValue(new Date()).slice(0, 10);
    setRaffleStartAt(today);
    setRaffleEndAt(today);
  }, [raffleEndAt, raffleStartAt]);

  useEffect(() => {
    const branding = tenant?.branding || {};

    setSettingsForm({
      displayName: tenant?.displayName || tenant?.name || tenant?.slug || '',
      brandingDisplayName: branding.displayName || branding.name || tenant?.displayName || tenant?.name || '',
      primaryColor: branding.primaryColor || '#007de8',
      logoUrl: branding.logoUrl || '',
    });
    setSettingsLogoFile(null);
    setSettingsLogoPreview(branding.logoUrl || '');
    setSettingsMessage('');
    setSettingsError('');
  }, [tenant?.id, tenant?.slug, tenant?.displayName, tenant?.name, tenant?.branding]);

  useEffect(() => {
    if (!settingsLogoFile) {
      return undefined;
    }

    const previewUrl = URL.createObjectURL(settingsLogoFile);
    setSettingsLogoPreview(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [settingsLogoFile]);

  useEffect(() => {
    if (participantableRaffles.length === 0) {
      setParticipantRaffleId('');
      return;
    }

    setParticipantRaffleId((current) => current || participantableRaffles[0].id);
  }, [participantableRaffles]);

  useEffect(() => {
    if (activeBranches.length === 0) {
      setParticipantBranch('');
      return;
    }

    setParticipantBranch((current) => current || getBranchDisplayName(activeBranches[0]));
  }, [activeBranches]);

  useEffect(() => {
    if (!currentUser) {
      setProfile(null);
      setProfileReady(false);
      setProfileError('');
      return undefined;
    }

    return subscribeUserProfile(
      currentUser.uid,
      (data) => {
        setProfile(data);
        setProfileReady(true);
        setProfileError(data ? '' : 'No encontramos el perfil de esta cuenta en Firestore.');
      },
      (subscribeError) => {
        setProfile(null);
        setProfileReady(true);
        setProfileError(subscribeError?.message || 'No pudimos leer el perfil de usuario.');
      },
    );
  }, [currentUser]);

  useEffect(() => {
    if (!tenantId || tenantId === 'global') {
      setTenant({
        id: 'global',
        displayName: 'Panel global',
        status: 'active',
        branches: [],
        tenantsCount: 0,
        usersCount: 0,
      });
      setTenantReady(true);
      setTenantError('');
      setTenantBranches([]);
      setTenantRaffles([]);
      return undefined;
    }

    setTenantReady(false);
    let active = true;
    let unsubscribe = () => {};

    fetchTenantById(tenantId)
      .then((data) => {
        if (!active) {
          return;
        }

        if (data) {
          setTenant((currentTenant) => ({
            ...(currentTenant || {}),
            ...data,
            displayName: data.displayName || currentTenant?.displayName || currentTenant?.name || data.slug || data.id,
          }));
          setTenantError('');
        } else {
          setTenant(null);
        setTenantError('No encontramos la empresa solicitada en Firestore.');
        }
        setTenantReady(true);
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setTenant(null);
        setTenantReady(true);
        setTenantError(error?.message || 'No pudimos leer la empresa desde Firestore.');
      });

    unsubscribe = subscribeTenant(
      tenantId,
      (data) => {
        setTenant((currentTenant) => {
          if (!data) {
            return null;
          }

          return {
            ...(currentTenant || {}),
            ...data,
            displayName: data.displayName || currentTenant?.displayName || currentTenant?.name || data.slug || data.id,
          };
        });
        setTenantReady(true);
        setTenantError(data ? '' : 'No encontramos la empresa solicitada en Firestore.');
      },
      (subscribeError) => {
        setTenant((currentTenant) => currentTenant);
        setTenantReady(true);
        setTenantError(subscribeError?.message || 'No pudimos leer la empresa desde Firestore.');
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || tenantId === 'global') {
      return undefined;
    }

    return subscribeTenantBranches(
      tenantId,
      (items) => {
        setTenantBranches(items);
      },
      (error) => {
        setTenantBranches([]);
        setTenantError(error?.message || 'No pudimos leer las sucursales de la empresa.');
      },
    );
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || tenantId === 'global') {
      return undefined;
    }

    return subscribeTenantRaffles(
      tenantId,
      (items) => {
        setTenantRaffles(items);
      },
      (error) => {
      setTenantRaffles([]);
        setTenantError(error?.message || 'No pudimos leer los sorteos de la empresa.');
    },
  );
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || tenantId === 'global') {
      setTenantParticipants([]);
      return undefined;
    }

    return subscribeTenantParticipants(
      tenantId,
      (items) => {
        setTenantParticipants(items);
      },
      (error) => {
        setTenantParticipants([]);
        setTenantError(error?.message || 'No pudimos leer los participantes de la empresa.');
      },
    );
  }, [tenantId]);

  const isSuperAdmin = profile?.role === ROLES.SUPERADMIN;
  const canEnterTenant = useMemo(() => {
    if (!profile) {
      return false;
    }

    if (isSuperAdmin || tenantId === 'global') {
      return true;
    }

    return profile.tenantId === tenantId;
  }, [isSuperAdmin, profile, tenantId]);

  useEffect(() => {
    if (!authReady) {
      return undefined;
    }

    if (!currentUser) {
      const timeoutId = window.setTimeout(() => {
        setAuthMissing(true);
      }, 1200);

      return () => window.clearTimeout(timeoutId);
    }

    setAuthMissing(false);

    if (!profile && !profileReady) {
      return undefined;
    }

    if (profile && !canEnterTenant) {
      setLogoutError('Tu cuenta no tiene permiso para entrar a esta empresa.');
      signOut(auth).catch(() => {});
      navigate('/', { replace: true });
    }

    return undefined;
  }, [authReady, canEnterTenant, currentUser, navigate, profile, profileReady]);

  async function handleSignOut() {
    await signOut(auth);
    navigate('/', { replace: true });
  }

  async function handlePasswordChange(event) {
    event.preventDefault();
    setPasswordChangeError('');
    setPasswordChangeMessage('');
    setPasswordChangeSaving(true);

    try {
      if (!currentUser) {
        throw new Error('No encontramos la sesión activa.');
      }

      const passwordCheck = validateStrongPassword(newPassword);
      if (!passwordCheck.isValid) {
        throw new Error(`La nueva contraseña debe cumplir: ${passwordCheck.issues.join(' ')}`);
      }

      if (newPassword !== confirmNewPassword) {
        throw new Error('Las contraseñas no coinciden.');
      }

      await updatePassword(currentUser, newPassword);
      await updateDoc(doc(db, 'users', currentUser.uid), {
        mustChangePassword: false,
        updatedAt: serverTimestamp(),
      });

      setProfile((current) => (current ? { ...current, mustChangePassword: false } : current));
      setPasswordChangeMessage('Contraseña actualizada correctamente.');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (error) {
      setPasswordChangeError(error?.message || 'No pudimos actualizar la contraseña.');
    } finally {
      setPasswordChangeSaving(false);
    }
  }

  function handleBackToAdmin() {
    navigate('/admin', { replace: true });
  }

  if (!authReady || (!currentUser && !authMissing) || (currentUser && !profileReady) || (tenantId !== 'global' && !tenantReady)) {
    return (
      <Shell eyebrow="Portal" title="Cargando empresa..." description="Estamos resolviendo tu acceso y preparando tu espacio.">
        <Card>
          <LoadingDots label="Preparando tu espacio" />
        </Card>
      </Shell>
    );
  }

  if (!currentUser) {
    return (
      <Shell eyebrow="Portal" title="Sesión requerida" description="Necesitás iniciar sesión para volver al espacio de la empresa.">
        <Card>
          <div className="space-y-4">
            <p className="text-sm leading-6 text-[var(--text-secondary)]">
              La sesión del panel no está activa en este navegador. El registro público por QR funciona sin login, pero el panel de empresa requiere acceso.
            </p>
            <button
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-blue)] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_color-mix(in_srgb,var(--accent-strong)_26%,transparent)] transition hover:scale-[1.01]"
              onClick={() => navigate('/', { replace: true })}
              type="button"
            >
              Volver al portal
            </button>
          </div>
        </Card>
      </Shell>
    );
  }

  if (profileError || tenantError || logoutError) {
    return (
      <Shell eyebrow="Portal" title="Revisá el acceso" description="Algo no terminó de cargar en tu empresa.">
        <div className="space-y-4">
          {profileError ? (
            <Card>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Cuenta</p>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{profileError}</p>
            </Card>
          ) : null}
          {tenantError ? (
            <Card>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Empresa</p>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{tenantError}</p>
            </Card>
          ) : null}
          {logoutError ? (
            <Card>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Permisos</p>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{logoutError}</p>
            </Card>
          ) : null}
        </div>
      </Shell>
    );
  }

  if (requiresPasswordChange) {
    return (
      <Shell
        eyebrow="Portal"
        title="Cambiá tu contraseña"
        description="Es el primer ingreso de tu cuenta. Elegí una contraseña personal para seguir."
      >
        <Card>
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Acceso temporal</p>
              <h2 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">Necesitamos una contraseña personal</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                Tu cuenta fue creada con una contraseña temporal. Antes de entrar al espacio de la empresa, elegí una clave propia.
              </p>
              <p className="mt-3 max-w-2xl rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-sm leading-6 text-[var(--text-secondary)]">
                La nueva contraseña debe tener al menos 8 caracteres, una mayúscula, un número y un símbolo.
              </p>
            </div>

            {passwordChangeError ? (
              <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-600">
                {passwordChangeError}
              </div>
            ) : null}

            {passwordChangeMessage ? (
              <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-600">
                {passwordChangeMessage}
              </div>
            ) : null}

            <form className="space-y-4" onSubmit={handlePasswordChange}>
              <label className="block space-y-2">
                <span className="text-sm text-[var(--text-secondary)]">Nueva contraseña</span>
                <input
                  className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="Mínimo 8, 1 mayúscula, 1 número y 1 símbolo"
                  type="password"
                  value={newPassword}
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-[var(--text-secondary)]">Confirmar contraseña</span>
                <input
                  className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                  onChange={(event) => setConfirmNewPassword(event.target.value)}
                  type="password"
                  value={confirmNewPassword}
                />
              </label>

                <button
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-blue)] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_color-mix(in_srgb,var(--accent-strong)_26%,transparent)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={passwordChangeSaving}
                  type="submit"
                >
                {passwordChangeSaving ? 'Actualizando...' : 'Guardar nueva contraseña'}
              </button>
            </form>
          </div>
        </Card>
      </Shell>
    );
  }

  function getBranchDisplayName(branch) {
    return String(branch?.name || branch?.slug || branch?.id || 'Sucursal').trim();
  }

  function getBranchQrUrl(branch) {
    const branchId = String(branch?.slug || branch?.id || getBranchDisplayName(branch)).trim();
    return `${window.location.origin}/registro/${encodeURIComponent(tenantId)}/${encodeURIComponent(branchId)}`;
  }

  function toggleBranchSelection(branchName) {
    setSelectedBranchNames((current) =>
      current.includes(branchName)
        ? current.filter((item) => item !== branchName)
        : [...current, branchName],
    );
  }

  function resetRaffleForm() {
    setEditingRaffleId('');
    setRaffleName('');
    const today = toDatetimeLocalValue(new Date()).slice(0, 10);
    setRaffleStartAt(today);
    setRaffleEndAt(today);
    setSelectedBranchNames(activeBranches.map((branch) => getBranchDisplayName(branch)).filter(Boolean));
  }

  function startEditRaffle(raffle) {
    setEditingRaffleId(raffle.id);
    setRaffleName(raffle.name || '');
    setRaffleStartAt(toDateInputValue(raffle.startAt));
    setRaffleEndAt(toDateInputValue(raffle.endAt));
    setSelectedBranchNames(Array.isArray(raffle.enabledBranches) ? raffle.enabledBranches : []);
    setRaffleError('');
    setRaffleMessage('');
  }

  function startDrawRaffle(raffle) {
    setDrawRaffleId((current) => (current === raffle.id ? '' : raffle.id));
    setRaffleMode(raffle.drawMode || 'global');
    setRaffleWinners(String(raffle.winnersPerGroup ?? 1));
    setRaffleAlternates(String(raffle.alternatesPerGroup ?? 2));
    setDrawPreview(null);
    setDrawRevealCount(0);
    setDrawRolling(false);
    setDrawConfirmOpen(false);
    setRaffleError('');
    setRaffleMessage('');
  }

  async function handleCreateTenantParticipant(event) {
    event.preventDefault();
    setParticipantError('');
    setParticipantMessage('');
    setParticipantSaving(true);

    try {
      if (!tenantId || tenantId === 'global') {
        throw new Error('Elegí una empresa real para cargar participantes.');
      }

      if (!selectedParticipantRaffle?.id) {
        throw new Error('Creá o seleccioná un sorteo para asociar el participante.');
      }

      if (!participantName.trim() || !participantDni.trim() || !participantPhone.trim() || !participantBranch.trim()) {
        throw new Error('Completá nombre, DNI, teléfono y sucursal.');
      }

      const start = selectedParticipantRaffle.startAt ? new Date(selectedParticipantRaffle.startAt) : new Date();
      const end = selectedParticipantRaffle.endAt ? new Date(selectedParticipantRaffle.endAt) : new Date(Date.now() + 60 * 60 * 1000);

      await createTenantParticipant(tenantId, {
        dni: participantDni,
        nombre: participantName,
        telefono: participantPhone,
        sucursal: participantBranch,
        raffleId: selectedParticipantRaffle.id,
        raffleName: selectedParticipantRaffle.name,
        jornadaKey: selectedParticipantRaffle.id,
        jornadaLabel: selectedParticipantRaffle.name,
        jornadaStartAt: Number.isNaN(start.getTime()) ? new Date() : start,
        jornadaEndAt: Number.isNaN(end.getTime()) ? new Date(Date.now() + 60 * 60 * 1000) : end,
      });

      setParticipantMessage(`Participante ${participantName} guardado en ${tenantId}.`);
      setParticipantName('');
      setParticipantDni('');
      setParticipantPhone('');
    } catch (createError) {
      setParticipantError(createError?.message || 'No pudimos crear el participante.');
    } finally {
      setParticipantSaving(false);
    }
  }

  function handleExportParticipants() {
    if (exportableCustomers.length === 0) {
      setParticipantError('Todavía no hay clientes para exportar.');
      return;
    }

    setParticipantError('');
    setParticipantMessage('');

    const rows = exportableCustomers.map((customer) => ({
      Sucursal: customer.sucursal || 'Sin sucursal',
      Nombre: customer.nombre,
      DNI: customer.dni,
      Telefono: customer.telefono,
      'Sucursales registradas': Array.from(customer.sucursales).sort((first, second) => first.localeCompare(second, 'es')).join(', '),
      Participaciones: customer.participaciones,
      'Ultimo sorteo': customer.ultimoSorteo,
      'Ultima participacion': customer.ultimaParticipacion ? formatDate(customer.ultimaParticipacion) : '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 24 },
      { wch: 30 },
      { wch: 16 },
      { wch: 18 },
      { wch: 36 },
      { wch: 16 },
      { wch: 28 },
      { wch: 24 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Clientes');

    const today = new Date().toISOString().slice(0, 10);
    const tenantName = sanitizeFilename(getTenantDisplayName(tenant));
    XLSX.writeFile(workbook, `clientes-${tenantName}-${today}.xlsx`);
    setParticipantMessage(`Exportamos ${exportableCustomers.length} cliente(s) únicos en Excel.`);
  }

  function handleExportRaffleReport(raffle) {
    const reportId = createReportHash(raffle, raffle.result);
    const groups = Array.isArray(raffle?.result?.groups) ? raffle.result.groups : [];
    const rows = [];

    groups.forEach((group) => {
      (group.winners || []).forEach((winner, index) => {
        rows.push({
          'Reporte ID': reportId,
          Sorteo: raffle.name,
          Estado: getRaffleStatusLabel(raffle.status),
          'Fecha sorteo': raffle.completedAt ? formatDate(raffle.completedAt) : '',
          Grupo: group.group,
          Tipo: 'Ganador',
          Orden: index + 1,
          Nombre: winner.nombre,
          DNI: winner.dni,
          Telefono: winner.telefono,
          Sucursal: winner.sucursal,
          Chances: group.chanceCount,
          'Participantes unicos': group.eligibleCount,
        });
      });

      (group.alternates || []).forEach((alternate, index) => {
        rows.push({
          'Reporte ID': reportId,
          Sorteo: raffle.name,
          Estado: getRaffleStatusLabel(raffle.status),
          'Fecha sorteo': raffle.completedAt ? formatDate(raffle.completedAt) : '',
          Grupo: group.group,
          Tipo: 'Suplente',
          Orden: index + 1,
          Nombre: alternate.nombre,
          DNI: alternate.dni,
          Telefono: alternate.telefono,
          Sucursal: alternate.sucursal,
          Chances: group.chanceCount,
          'Participantes unicos': group.eligibleCount,
        });
      });
    });

    if (rows.length === 0) {
      rows.push({
        'Reporte ID': reportId,
        Sorteo: raffle.name,
        Estado: getRaffleStatusLabel(raffle.status),
        'Fecha sorteo': raffle.completedAt ? formatDate(raffle.completedAt) : '',
        Grupo: '',
        Tipo: 'Sin resultados guardados',
        Orden: '',
        Nombre: '',
        DNI: '',
        Telefono: '',
        Sucursal: '',
        Chances: '',
        'Participantes unicos': '',
      });
    }

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 18 },
      { wch: 30 },
      { wch: 18 },
      { wch: 22 },
      { wch: 24 },
      { wch: 14 },
      { wch: 10 },
      { wch: 30 },
      { wch: 16 },
      { wch: 18 },
      { wch: 24 },
      { wch: 12 },
      { wch: 18 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte');
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `reporte-${sanitizeFilename(raffle.name)}-${reportId}-${today}.xlsx`);
  }

  async function handleSaveTenantRaffle(event) {
    event.preventDefault();
    setRaffleError('');
    setRaffleMessage('');
    setRaffleSaving(true);

    try {
      if (!tenantId || tenantId === 'global') {
        throw new Error('Elegí una empresa real para crear sorteos.');
      }

      if (!raffleName.trim()) {
        throw new Error('Poné un nombre para el sorteo.');
      }

      if (!raffleStartAt || !raffleEndAt) {
        throw new Error('Definí inicio y cierre del sorteo.');
      }

      const start = dateInputToStartOfDay(raffleStartAt);
      const end = dateInputToEndOfDay(raffleEndAt);

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
        throw new Error('La fecha de cierre tiene que ser posterior al inicio.');
      }

      if (editingRaffleId) {
        await updateTenantRaffle(tenantId, editingRaffleId, {
          name: raffleName,
          startAt: start,
          endAt: end,
          enabledBranches: selectedBranchNames,
        });
        setRaffleMessage(`Sorteo actualizado correctamente: ${raffleName}.`);
      } else {
        const raffleId = await createTenantRaffle(tenantId, {
          name: raffleName,
          startAt: start,
          endAt: end,
          enabledBranches: selectedBranchNames,
        });
        setRaffleMessage(`Sorteo creado correctamente: ${raffleId}`);
      }

      resetRaffleForm();
    } catch (createError) {
      setRaffleError(createError?.message || 'No pudimos guardar el sorteo.');
    } finally {
      setRaffleSaving(false);
    }
  }

  async function handleExecuteTenantRaffle(raffle) {
    setRaffleError('');
    setRaffleMessage('');
    setDrawSaving(false);

    try {
      const winnersPerGroup = Math.max(0, Number.parseInt(raffleWinners, 10) || 0);
      const alternatesPerGroup = Math.max(0, Number.parseInt(raffleAlternates, 10) || 0);

      if (raffle.status !== 'active') {
        throw new Error('El sorteo tiene que estar activo para poder ejecutarlo.');
      }

      if (!canExecuteRaffleToday(raffle)) {
        throw new Error('El sorteo solo se puede ejecutar durante el día de finalización.');
      }

      if (winnersPerGroup <= 0) {
        throw new Error('Definí al menos un titular para ejecutar el sorteo.');
      }

      const raffleParticipants = tenantParticipants.filter((participant) => participant.raffleId === raffle.id);
      if (raffleParticipants.length === 0) {
        throw new Error('Este sorteo todavía no tiene participantes cargados.');
      }

      const groups = buildDrawResult(raffle, tenantParticipants, raffleMode, winnersPerGroup, alternatesPerGroup);
      const emptyGroup = groups.find((group) => group.winners.length < winnersPerGroup);
      if (emptyGroup) {
        throw new Error(`No hay participantes únicos suficientes en ${emptyGroup.group} para elegir ${winnersPerGroup} titular(es).`);
      }

      setDrawPreview({
        raffleId: raffle.id,
        raffleName: raffle.name,
        mode: raffleMode,
        winnersPerGroup,
        alternatesPerGroup,
        groups,
      });
      setDrawRevealCount(0);
      setDrawRolling(true);
      setDrawConfirmOpen(false);
      setRaffleMessage('Bolillero en marcha. Revisá la vista previa antes de guardar el resultado.');
    } catch (drawError) {
      setRaffleError(drawError?.message || 'No pudimos ejecutar el sorteo.');
    }
  }

  async function handleConfirmTenantRaffleResult(raffle) {
    if (!drawPreview || drawPreview.raffleId !== raffle.id) {
      setRaffleError('Primero ejecutá el bolillero para generar una vista previa.');
      return;
    }

    setRaffleError('');
    setRaffleMessage('');
    setDrawSaving(true);

    try {
      await updateTenantRaffle(tenantId, raffle.id, {
        status: 'completed',
        drawMode: drawPreview.mode,
        winnersPerGroup: drawPreview.winnersPerGroup,
        alternatesPerGroup: drawPreview.alternatesPerGroup,
        completedAt: serverTimestamp(),
        result: {
          mode: drawPreview.mode,
          winnersPerGroup: drawPreview.winnersPerGroup,
          alternatesPerGroup: drawPreview.alternatesPerGroup,
          groups: drawPreview.groups,
        },
      });

      setDrawPreview(null);
      setDrawRevealCount(0);
      setDrawRolling(false);
      setDrawRaffleId('');
      setRaffleMessage(`Resultado de ${raffle.name} guardado correctamente.`);
    } catch (saveError) {
      setRaffleError(saveError?.message || 'No pudimos guardar el resultado del sorteo.');
    } finally {
      setDrawSaving(false);
    }
  }

  async function handleToggleTenantRaffleStatus(raffle, { confirmed = false } = {}) {
    const nextStatus = raffle.status === 'active' ? 'paused' : 'active';
    setRaffleError('');
    setRaffleMessage('');

    try {
      if (nextStatus === 'active' && !confirmed) {
        setStatusConfirmRaffle(raffle);
        return;
      }

      setStatusUpdating(true);
      await updateTenantRaffle(tenantId, raffle.id, {
        status: nextStatus,
      });
      setStatusConfirmRaffle(null);
      setRaffleMessage(`Sorteo ${raffle.name} actualizado a ${getRaffleStatusLabel(nextStatus).toLowerCase()}.`);
    } catch (updateError) {
      setRaffleError(updateError?.message || 'No pudimos actualizar el sorteo.');
    } finally {
      setStatusUpdating(false);
    }
  }

  async function handleUpdateTenantSettings(event) {
    event.preventDefault();
    setSettingsError('');
    setSettingsMessage('');
    setSettingsSaving(true);

    try {
      if (!tenantId || tenantId === 'global') {
        throw new Error('No encontramos la empresa para actualizar.');
      }

      const displayName = settingsForm.displayName.trim();
      const brandingDisplayName = settingsForm.brandingDisplayName.trim() || displayName;
      const primaryColor = settingsForm.primaryColor.trim() || '#007de8';
      const logoUrl = settingsLogoFile
        ? await uploadBrandLogoFile(settingsLogoFile, tenantId)
        : settingsForm.logoUrl.trim();

      await updateDoc(doc(db, 'tenants', tenantId), {
        displayName,
        'branding.displayName': brandingDisplayName,
        'branding.name': brandingDisplayName,
        'branding.primaryColor': primaryColor,
        'branding.logoUrl': logoUrl,
        updatedAt: serverTimestamp(),
      });

      setSettingsForm((current) => ({
        ...current,
        displayName,
        brandingDisplayName,
        primaryColor,
        logoUrl,
      }));
      setSettingsLogoFile(null);
      setSettingsLogoPreview(logoUrl);
      setSettingsMessage('Configuración de marca actualizada.');
    } catch (error) {
      setSettingsError(error?.message || 'No pudimos actualizar la configuración.');
    } finally {
      setSettingsSaving(false);
    }
  }

  const sidebarSections =
    tenantId === 'global'
      ? [
          { id: 'resumen', label: 'Resumen', hint: 'Vista general' },
          { id: 'configuracion', label: 'Configuración', hint: 'Marca y colores' },
        ]
      : [
          { id: 'resumen', label: 'Resumen', hint: 'Vista general' },
          { id: 'sorteos', label: 'Sorteos', hint: 'Campañas activas' },
          { id: 'personas', label: 'Personas', hint: 'Participantes cargados' },
          { id: 'sedes', label: 'Sucursales', hint: 'Puntos activos' },
          { id: 'historial', label: 'Historial', hint: 'Movimientos recientes' },
          { id: 'configuracion', label: 'Configuración', hint: 'Marca y colores' },
        ];

  return (
    <Shell
      eyebrow="Panel de empresa"
      title={getTenantDisplayName(tenant)}
      description={
        tenantId === 'global'
          ? 'Vista global para administración de empresas, usuarios y operación central.'
          : 'Espacio dedicado de tu empresa. Desde acá vas a manejar sorteos, sucursales y usuarios.'
      }
      topLabel="Portal de empresas"
      topSubtitle={getRoleLabel(profile?.role)}
      accentColor={tenant?.branding?.primaryColor || ''}
      brandLogoUrl={tenant?.branding?.logoUrl || ''}
      brandName={tenant?.branding?.displayName || tenant?.branding?.name || getTenantDisplayName(tenant)}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {profile?.role === ROLES.SUPERADMIN && tenantId !== 'global' ? (
            <button
              className="inline-flex items-center rounded-full border border-[var(--border-soft)] bg-[var(--panel)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--accent-strong)] hover:text-[var(--accent-strong)]"
              onClick={handleBackToAdmin}
              type="button"
            >
              Volver al panel
            </button>
          ) : null}
          <button
            className="inline-flex items-center rounded-full border border-[var(--border-soft)] bg-[var(--panel)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--accent-strong)] hover:text-[var(--accent-strong)]"
            onClick={handleSignOut}
            type="button"
          >
            Cerrar sesión
          </button>
        </div>
      }
    >
      {activeDrawRaffle ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-[28px] border border-[var(--border-soft)] bg-[var(--panel)] p-5 shadow-[var(--shell-shadow)] sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border-soft)] pb-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Ejecutar sorteo</p>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{activeDrawRaffle.name}</h2>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">{formatDateRange(activeDrawRaffle.startAt, activeDrawRaffle.endAt)}</p>
              </div>
              {!drawPreview ? (
                <button
                  className="rounded-full border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent-strong)] hover:text-[var(--accent-strong)]"
                onClick={() => {
                  setDrawRaffleId('');
                  setDrawPreview(null);
                  setDrawRevealCount(0);
                  setDrawRolling(false);
                  setDrawConfirmOpen(false);
                }}
                  type="button"
                >
                  Cancelar ejecución
                </button>
              ) : null}
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <label className="space-y-2">
                <span className="text-sm text-[var(--text-secondary)]">Modalidad</span>
                <select
                  className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:opacity-60"
                  disabled={drawRolling || Boolean(drawPreview)}
                  onChange={(event) => setRaffleMode(event.target.value)}
                  value={raffleMode}
                >
                  <option value="global">Global</option>
                  <option value="branch">Por sucursal</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm text-[var(--text-secondary)]">Titulares por grupo</span>
                <input
                  className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:opacity-60"
                  disabled={drawRolling || Boolean(drawPreview)}
                  min="1"
                  onChange={(event) => setRaffleWinners(event.target.value)}
                  type="number"
                  value={raffleWinners}
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-[var(--text-secondary)]">Suplentes por grupo</span>
                <input
                  className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:opacity-60"
                  disabled={drawRolling || Boolean(drawPreview)}
                  min="0"
                  onChange={(event) => setRaffleAlternates(event.target.value)}
                  type="number"
                  value={raffleAlternates}
                />
              </label>
            </div>

            {drawPreview?.raffleId === activeDrawRaffle.id ? (
              <div className="mt-5 grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
                <div className="raffle-drum">
                  <div className="raffle-drum__halo" />
                  <div className={`raffle-ball ${drawRolling ? 'raffle-ball--rolling' : ''}`}>
                    <p className="raffle-ball__label">
                      {drawRolling ? 'Girando...' : drawPreviewPicks[Math.max(0, drawRevealCount - 1)]?.nombre || 'Resultado listo'}
                    </p>
                    <p className="raffle-ball__meta">
                      {drawRolling
                        ? `${drawRevealCount}/${drawPreviewPicks.length}`
                        : drawPreviewPicks.length > 0
                          ? 'Vista previa completa'
                          : 'Sin seleccionados'}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Ranking del sorteo</p>
                  {drawPreview.groups.map((group) => (
                    <div className="rounded-[18px] border border-[var(--border-soft)] bg-[var(--panel-muted)] p-4" key={`modal-preview-${activeDrawRaffle.id}-${group.group}`}>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{group.group}</p>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-[var(--accent-strong)]">Ganadores</p>
                          <div className="mt-2 space-y-1 text-sm text-[var(--text-secondary)]">
                            {group.winners?.length ? (
                              group.winners.map((winner) => {
                                const pickIndex = drawPreviewPicks.findIndex((pick) => pick.kind === 'Ganador' && pick.group === group.group && pick.dni === winner.dni);
                                const visible = pickIndex >= 0 && pickIndex < drawRevealCount;
                                return (
                                  <p className={visible ? 'text-[var(--text-primary)]' : 'opacity-40'} key={`modal-winner-${group.group}-${winner.dni}`}>
                                    {visible ? `${winner.nombre} - DNI ${winner.dni}` : 'Pendiente...'}
                                  </p>
                                );
                              })
                            ) : (
                              <p>Sin ganadores.</p>
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-[var(--accent-strong)]">Suplentes</p>
                          <div className="mt-2 space-y-1 text-sm text-[var(--text-secondary)]">
                            {group.alternates?.length ? (
                              group.alternates.map((alternate) => {
                                const pickIndex = drawPreviewPicks.findIndex((pick) => pick.kind === 'Suplente' && pick.group === group.group && pick.dni === alternate.dni);
                                const visible = pickIndex >= 0 && pickIndex < drawRevealCount;
                                return (
                                  <p className={visible ? 'text-[var(--text-primary)]' : 'opacity-40'} key={`modal-alternate-${group.group}-${alternate.dni}`}>
                                    {visible ? `${alternate.nombre} - DNI ${alternate.dni}` : 'Pendiente...'}
                                  </p>
                                );
                              })
                            ) : (
                              <p>Sin suplentes.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-blue)] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_color-mix(in_srgb,var(--accent-strong)_26%,transparent)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={drawSaving || drawRolling || Boolean(drawPreview) || !canExecuteRaffleToday(activeDrawRaffle)}
                onClick={() => setDrawConfirmOpen(true)}
                type="button"
              >
                {drawRolling ? 'Girando...' : 'Girar bolillero'}
              </button>
              {drawPreview?.raffleId === activeDrawRaffle.id ? (
                <button
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-blue)] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_color-mix(in_srgb,var(--accent-strong)_26%,transparent)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={drawSaving || drawRolling || drawRevealCount < drawPreviewPicks.length}
                  onClick={() => handleConfirmTenantRaffleResult(activeDrawRaffle)}
                  type="button"
                >
                  {drawSaving ? 'Guardando...' : 'Confirmar y guardar'}
                </button>
              ) : null}
            </div>

            {drawConfirmOpen ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm">
                <div className="w-full max-w-xl rounded-[28px] border border-[var(--border-soft)] bg-[var(--panel)] p-6 text-center shadow-[var(--shell-shadow)]">
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Confirmar ejecución</p>
                  <h3 className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">{activeDrawRaffle.name}</h3>
                  <div className="mt-5 grid gap-3 text-left sm:grid-cols-3">
                    <div className="rounded-[18px] border border-[var(--border-soft)] bg-[var(--panel-muted)] p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--accent-strong)]">Modalidad</p>
                      <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{raffleMode === 'branch' ? 'Por sucursal' : 'Global'}</p>
                    </div>
                    <div className="rounded-[18px] border border-[var(--border-soft)] bg-[var(--panel-muted)] p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--accent-strong)]">Titulares</p>
                      <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{raffleWinners} por grupo</p>
                    </div>
                    <div className="rounded-[18px] border border-[var(--border-soft)] bg-[var(--panel-muted)] p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--accent-strong)]">Suplentes</p>
                      <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{raffleAlternates} por grupo</p>
                    </div>
                  </div>
                  <p className="mx-auto mt-5 max-w-md text-sm leading-6 text-[var(--text-secondary)]">
                    Si confirmás, el bolillero va a girar y se generará una única vista previa para guardar.
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-3">
                    <button
                      className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-blue)] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_color-mix(in_srgb,var(--accent-strong)_26%,transparent)] transition hover:scale-[1.01]"
                      onClick={() => handleExecuteTenantRaffle(activeDrawRaffle)}
                      type="button"
                    >
                      Confirmar y girar
                    </button>
                    <button
                      className="inline-flex items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--panel-muted)] px-6 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent-strong)] hover:text-[var(--accent-strong)]"
                      onClick={() => setDrawConfirmOpen(false)}
                      type="button"
                    >
                      Corregir
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        cancelLabel="Cancelar"
        confirmLabel="Activar sorteo"
        description={statusConfirmRaffle ? 'Los QR de las sucursales habilitadas van a aceptar registros cuando el sorteo esté dentro de fecha. Revisá fechas y sucursales antes de continuar.' : ''}
        details={statusConfirmRaffle ? [
          { label: 'Sorteo', value: statusConfirmRaffle.name },
          { label: 'Sucursales', value: String(statusConfirmRaffle.enabledBranches?.length || 0) },
          { label: 'Estado', value: getRaffleStatusLabel(getOperationalRaffleStatus(statusConfirmRaffle)) },
        ] : []}
        eyebrow="Activar campaña"
        loading={statusUpdating}
        onCancel={() => setStatusConfirmRaffle(null)}
        onConfirm={() => handleToggleTenantRaffleStatus(statusConfirmRaffle, { confirmed: true })}
        open={Boolean(statusConfirmRaffle)}
        title={statusConfirmRaffle ? `¿Activar "${statusConfirmRaffle.name}"?` : ''}
      />

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <Card>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Secciones</p>
            <div className="mt-4 space-y-2">
              {sidebarSections.map((section) => {
                const selected = activeSection === section.id;
                return (
                  <button
                    className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                      selected
                        ? 'border-[var(--accent-strong)] bg-[var(--accent-soft)] text-[var(--accent-strong)] shadow-[inset_0_0_0_1px_var(--accent-soft)]'
                        : 'border-[var(--border-soft)] bg-[var(--panel-muted)] text-[var(--text-primary)] hover:border-[var(--accent-strong)]'
                    }`}
                    style={selected ? { borderColor: 'var(--accent-strong)' } : undefined}
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    type="button"
                  >
                    <span>
                      <span className="block text-sm font-semibold">{section.label}</span>
                      <span className="block text-xs text-[var(--text-secondary)]">{section.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Tu acceso</p>
            <div className="mt-4 space-y-3 text-sm text-[var(--text-secondary)]">
              <p>Email: {currentUser.email}</p>
              <p>Tipo de acceso: {getRoleLabel(profile?.role)}</p>
              <p>Empresa: {getTenantDisplayName(tenant)}</p>
            </div>
          </Card>
        </aside>

        <main className="space-y-6">
          {activeSection === 'resumen' ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <StatCard
                  hint={tenantId === 'global' ? 'Tenés visibilidad global de todo el sistema.' : 'Identificador interno de la empresa.'}
                  label={tenantId === 'global' ? 'Modo global' : 'Empresa'}
                  value={tenantId || 'Sin empresa'}
                />
                <StatCard
                  hint={tenant?.status === 'active' ? 'Empresa habilitada.' : 'Empresa pendiente de configuración.'}
                  label="Situación"
                  value={tenant?.status === 'active' ? 'Activo' : 'Pendiente'}
                />
                <StatCard
                  hint={tenantId === 'global' ? 'Resumen de toda la plataforma.' : 'Sucursales registradas en la empresa.'}
                  label={tenantId === 'global' ? 'Plataforma' : 'Sucursales'}
                  value={tenantId === 'global' ? String(tenant?.tenantsCount ?? 0) : String(visibleBranches.length)}
                />
              </div>

              <Card>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Espacio activo</p>
                    <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{getTenantDisplayName(tenant)}</p>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                      Todo lo que cargues acá queda aislado dentro de esta empresa. Tenés el acceso a mano y una vista rápida de lo que está operando.
                    </p>
                  </div>

                  <div className="grid min-w-[240px] gap-3 sm:gap-4">
                    <div className="rounded-[22px] border border-[var(--border-soft)] bg-[var(--panel-muted)] p-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-[var(--accent-strong)]">Cuenta</p>
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">{currentUser.email}</p>
                    </div>
                    <div className="rounded-[22px] border border-[var(--border-soft)] bg-[var(--panel-muted)] p-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-[var(--accent-strong)]">Tipo de acceso</p>
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">{getRoleLabel(profile?.role)}</p>
                    </div>
                  </div>
                </div>
              </Card>
            </>
          ) : null}

          {activeSection === 'sorteos' && tenantId !== 'global' ? (
            <div className="space-y-6">
              <Card>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Sorteos de la empresa</p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  Acá administrás los sorteos que pertenecen solo a {getTenantDisplayName(tenant)}.
                </p>
                <div className="mt-4 space-y-6">
                  {raffleError ? (
                    <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-600">
                      {raffleError}
                    </div>
                  ) : null}

                  {raffleMessage ? (
                    <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-600">
                      {raffleMessage}
                    </div>
                  ) : null}

                  <div className="rounded-[22px] border border-[var(--border-soft)] bg-[var(--panel-muted)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">Monitoreo en vivo</p>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">Participantes de hoy, ritmo por hora y alertas por sucursal.</p>
                      </div>
                      <span className="rounded-full border border-[var(--border-soft)] bg-[var(--panel)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
                        {tenantActiveRaffles.length} sorteo(s)
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      {tenantActiveRaffles.length > 0 ? (
                        tenantActiveRaffles.map((raffle) => {
                          const monitor = raffleMonitors.get(raffle.id) || buildRaffleMonitor(raffle, [], activeBranches);
                          return (
                            <div className="rounded-[18px] border border-[var(--border-soft)] bg-[var(--panel)] p-4" key={`monitor-${raffle.id}`}>
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="font-semibold text-[var(--text-primary)]">{raffle.name}</p>
                                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--accent-strong)]">{getRaffleStatusLabel(getOperationalRaffleStatus(raffle))}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-2xl font-semibold text-[var(--text-primary)]">{monitor.todayCount}</p>
                                  <p className="text-xs text-[var(--text-secondary)]">hoy / {monitor.totalCount} total</p>
                                </div>
                              </div>

                              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                {monitor.byBranch.map((branch) => (
                                  <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] p-3" key={`${raffle.id}-${branch.branchName}`}>
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-sm font-medium text-[var(--text-primary)]">{branch.branchName}</p>
                                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${branch.alert ? 'bg-amber-400/15 text-amber-700' : 'bg-emerald-400/15 text-emerald-700'}`}>
                                        {branch.todayCount}
                                      </span>
                                    </div>
                                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                                      {branch.latestAt ? `Último: ${formatDate(branch.latestAt)}` : 'Sin registros hoy'}
                                    </p>
                                  </div>
                                ))}
                              </div>

                              <div className="mt-4">
                                <p className="text-xs uppercase tracking-[0.18em] text-[var(--accent-strong)]">Ritmo por hora</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {monitor.hourly.length > 0 ? (
                                    monitor.hourly.map((hour) => (
                                      <span className="rounded-full border border-[var(--border-soft)] bg-[var(--panel-muted)] px-3 py-1 text-xs text-[var(--text-secondary)]" key={`${raffle.id}-${hour.hour}`}>
                                        {hour.hour}: {hour.count}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-xs text-[var(--text-secondary)]">Sin movimiento registrado hoy.</span>
                                  )}
                                </div>
                              </div>

                              <div className="mt-4">
                                <p className="text-xs uppercase tracking-[0.18em] text-[var(--accent-strong)]">Últimos registros</p>
                                <div className="mt-2 space-y-1 text-xs text-[var(--text-secondary)]">
                                  {monitor.latest.length > 0 ? (
                                    monitor.latest.map((participant) => (
                                      <p key={participant.id}>{participant.nombre} · {participant.sucursal} · DNI {participant.dni}</p>
                                    ))
                                  ) : (
                                    <p>No hay registros todavía.</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-sm text-[var(--text-secondary)]">No hay sorteos en curso para monitorear.</p>
                      )}
                    </div>
                  </div>

                  <form className="space-y-4" onSubmit={handleSaveTenantRaffle}>
                    <div className="grid gap-4 md:grid-cols-1">
                      <label className="space-y-2">
                        <span className="text-sm text-[var(--text-secondary)]">Nombre del sorteo</span>
                        <input
                          className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                          onChange={(event) => setRaffleName(event.target.value)}
                          placeholder="Sorteo de Demo"
                          type="text"
                          value={raffleName}
                        />
                      </label>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-sm text-[var(--text-secondary)]">Día de inicio</span>
                        <input
                          className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                          onChange={(event) => setRaffleStartAt(event.target.value)}
                          type="date"
                          value={raffleStartAt}
                        />
                        <p className="text-xs text-[var(--text-secondary)]">Inicio automático: 00:00 hs.</p>
                      </label>

                      <label className="space-y-2">
                        <span className="text-sm text-[var(--text-secondary)]">Día de finalización</span>
                        <input
                          className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                          onChange={(event) => setRaffleEndAt(event.target.value)}
                          type="date"
                          value={raffleEndAt}
                        />
                        <p className="text-xs text-[var(--text-secondary)]">Cierre automático: 23:59 hs.</p>
                      </label>
                    </div>

                    <div>
                      <p className="text-sm text-[var(--text-secondary)]">Sucursales habilitadas</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {activeBranches.length > 0 ? (
                          activeBranches.map((branch) => {
                            const branchName = getBranchDisplayName(branch);
                            const selected = selectedBranchNames.includes(branchName);

                            return (
                              <button
                                className={`rounded-full border px-3 py-2 text-xs font-medium transition ${
                                  selected
                                    ? 'border-[var(--accent-strong)] bg-[var(--accent-soft)] text-[var(--accent-strong)]'
                                    : 'border-[var(--border-soft)] bg-[var(--panel-muted)] text-[var(--text-secondary)] hover:border-[var(--accent-strong)] hover:text-[var(--text-primary)]'
                                }`}
                                key={branch.id || branchName}
                                onClick={() => toggleBranchSelection(branchName)}
                                type="button"
                              >
                                {branchName}
                              </button>
                            );
                          })
                        ) : (
                          <p className="text-sm text-[var(--text-secondary)]">Todavía no hay sucursales cargadas para esta empresa.</p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-blue)] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_color-mix(in_srgb,var(--accent-strong)_26%,transparent)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={raffleSaving}
                        type="submit"
                      >
                        {raffleSaving ? 'Guardando sorteo...' : editingRaffleId ? 'Guardar cambios' : 'Crear sorteo'}
                      </button>
                      {editingRaffleId ? (
                        <button
                          className="inline-flex items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--panel)] px-6 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent-strong)] hover:text-[var(--accent-strong)]"
                          onClick={resetRaffleForm}
                          type="button"
                        >
                          Cancelar edición
                        </button>
                      ) : null}
                    </div>
                  </form>

                  <div className="rounded-[22px] border border-[var(--border-soft)] bg-[var(--panel-muted)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">Sorteos activos</p>
                        <p className="text-sm text-[var(--text-secondary)]">Estos sorteos ya quedaron separados por empresa.</p>
                      </div>
                      <span className="rounded-full border border-[var(--border-soft)] bg-[var(--panel)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
                        {tenantActiveRaffles.length}
                      </span>
                    </div>

                    <div className="mt-4 space-y-3">
                      {tenantActiveRaffles.length > 0 ? (
                        tenantActiveRaffles.map((raffle) => (
                          <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--panel)] p-4" key={raffle.id}>
                            {(() => {
                              const canDrawToday = canExecuteRaffleToday(raffle);
                              const drawInProgress = drawRaffleId === raffle.id;
                              const raffleParticipantCount = countRaffleParticipants(tenantParticipants, raffle.id);
                              const canStartDraw = canDrawToday && raffleParticipantCount > 0;
                              const operationalStatus = getOperationalRaffleStatus(raffle);

                              return (
                                <>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-[var(--text-primary)]">{raffle.name}</p>
                                <p className="mt-1 text-sm text-[var(--text-secondary)]">{formatDateRange(raffle.startAt, raffle.endAt)}</p>
                                {!canDrawToday && raffle.status !== 'completed' ? (
                                  <p className="mt-1 text-xs text-[var(--text-secondary)]">El botón de sorteo se habilita cuando el sorteo está activo y es el día de finalización.</p>
                                ) : null}
                                {canDrawToday && raffleParticipantCount === 0 ? (
                                  <p className="mt-1 text-xs text-[var(--text-secondary)]">Cargá participantes para habilitar la ejecución del sorteo.</p>
                                ) : null}
                              </div>
                              <span className="rounded-full border border-[var(--border-soft)] bg-[var(--panel-muted)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
                                {getRaffleStatusLabel(operationalStatus)}
                              </span>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              {(raffle.enabledBranches ?? []).map((branchName) => (
                                <span
                                  className="rounded-full border border-[var(--border-soft)] bg-[var(--panel-muted)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)]"
                                  key={`${raffle.id}-${branchName}`}
                                >
                                  {branchName}
                                </span>
                              ))}
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              <button
                                className="rounded-full border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--accent-strong)] hover:text-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={drawInProgress}
                                onClick={() => startEditRaffle(raffle)}
                                type="button"
                              >
                                Editar
                              </button>
                              <button
                                className="rounded-full border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--accent-strong)] hover:text-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={drawInProgress}
                                onClick={() => handleToggleTenantRaffleStatus(raffle)}
                                type="button"
                              >
                                {raffle.status === 'active' ? 'Pausar' : 'Activar sorteo'}
                              </button>
                              <button
                                className="rounded-full border border-[var(--accent-strong)] bg-[var(--accent-soft)] px-4 py-2 text-sm font-semibold text-[var(--accent-strong)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={!canStartDraw || drawInProgress}
                                onClick={() => startDrawRaffle(raffle)}
                                type="button"
                              >
                                Ejecutar sorteo
                              </button>
                            </div>

                            {false && drawRaffleId === raffle.id ? (
                              <div className="mt-4 rounded-[22px] border border-[var(--accent-strong)] bg-[var(--accent-soft)] p-4">
                                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Ejecutar sorteo</p>
                                <div className="mt-4 grid gap-4 md:grid-cols-3">
                                  <label className="space-y-2">
                                    <span className="text-sm text-[var(--text-secondary)]">Modalidad</span>
                                    <select
                                      className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                                      disabled={drawRolling || Boolean(drawPreview)}
                                      onChange={(event) => setRaffleMode(event.target.value)}
                                      value={raffleMode}
                                    >
                                      <option value="global">Global</option>
                                      <option value="branch">Por sucursal</option>
                                    </select>
                                  </label>

                                  <label className="space-y-2">
                                    <span className="text-sm text-[var(--text-secondary)]">Titulares por grupo</span>
                                    <input
                                      className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                                      disabled={drawRolling || Boolean(drawPreview)}
                                      min="1"
                                      onChange={(event) => setRaffleWinners(event.target.value)}
                                      type="number"
                                      value={raffleWinners}
                                    />
                                  </label>

                                  <label className="space-y-2">
                                    <span className="text-sm text-[var(--text-secondary)]">Suplentes por grupo</span>
                                    <input
                                      className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                                      disabled={drawRolling || Boolean(drawPreview)}
                                      min="0"
                                      onChange={(event) => setRaffleAlternates(event.target.value)}
                                      type="number"
                                      value={raffleAlternates}
                                    />
                                  </label>
                                </div>
                                {drawPreview?.raffleId === raffle.id ? (
                                  <div className="mt-4 rounded-[22px] border border-[var(--border-soft)] bg-[var(--panel)] p-4">
                                    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
                                      <div className="raffle-drum">
                                        <div className="raffle-drum__halo" />
                                        <div className={`raffle-ball ${drawRolling ? 'raffle-ball--rolling' : ''}`}>
                                          <p className="raffle-ball__label">
                                            {drawRolling
                                              ? 'Girando...'
                                              : drawPreviewPicks[Math.max(0, drawRevealCount - 1)]?.nombre || 'Resultado listo'}
                                          </p>
                                          <p className="raffle-ball__meta">
                                            {drawRolling
                                              ? `${drawRevealCount}/${drawPreviewPicks.length}`
                                              : drawPreviewPicks.length > 0
                                                ? 'Vista previa completa'
                                                : 'Sin seleccionados'}
                                          </p>
                                        </div>
                                      </div>

                                      <div className="space-y-3">
                                        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Vista previa</p>
                                        {drawPreview.groups.map((group) => (
                                          <div className="rounded-[18px] border border-[var(--border-soft)] bg-[var(--panel-muted)] p-3" key={`preview-${raffle.id}-${group.group}`}>
                                            <p className="text-sm font-semibold text-[var(--text-primary)]">{group.group}</p>
                                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                                              <div>
                                                <p className="text-xs uppercase tracking-[0.18em] text-[var(--accent-strong)]">Ganadores</p>
                                                <div className="mt-2 space-y-1 text-sm text-[var(--text-secondary)]">
                                                  {group.winners?.length ? (
                                                    group.winners.map((winner) => {
                                                      const pickIndex = drawPreviewPicks.findIndex((pick) => pick.kind === 'Ganador' && pick.group === group.group && pick.dni === winner.dni);
                                                      const visible = pickIndex >= 0 && pickIndex < drawRevealCount;
                                                      return (
                                                        <p className={visible ? 'text-[var(--text-primary)]' : 'opacity-40'} key={`preview-winner-${group.group}-${winner.dni}`}>
                                                          {visible ? `${winner.nombre} · DNI ${winner.dni}` : 'Pendiente...'}
                                                        </p>
                                                      );
                                                    })
                                                  ) : (
                                                    <p>Sin ganadores.</p>
                                                  )}
                                                </div>
                                              </div>
                                              <div>
                                                <p className="text-xs uppercase tracking-[0.18em] text-[var(--accent-strong)]">Suplentes</p>
                                                <div className="mt-2 space-y-1 text-sm text-[var(--text-secondary)]">
                                                  {group.alternates?.length ? (
                                                    group.alternates.map((alternate) => {
                                                      const pickIndex = drawPreviewPicks.findIndex((pick) => pick.kind === 'Suplente' && pick.group === group.group && pick.dni === alternate.dni);
                                                      const visible = pickIndex >= 0 && pickIndex < drawRevealCount;
                                                      return (
                                                        <p className={visible ? 'text-[var(--text-primary)]' : 'opacity-40'} key={`preview-alternate-${group.group}-${alternate.dni}`}>
                                                          {visible ? `${alternate.nombre} · DNI ${alternate.dni}` : 'Pendiente...'}
                                                        </p>
                                                      );
                                                    })
                                                  ) : (
                                                    <p>Sin suplentes.</p>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                ) : null}
                                <div className="mt-4 flex flex-wrap gap-2">
                                  <button
                                    className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-blue)] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_color-mix(in_srgb,var(--accent-strong)_26%,transparent)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                                    disabled={drawSaving || drawRolling || Boolean(drawPreview) || !canDrawToday}
                                    onClick={() => handleExecuteTenantRaffle(raffle)}
                                    type="button"
                                  >
                                    {drawRolling ? 'Girando...' : 'Girar bolillero'}
                                  </button>
                                  {drawPreview?.raffleId === raffle.id ? (
                                    <button
                                      className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-blue)] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_color-mix(in_srgb,var(--accent-strong)_26%,transparent)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                                      disabled={drawSaving || drawRolling || drawRevealCount < drawPreviewPicks.length}
                                      onClick={() => handleConfirmTenantRaffleResult(raffle)}
                                      type="button"
                                    >
                                      {drawSaving ? 'Guardando...' : 'Confirmar y guardar'}
                                    </button>
                                  ) : null}
                                  {!drawPreview ? (
                                    <button
                                      className="inline-flex items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--panel)] px-6 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent-strong)] hover:text-[var(--accent-strong)]"
                                      onClick={() => {
                                        setDrawRaffleId('');
                                        setDrawPreview(null);
                                        setDrawRevealCount(0);
                                        setDrawRolling(false);
                                      }}
                                      type="button"
                                    >
                                      Cancelar
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}
                                </>
                              );
                            })()}
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-[var(--text-secondary)]">
                          Todavía no hay sorteos cargados para esta empresa. Creá el primero desde el formulario.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          ) : null}

          {activeSection === 'personas' && tenantId !== 'global' ? (
            <Card>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Personas de la empresa</p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Cargá personas dentro del sorteo activo para que queden guardadas en esta empresa.
              </p>

              {participantError ? (
                <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-600">
                  {participantError}
                </div>
              ) : null}

              {participantMessage ? (
                <div className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-600">
                  {participantMessage}
                </div>
              ) : null}

              <form className="mt-4 space-y-4" onSubmit={handleCreateTenantParticipant}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm text-[var(--text-secondary)]">Sorteo</span>
                    <select
                      className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                      onChange={(event) => setParticipantRaffleId(event.target.value)}
                      value={participantRaffleId}
                    >
                      {participantableRaffles.length > 0 ? (
                        participantableRaffles.map((raffle) => (
                          <option key={raffle.id} value={raffle.id}>
                            {raffle.name}
                          </option>
                        ))
                      ) : (
                        <option value="">No hay sorteos activos</option>
                      )}
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm text-[var(--text-secondary)]">Sucursal</span>
                    <select
                      className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                      onChange={(event) => setParticipantBranch(event.target.value)}
                      value={participantBranch}
                    >
                      {activeBranches.length > 0 ? (
                        activeBranches.map((branch) => {
                          const branchName = getBranchDisplayName(branch);
                          return (
                            <option key={branch.id || branchName} value={branchName}>
                              {branchName}
                            </option>
                          );
                        })
                      ) : (
                        <option value="">Sin sucursales</option>
                      )}
                    </select>
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <label className="space-y-2">
                    <span className="text-sm text-[var(--text-secondary)]">Nombre</span>
                    <input
                      className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                      onChange={(event) => setParticipantName(event.target.value)}
                      placeholder="Nombre y apellido"
                      type="text"
                      value={participantName}
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm text-[var(--text-secondary)]">DNI</span>
                    <input
                      className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                      onChange={(event) => setParticipantDni(event.target.value)}
                      placeholder="12345678"
                      type="text"
                      value={participantDni}
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm text-[var(--text-secondary)]">Teléfono</span>
                    <input
                      className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                      onChange={(event) => setParticipantPhone(event.target.value)}
                      placeholder="3874123456"
                      type="text"
                      value={participantPhone}
                    />
                  </label>
                </div>

                <button
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-blue)] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_color-mix(in_srgb,var(--accent-strong)_26%,transparent)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={participantSaving || participantableRaffles.length === 0 || activeBranches.length === 0}
                  type="submit"
                >
                  {participantSaving ? 'Guardando participante...' : 'Guardar persona'}
                </button>
              </form>

              <div className="mt-5 rounded-[22px] border border-[var(--border-soft)] bg-[var(--panel-muted)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Personas cargadas</p>
                    <p className="text-sm text-[var(--text-secondary)]">
                      {selectedParticipantRaffle ? `Filtrado por ${selectedParticipantRaffle.name}` : 'Aún no hay sorteo seleccionado'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      className="inline-flex items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--panel)] px-4 py-2 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent-strong)] hover:text-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={exportableCustomers.length === 0}
                      onClick={handleExportParticipants}
                      type="button"
                    >
                      Exportar Excel
                    </button>
                    <span className="rounded-full border border-[var(--border-soft)] bg-[var(--panel)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
                      {tenantParticipantsForRaffle.length}
                    </span>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {tenantParticipantsForRaffle.length > 0 ? (
                    tenantParticipantsForRaffle.map((participant) => (
                      <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--panel)] p-4" key={participant.id}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-[var(--text-primary)]">{participant.nombre}</p>
                            <p className="mt-1 text-sm text-[var(--text-secondary)]">DNI {participant.dni} · Teléfono {participant.telefono}</p>
                          </div>
                          <span className="rounded-full border border-[var(--border-soft)] bg-[var(--panel-muted)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
                            {participant.sucursal}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[var(--text-secondary)]">
                      Todavía no hay personas cargadas para este sorteo.
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ) : null}

          {activeSection === 'sedes' && tenantId !== 'global' ? (
            <Card>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Sucursales de la empresa</p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Cada sucursal tiene un QR imprimible para registrar participantes directamente en el sorteo activo.
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {activeBranches.length > 0 ? (
                  activeBranches.map((branch) => (
                    <QRCodeCard
                      branch={getBranchDisplayName(branch)}
                      key={branch.id || branch.slug || branch.name}
                      url={getBranchQrUrl(branch)}
                    />
                  ))
                ) : (
                  <p className="text-sm text-[var(--text-secondary)]">Todavía no hay sucursales cargadas para esta empresa.</p>
                )}
              </div>
            </Card>
          ) : null}

          {activeSection === 'historial' && tenantId !== 'global' ? (
            <Card>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Historial de la empresa</p>
              <div className="mt-4 space-y-3 text-sm text-[var(--text-secondary)]">
                <p>• Sorteos en curso: {tenantActiveRaffles.length}</p>
                <p>• Sorteos cerrados: {completedTenantRaffles.length}</p>
                <p>• Sucursales activas: {activeBranches.length}</p>
              </div>
              <div className="mt-5 space-y-3">
                {completedTenantRaffles.length > 0 ? (
                  completedTenantRaffles.map((raffle) => (
                    <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] p-4" key={raffle.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[var(--text-primary)]">{raffle.name}</p>
                          <p className="mt-1 text-sm text-[var(--text-secondary)]">{formatDateRange(raffle.startAt, raffle.endAt)}</p>
                          <p className="mt-1 text-xs text-[var(--text-secondary)]">ID reporte: {createReportHash(raffle, raffle.result)}</p>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <span className="rounded-full border border-[var(--border-soft)] bg-[var(--panel)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
                            {getRaffleStatusLabel(raffle.status)}
                          </span>
                          <button
                            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--panel)] px-4 py-2 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent-strong)] hover:text-[var(--accent-strong)]"
                            onClick={() => handleExportRaffleReport(raffle)}
                            type="button"
                          >
                            Exportar reporte
                          </button>
                        </div>
                      </div>

                      {raffle.result?.groups?.length ? (
                        <div className="mt-4 space-y-3">
                          {raffle.result.groups.map((group) => (
                            <div className="rounded-[18px] border border-[var(--border-soft)] bg-[var(--panel)] p-3" key={`${raffle.id}-${group.group}`}>
                              <p className="text-sm font-semibold text-[var(--text-primary)]">{group.group}</p>
                              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--accent-strong)]">Ganadores</p>
                              <div className="mt-2 space-y-1 text-sm text-[var(--text-secondary)]">
                                {group.winners?.length ? (
                                  group.winners.map((winner) => (
                                    <p key={`${raffle.id}-${group.group}-winner-${winner.dni}`}>{winner.nombre} · DNI {winner.dni}</p>
                                  ))
                                ) : (
                                  <p>Sin ganadores registrados.</p>
                                )}
                              </div>
                              <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--accent-strong)]">Suplentes</p>
                              <div className="mt-2 space-y-1 text-sm text-[var(--text-secondary)]">
                                {group.alternates?.length ? (
                                  group.alternates.map((alternate) => (
                                    <p key={`${raffle.id}-${group.group}-alternate-${alternate.dni}`}>{alternate.nombre} · DNI {alternate.dni}</p>
                                  ))
                                ) : (
                                  <p>Sin suplentes registrados.</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[var(--text-secondary)]">Todavía no hay sorteos ejecutados.</p>
                )}
              </div>
            </Card>
          ) : null}

          {activeSection === 'configuracion' ? (
            <Card>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Configuración</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">Marca de la empresa</p>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                    Definí el color principal y el logo que se muestran en el panel y en las pantallas públicas del sorteo.
                  </p>
                </div>

                <div className="w-full max-w-sm rounded-[22px] border border-[var(--border-soft)] bg-[var(--panel-muted)] p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-[var(--accent-strong)]">Vista previa</p>
                  <div className="mt-4 flex items-center gap-4">
                    <img
                      alt={settingsForm.brandingDisplayName || getTenantDisplayName(tenant)}
                      className="h-16 w-16 shrink-0 rounded-2xl border border-[var(--border-soft)] bg-[var(--panel)] object-contain p-1 shadow-[var(--card-shadow)]"
                      src={settingsLogoPreview || settingsForm.logoUrl || tenant?.branding?.logoUrl || '/default-brand-logo.png'}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-[var(--text-primary)]">
                        {settingsForm.brandingDisplayName || settingsForm.displayName || getTenantDisplayName(tenant)}
                      </p>
                      <div className="mt-2 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                        <span
                          aria-hidden="true"
                          className="h-5 w-5 rounded-full border border-[var(--border-soft)]"
                          style={{ backgroundColor: settingsForm.primaryColor || '#007de8' }}
                        />
                        <span>{settingsForm.primaryColor || '#007de8'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {settingsError ? (
                <div className="mt-5 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-600">
                  {settingsError}
                </div>
              ) : null}

              {settingsMessage ? (
                <div className="mt-5 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-600">
                  {settingsMessage}
                </div>
              ) : null}

              <form className="mt-6 space-y-5" onSubmit={handleUpdateTenantSettings}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm text-[var(--text-secondary)]">Nombre visible</span>
                    <input
                      className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                      disabled={tenantId === 'global' || settingsSaving}
                      onChange={(event) => setSettingsForm((current) => ({ ...current, displayName: event.target.value }))}
                      placeholder="Nombre de la empresa"
                      required
                      type="text"
                      value={settingsForm.displayName}
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm text-[var(--text-secondary)]">Nombre de marca</span>
                    <input
                      className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                      disabled={tenantId === 'global' || settingsSaving}
                      onChange={(event) => setSettingsForm((current) => ({ ...current, brandingDisplayName: event.target.value }))}
                      placeholder="Nombre que verá el participante"
                      type="text"
                      value={settingsForm.brandingDisplayName}
                    />
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                  <label className="space-y-2">
                    <span className="text-sm text-[var(--text-secondary)]">Color principal</span>
                    <div className="flex gap-3">
                      <input
                        aria-label="Seleccionar color principal"
                        className="h-12 w-16 rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] p-1"
                        disabled={tenantId === 'global' || settingsSaving}
                        onChange={(event) => setSettingsForm((current) => ({ ...current, primaryColor: event.target.value }))}
                        type="color"
                        value={settingsForm.primaryColor}
                      />
                      <input
                        className="min-w-0 flex-1 rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                        disabled={tenantId === 'global' || settingsSaving}
                        onChange={(event) => setSettingsForm((current) => ({ ...current, primaryColor: event.target.value }))}
                        pattern="^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$"
                        placeholder="#007de8"
                        type="text"
                        value={settingsForm.primaryColor}
                      />
                    </div>
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm text-[var(--text-secondary)]">Logo de la empresa</span>
                    <input
                      accept="image/*"
                      className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition file:mr-4 file:rounded-full file:border-0 file:bg-[var(--accent-soft)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[var(--accent-strong)] focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                      disabled={tenantId === 'global' || settingsSaving}
                      onChange={(event) => setSettingsLogoFile(event.target.files?.[0] || null)}
                      type="file"
                    />
                  </label>
                </div>

                <label className="block space-y-2">
                  <span className="text-sm text-[var(--text-secondary)]">URL del logo</span>
                  <input
                    className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                    disabled={tenantId === 'global' || settingsSaving || Boolean(settingsLogoFile)}
                    onChange={(event) => {
                      setSettingsLogoPreview(event.target.value);
                      setSettingsForm((current) => ({ ...current, logoUrl: event.target.value }));
                    }}
                    placeholder="https://..."
                    type="url"
                    value={settingsForm.logoUrl}
                  />
                  {settingsLogoFile ? (
                    <p className="text-xs leading-5 text-[var(--text-secondary)]">
                      Se usará el archivo seleccionado y se actualizará esta URL al guardar.
                    </p>
                  ) : null}
                </label>

                <div className="flex flex-col gap-3 border-t border-[var(--border-soft)] pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm leading-6 text-[var(--text-secondary)]">
                    Los cambios se aplican al encabezado del panel y al registro público del QR.
                  </p>
                  <button
                    className="inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-blue)] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_color-mix(in_srgb,var(--accent-strong)_26%,transparent)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    disabled={tenantId === 'global' || settingsSaving}
                    type="submit"
                  >
                    {settingsSaving ? 'Guardando...' : 'Guardar configuración'}
                  </button>
                </div>
              </form>
            </Card>
          ) : null}
        </main>
      </div>
    </Shell>
  );
}
