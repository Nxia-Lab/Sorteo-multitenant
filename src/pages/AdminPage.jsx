import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { browserLocalPersistence, getIdToken, onAuthStateChanged, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import Card from '../components/Card';
import LoadingDots from '../components/LoadingDots';
import Shell from '../components/Shell';
import { getAuthSessionSnapshot, subscribeAuthSession } from '../lib/authSession';
import { auth } from '../lib/firebase';
import { formatDate } from '../lib/format';
import { fetchUserProfileByUid, subscribeAllTenants, subscribePlatformSettings, updatePlatformSettings, updateTenant } from '../lib/portal';
import { createTenantWithAccess, resetTenantAccess, sendTenantAccessEmail } from '../lib/provisioning';
import { generateStrongTemporaryPassword } from '../lib/passwordPolicy';
import { uploadBrandLogoFile } from '../lib/storage';
import { getRoleLabel, ROLES } from '../lib/tenantModel';

function MetricCard({ label, value, helper }) {
  return (
    <div className="rounded-[22px] border border-[var(--border-soft)] bg-[linear-gradient(180deg,var(--panel-muted),var(--panel))] p-4 shadow-[var(--card-shadow)]">
      <div className="mb-3 h-1 rounded-full bg-[var(--accent-strong)]" />
      <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[var(--accent-strong)]">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">{value}</p>
      {helper ? <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{helper}</p> : null}
    </div>
  );
}

function TenantCard({ tenant, onEdit, onOpen, onResetAccess, onToggleStatus }) {
  const branchCount = Array.isArray(tenant?.branches) ? tenant.branches.length : 0;
  const tenantLogo = tenant?.branding?.logoUrl || '';
  const tenantColor = tenant?.branding?.primaryColor || '#007de8';
  const fallbackLogo = '/default-brand-logo.png';

  return (
    <div className="group relative overflow-hidden rounded-[24px] border border-[var(--border-soft)] bg-[linear-gradient(180deg,var(--panel-muted),var(--panel))] p-4 shadow-[var(--card-shadow)] transition-transform duration-300 hover:-translate-y-0.5">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent-strong)] to-transparent opacity-70" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <img
              alt={tenant.displayName || tenant.slug}
              className="h-14 w-14 shrink-0 rounded-2xl border border-[var(--border-soft)] bg-[var(--panel)] object-contain p-1 shadow-[var(--card-shadow)]"
              src={tenantLogo || fallbackLogo}
            />
            <div className="inline-flex items-center rounded-full border border-[var(--border-soft)] bg-[var(--panel)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">
              /{tenant.slug}
            </div>
          </div>
          <p className="mt-3 text-lg font-semibold text-[var(--text-primary)]">{tenant.displayName || tenant.slug}</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Empresa operativa dentro del portal global.</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${
          tenant.status === 'active'
            ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-500'
            : 'border-[var(--border-soft)] bg-[var(--panel)] text-[var(--text-secondary)]'
        }`}>
          {tenant.status || 'active'}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] p-3">
          <p className="text-xs uppercase tracking-[0.22em] text-[var(--accent-strong)]">Sucursales</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{branchCount}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] p-3">
          <p className="text-xs uppercase tracking-[0.22em] text-[var(--accent-strong)]">Dueño</p>
          <p className="mt-2 truncate text-sm text-[var(--text-secondary)]">{tenant.ownerEmail || tenant.ownerUid || 'Sin asignar'}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] p-3">
          <p className="text-xs uppercase tracking-[0.22em] text-[var(--accent-strong)]">Alta</p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">{formatDate(tenant.createdAt)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          className="rounded-full border border-[var(--accent-strong)] bg-[var(--accent-soft)] px-4 py-2 text-sm font-semibold text-[var(--accent-strong)] transition hover:scale-[1.01]"
          onClick={() => onOpen(tenant.slug)}
          type="button"
        >
          Abrir espacio
        </button>
        <button
          className="rounded-full border border-[var(--border-soft)] bg-[var(--panel)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent-strong)] hover:text-[var(--accent-strong)]"
          onClick={() => onEdit(tenant)}
          type="button"
        >
          Editar
        </button>
        <button
          className="rounded-full border border-[var(--border-soft)] bg-[var(--panel)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent-strong)] hover:text-[var(--accent-strong)]"
          onClick={() => onToggleStatus(tenant)}
          type="button"
        >
          {tenant.status === 'active' ? 'Pausar' : 'Activar'}
        </button>
        <button
          className="rounded-full border border-[var(--border-soft)] bg-[var(--panel)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent-strong)] hover:text-[var(--accent-strong)]"
          onClick={() => onResetAccess(tenant)}
          type="button"
        >
          Resetear acceso
        </button>
        <span className="text-xs text-[var(--text-secondary)]">Acceso directo al espacio del cliente.</span>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const navigate = useNavigate();
  const { authUser, authReady } = useSyncExternalStore(
    subscribeAuthSession,
    getAuthSessionSnapshot,
    getAuthSessionSnapshot,
  );
  const currentUser = authUser || auth.currentUser;
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [tenants, setTenants] = useState([]);
  const [tenantReady, setTenantReady] = useState(false);
  const [tenantError, setTenantError] = useState('');
  const [authError, setAuthError] = useState('');
  const [tenantSaving, setTenantSaving] = useState(false);
  const [tenantMessage, setTenantMessage] = useState('');
  const [platformSettings, setPlatformSettings] = useState(null);
  const [platformReady, setPlatformReady] = useState(false);
  const [platformMessage, setPlatformMessage] = useState('');
  const [platformError, setPlatformError] = useState('');
  const [platformSaving, setPlatformSaving] = useState(false);
  const [platformSettingsOpen, setPlatformSettingsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('resumen');
  const [selectedTenantSlug, setSelectedTenantSlug] = useState('');
  const [editTenantMessage, setEditTenantMessage] = useState('');
  const [editTenantError, setEditTenantError] = useState('');
  const [editTenantSaving, setEditTenantSaving] = useState(false);
  const [resetAccessMessage, setResetAccessMessage] = useState('');
  const [resetAccessError, setResetAccessError] = useState('');
  const [resetAccessSaving, setResetAccessSaving] = useState(false);
  const [passwordRecoverySaving, setPasswordRecoverySaving] = useState(false);
  const [tenantForm, setTenantForm] = useState({
    displayName: '',
    slug: '',
    accessEmail: '',
    accessDisplayName: '',
    accessPassword: generateStrongTemporaryPassword(),
    brandingDisplayName: '',
    primaryColor: '#007de8',
    logoUrl: '',
    branchesText: '',
  });
  const [tenantLogoFile, setTenantLogoFile] = useState(null);
  const [tenantLogoPreview, setTenantLogoPreview] = useState('');
  const [platformForm, setPlatformForm] = useState({
    brandingDisplayName: 'NxIA-Lab',
    primaryColor: '#007de8',
    logoUrl: '/nxia-lab-logo.png',
  });
  const [platformLogoFile, setPlatformLogoFile] = useState(null);
  const [platformLogoPreview, setPlatformLogoPreview] = useState('');
  const [editTenantForm, setEditTenantForm] = useState({
    displayName: '',
    slug: '',
    ownerEmail: '',
    brandingDisplayName: '',
    primaryColor: '#007de8',
    logoUrl: '',
    status: 'active',
    branchesText: '',
  });
  const [editTenantLogoFile, setEditTenantLogoFile] = useState(null);
  const [editTenantLogoPreview, setEditTenantLogoPreview] = useState('');
  const [resetAccessForm, setResetAccessForm] = useState({
    email: '',
    displayName: '',
    password: '',
  });

  useEffect(() => {
    let active = true;

    setPersistence(auth, browserLocalPersistence).catch(() => {
      if (active) {
        setAuthError('No pudimos preparar la sesión persistente del admin.');
      }
    });

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!active) {
        return;
      }

      if (!user) {
        setProfile(null);
        setAuthError('');
        return;
      }

      try {
        const userProfile = await fetchUserProfileByUid(user.uid);
        if (!active) {
          return;
        }

        setProfile(userProfile);

        if (!userProfile || userProfile.role !== ROLES.SUPERADMIN || userProfile.active === false) {
          setAuthError('Esa cuenta no tiene permiso para entrar al panel global.');
          await signOut(auth);
          return;
        }

        setAuthError('');
      } catch (error) {
        if (!active) {
          return;
        }

        setProfile(null);
        setAuthError(error?.message || 'No pudimos verificar tu perfil de administrador.');
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeAllTenants(
      (items) => {
        setTenants(items);
        setTenantReady(true);
      },
      (error) => {
        setTenants([]);
        setTenantReady(true);
        setTenantError(error?.message || 'No pudimos leer las empresas.');
      },
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!currentUser || profile?.role !== ROLES.SUPERADMIN) {
      setPlatformReady(false);
      return undefined;
    }

    const unsubscribe = subscribePlatformSettings(
      (settings) => {
        setPlatformSettings(settings);
        setPlatformReady(true);
        setPlatformError('');
      },
      (error) => {
        setPlatformSettings(null);
        setPlatformReady(true);
        setPlatformError(error?.message || 'No pudimos leer la configuración del panel global.');
      },
    );

    return unsubscribe;
  }, [currentUser, profile?.role]);

  const orderedTenants = useMemo(
    () => [...tenants].sort((first, second) => String(first.slug || '').localeCompare(String(second.slug || ''), 'es')),
    [tenants],
  );

  const selectedTenant = useMemo(
    () => orderedTenants.find((tenant) => tenant.slug === selectedTenantSlug) || orderedTenants[0] || null,
    [orderedTenants, selectedTenantSlug],
  );
  const defaultPlatformBranding = {
    displayName: 'NxIA-Lab',
    primaryColor: '#007de8',
    logoUrl: '/nxia-lab-logo.png',
  };
  const platformBranding = {
    ...defaultPlatformBranding,
    ...(platformSettings?.branding || {}),
  };
  const shellAccentColor = platformSettingsOpen ? platformForm.primaryColor : platformBranding.primaryColor;
  const shellBrandLogoUrl = platformSettingsOpen
    ? platformLogoPreview || platformForm.logoUrl || defaultPlatformBranding.logoUrl
    : platformBranding.logoUrl;
  const shellBrandName = platformSettingsOpen
    ? platformForm.brandingDisplayName || defaultPlatformBranding.displayName
    : platformBranding.displayName;

  useEffect(() => {
    setActiveSection('resumen');
  }, [profile?.id]);

  useEffect(() => {
    if (!selectedTenantSlug && orderedTenants[0]?.slug) {
      setSelectedTenantSlug(orderedTenants[0].slug);
    }
  }, [orderedTenants, selectedTenantSlug]);

  useEffect(() => {
    const branding = platformSettings?.branding || {};
    setPlatformForm({
      brandingDisplayName: branding.displayName || defaultPlatformBranding.displayName,
      primaryColor: branding.primaryColor || defaultPlatformBranding.primaryColor,
      logoUrl: branding.logoUrl || defaultPlatformBranding.logoUrl,
    });
    setPlatformLogoFile(null);
    setPlatformLogoPreview(branding.logoUrl || defaultPlatformBranding.logoUrl);
  }, [platformSettings]);

  useEffect(() => {
    if (!selectedTenant) {
      return;
    }

    setEditTenantForm({
      displayName: selectedTenant.displayName || '',
      slug: selectedTenant.slug || '',
      ownerEmail: selectedTenant.ownerEmail || '',
      brandingDisplayName: selectedTenant.branding?.displayName || selectedTenant.branding?.name || selectedTenant.displayName || '',
      primaryColor: selectedTenant.branding?.primaryColor || '#007de8',
      logoUrl: selectedTenant.branding?.logoUrl || '',
      status: selectedTenant.status === 'paused' ? 'paused' : 'active',
      branchesText: Array.isArray(selectedTenant.branches)
        ? selectedTenant.branches.map((branch) => branch.name || branch.slug).filter(Boolean).join('\n')
        : '',
    });

    setResetAccessForm({
      email: selectedTenant.ownerEmail || '',
      displayName: selectedTenant.branding?.displayName || selectedTenant.branding?.name || selectedTenant.displayName || '',
      password: generateStrongTemporaryPassword(),
    });

    setEditTenantLogoFile(null);
    setEditTenantLogoPreview(selectedTenant.branding?.logoUrl || '');
  }, [selectedTenant]);

  useEffect(() => {
    if (!tenantLogoFile) {
      setTenantLogoPreview('');
      return undefined;
    }

    const previewUrl = URL.createObjectURL(tenantLogoFile);
    setTenantLogoPreview(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [tenantLogoFile]);

  useEffect(() => {
    if (!platformLogoFile) {
      return undefined;
    }

    const previewUrl = URL.createObjectURL(platformLogoFile);
    setPlatformLogoPreview(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [platformLogoFile]);

  useEffect(() => {
    if (!editTenantLogoFile) {
      return undefined;
    }

    const previewUrl = URL.createObjectURL(editTenantLogoFile);
    setEditTenantLogoPreview(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [editTenantLogoFile]);

  async function handleSignIn(event) {
    event.preventDefault();
    setAuthError('');
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error) {
      setAuthError(
        error?.code === 'auth/invalid-credential'
          ? 'Email o contraseña incorrectos.'
          : 'No pudimos iniciar sesión como administrador.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdatePlatformSettings(event) {
    event.preventDefault();
    setPlatformError('');
    setPlatformMessage('');
    setPlatformSaving(true);

    try {
      const logoUrl = platformLogoFile
        ? await uploadBrandLogoFile(platformLogoFile, 'panel-global')
        : platformForm.logoUrl;

      await updatePlatformSettings({
        branding: {
          displayName: platformForm.brandingDisplayName,
          primaryColor: platformForm.primaryColor,
          logoUrl,
        },
      });

      setPlatformForm((current) => ({
        ...current,
        logoUrl,
      }));
      setPlatformLogoFile(null);
      setPlatformLogoPreview(logoUrl);
      setPlatformMessage('Configuración del panel global actualizada.');
    } catch (error) {
      setPlatformError(error?.message || 'No pudimos actualizar la configuración del panel global.');
    } finally {
      setPlatformSaving(false);
    }
  }

  async function handleCreateTenant(event) {
    event.preventDefault();
    setTenantMessage('');
    setTenantError('');
    setTenantSaving(true);

    try {
      const branchList = tenantForm.branchesText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, index) => ({
          name: line,
          slug: line,
          sortOrder: index + 1,
        }));

      const result = await createTenantWithAccess({
        tenant: {
          displayName: tenantForm.displayName,
          slug: tenantForm.slug,
          branding: {
            displayName: tenantForm.brandingDisplayName || tenantForm.displayName,
            primaryColor: tenantForm.primaryColor,
            logoUrl: tenantLogoFile
              ? await uploadBrandLogoFile(
                  tenantLogoFile,
                  tenantForm.slug || tenantForm.accessEmail || tenantForm.displayName || 'empresa',
                )
              : tenantForm.logoUrl,
          },
          branches: branchList,
        },
        access: {
          email: tenantForm.accessEmail,
          password: tenantForm.accessPassword,
          displayName: tenantForm.accessDisplayName || tenantForm.brandingDisplayName || tenantForm.displayName,
        },
      });

      let emailMessage = ' Email de acceso enviado correctamente.';
      try {
        if (!currentUser) {
          throw new Error('No encontramos tu sesión para autorizar el envío del email.');
        }

        const token = await getIdToken(currentUser, true);
        await sendTenantAccessEmail({
          email: result.email,
          password: tenantForm.accessPassword,
          tenantName: tenantForm.brandingDisplayName || tenantForm.displayName || result.tenantId,
          portalUrl: window.location.origin,
          idToken: token,
        });
      } catch (emailError) {
        emailMessage = ` No pudimos enviar el email: ${emailError?.message || 'error desconocido'}.`;
      }

      setTenantMessage(
        `Empresa creada correctamente: ${result.tenantId}. Acceso temporal: ${result.email} / ${tenantForm.accessPassword}.${emailMessage}`,
      );
      setTenantForm({
        displayName: '',
        slug: '',
        accessEmail: '',
        accessDisplayName: '',
        accessPassword: generateStrongTemporaryPassword(),
        brandingDisplayName: '',
        primaryColor: '#007de8',
        logoUrl: '',
        branchesText: '',
      });
      setTenantLogoFile(null);
      setTenantLogoPreview('');
    } catch (createError) {
      setTenantError(createError?.message || 'No pudimos crear la empresa.');
    } finally {
      setTenantSaving(false);
    }
  }

  async function handleEditTenant(event) {
    event.preventDefault();
    setEditTenantError('');
    setEditTenantMessage('');
    setEditTenantSaving(true);

    try {
      if (!selectedTenant?.slug) {
        throw new Error('Elegí una empresa para editar.');
      }

      const branchList = editTenantForm.branchesText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, index) => ({
          name: line,
          slug: line,
          sortOrder: index + 1,
        }));

      await updateTenant(selectedTenant.slug, {
        displayName: editTenantForm.displayName,
        ownerEmail: editTenantForm.ownerEmail,
        status: editTenantForm.status,
        branding: {
          displayName: editTenantForm.brandingDisplayName || editTenantForm.displayName,
          primaryColor: editTenantForm.primaryColor,
          logoUrl: editTenantLogoFile
            ? await uploadBrandLogoFile(editTenantLogoFile, selectedTenant.slug)
            : editTenantForm.logoUrl,
        },
        branches: branchList,
      });

      setEditTenantMessage(`Empresa actualizada: ${selectedTenant.slug}`);
      setTenantMessage(`Empresa actualizada: ${selectedTenant.slug}`);
      setEditTenantLogoFile(null);
    } catch (editError) {
      setEditTenantError(editError?.message || 'No pudimos actualizar la empresa.');
    } finally {
      setEditTenantSaving(false);
    }
  }

  async function handleResetAccess(event) {
    event.preventDefault();
    setResetAccessError('');
    setResetAccessMessage('');
    setResetAccessSaving(true);

    try {
      if (!selectedTenant?.slug) {
        throw new Error('Elegí una empresa para resetear el acceso.');
      }

      if (!currentUser) {
        throw new Error('Necesitamos tu sesión activa para continuar.');
      }

      const token = await getIdToken(currentUser, true);
      const result = await resetTenantAccess({
        tenantId: selectedTenant.slug,
        access: {
          email: resetAccessForm.email,
          displayName: resetAccessForm.displayName || selectedTenant.displayName || selectedTenant.slug,
          password: resetAccessForm.password,
        },
        idToken: token,
      });

      setResetAccessMessage(`Acceso actualizado para ${result.email}. La contraseña temporal ya quedó lista.`);
      setTenantMessage(`Acceso de ${selectedTenant.slug} actualizado correctamente.`);
      setEditTenantForm((current) => ({
        ...current,
        ownerEmail: result.email,
      }));
    } catch (error) {
      setResetAccessError(error?.message || 'No pudimos resetear el acceso.');
    } finally {
      setResetAccessSaving(false);
    }
  }

  async function handleSendPasswordRecovery() {
    setResetAccessError('');
    setResetAccessMessage('');
    setPasswordRecoverySaving(true);

    try {
      const email = String(resetAccessForm.email || '').trim().toLowerCase();
      if (!email) {
        throw new Error('Completá el email de acceso para enviar la recuperación.');
      }

      await sendPasswordResetEmail(auth, email, {
        url: window.location.origin,
        handleCodeInApp: false,
      });

      setResetAccessMessage(`Enviamos un email de recuperación a ${email}. Después de cambiar la clave, ingresá desde ${window.location.origin}.`);
    } catch (error) {
      setResetAccessError(error?.message || 'No pudimos enviar el email de recuperación.');
    } finally {
      setPasswordRecoverySaving(false);
    }
  }

  async function handleToggleTenantStatus(tenant) {
    if (!tenant?.slug) {
      return;
    }

    setTenantError('');
    setTenantMessage('');

    try {
      await updateTenant(tenant.slug, {
        displayName: tenant.displayName || tenant.slug,
        ownerEmail: tenant.ownerEmail || '',
        status: tenant.status === 'active' ? 'paused' : 'active',
        branding: tenant.branding || {},
        branches: Array.isArray(tenant.branches) ? tenant.branches : [],
      });

      setTenantMessage(`Empresa ${tenant.slug} actualizada a ${tenant.status === 'active' ? 'pausada' : 'activa'}.`);
    } catch (error) {
      setTenantError(error?.message || 'No pudimos cambiar la situación de la empresa.');
    }
  }

  function openTenant(slug) {
    navigate(`/tenant/${slug}`);
  }

  if (!authReady) {
    return (
      <Shell
        accentColor={shellAccentColor}
        eyebrow="Panel global"
        title="Cargando administración..."
        description="Preparando el acceso de superadmin."
        brandLogoUrl={shellBrandLogoUrl}
        brandName={shellBrandName}
      >
        <Card>
          <LoadingDots label="Verificando sesión" />
        </Card>
      </Shell>
    );
  }

  if (!currentUser || !profile || profile.role !== ROLES.SUPERADMIN) {
    return (
      <Shell
        accentColor={shellAccentColor}
        eyebrow="Panel global"
        title="Acceso administrativo"
        description="Entrá con la cuenta habilitada para crear empresas."
        brandLogoUrl={shellBrandLogoUrl}
        brandName={shellBrandName}
      >
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <Card>
            <div className="rounded-[22px] border border-[var(--border-soft)] bg-[linear-gradient(135deg,var(--panel-muted),var(--panel))] p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Ingreso</p>
                  <h2 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">Entrar como superadmin</h2>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
                    Usá la cuenta global para administrar empresas, imagen de marca, sucursales y accesos desde una sola vista.
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--panel)] px-4 py-3 text-left">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Acceso global</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">Solo cuentas superadmin.</p>
                </div>
              </div>

              <form className="mt-6 space-y-4" onSubmit={handleSignIn}>
                <label className="block space-y-2">
                  <span className="text-sm text-[var(--text-secondary)]">Email</span>
                  <input
                    className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="nxialab@gmail.com"
                    type="email"
                    value={email}
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm text-[var(--text-secondary)]">Contraseña</span>
                  <input
                    className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Tu contraseña"
                    type="password"
                    value={password}
                  />
                </label>

                {authError ? (
                  <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-600">
                    {authError}
                  </div>
                ) : null}

                <button
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-blue)] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_color-mix(in_srgb,var(--accent-strong)_26%,transparent)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={loading}
                  type="submit"
                >
                  {loading ? 'Ingresando...' : 'Entrar al panel'}
                </button>
              </form>
            </div>
          </Card>

          <Card>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Qué podés hacer</p>
            <div className="mt-4 grid gap-3">
              <div className="rounded-[20px] border border-[var(--border-soft)] bg-[var(--panel)] p-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Crear nuevas empresas</p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">Armá clientes separados con su imagen de marca, dueño y sucursales iniciales.</p>
              </div>
              <div className="rounded-[20px] border border-[var(--border-soft)] bg-[var(--panel)] p-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Visión global</p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">Abrí cada empresa, revisá su situación y entrá a su espacio operativo.</p>
              </div>
              <div className="rounded-[20px] border border-[var(--border-soft)] bg-[var(--panel)] p-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Control total</p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">Vos mantenés la vista completa de la plataforma sin mezclar bases.</p>
              </div>
            </div>
          </Card>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      accentColor={shellAccentColor}
      eyebrow="Panel global"
      title="Administración de empresas"
      description="Desde acá creás clientes nuevos y mantenés la visión completa de la plataforma."
      topLabel="Portal de empresas"
      topSubtitle="Panel global"
      brandLogoUrl={shellBrandLogoUrl}
      brandName={shellBrandName}
      actions={
        <>
          <button
            aria-expanded={platformSettingsOpen}
            aria-label="Abrir configuración del panel global"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--panel)] text-lg font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent-strong)] hover:text-[var(--accent-strong)]"
            onClick={() => setPlatformSettingsOpen((current) => !current)}
            title="Configurar logo y colores"
            type="button"
          >
            <span aria-hidden="true">⚙</span>
          </button>
          <button
            className="inline-flex items-center rounded-full border border-[var(--border-soft)] bg-[var(--panel)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--accent-strong)] hover:text-[var(--accent-strong)]"
            onClick={() => signOut(auth)}
            type="button"
          >
            Cerrar sesión
          </button>
        </>
      }
      >
      {platformSettingsOpen ? (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Configuración</p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">Cambiá el logo, nombre y color principal del panel global.</p>
            </div>
            <button
              className="rounded-full border border-[var(--border-soft)] bg-[var(--panel)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent-strong)] hover:text-[var(--accent-strong)]"
              onClick={() => setPlatformSettingsOpen(false)}
              type="button"
            >
              Cerrar
            </button>
          </div>

          {platformError ? (
            <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-600">
              {platformError}
            </div>
          ) : null}

          {platformMessage ? (
            <div className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-600">
              {platformMessage}
            </div>
          ) : null}

          <form className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_auto]" onSubmit={handleUpdatePlatformSettings}>
            <label className="space-y-2">
              <span className="text-sm text-[var(--text-secondary)]">Color principal</span>
              <div className="flex gap-3">
                <input
                  className="h-12 w-16 rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] p-1"
                  onChange={(event) => setPlatformForm((current) => ({ ...current, primaryColor: event.target.value }))}
                  type="color"
                  value={platformForm.primaryColor}
                />
                <input
                  className="min-w-0 flex-1 rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                  onChange={(event) => setPlatformForm((current) => ({ ...current, primaryColor: event.target.value }))}
                  type="text"
                  value={platformForm.primaryColor}
                />
              </div>
            </label>

            <label className="space-y-2">
              <span className="text-sm text-[var(--text-secondary)]">Logo</span>
              <input
                className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition file:mr-4 file:rounded-full file:border-0 file:bg-[var(--accent-soft)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[var(--accent-strong)] focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                accept="image/*"
                onChange={(event) => setPlatformLogoFile(event.target.files?.[0] || null)}
                type="file"
              />
            </label>

            <div className="flex items-end gap-3">
              <img
                alt="Vista previa"
                className="h-12 w-12 rounded-2xl border border-[var(--border-soft)] bg-[var(--panel)] object-contain p-1"
                src={platformLogoPreview || platformForm.logoUrl || defaultPlatformBranding.logoUrl}
              />
              <button
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-blue)] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_color-mix(in_srgb,var(--accent-strong)_26%,transparent)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={platformSaving}
                type="submit"
              >
                {platformSaving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <Card>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Secciones</p>
            <div className="mt-4 space-y-2">
              {[
                { id: 'resumen', label: 'Resumen', hint: 'Vista general' },
                { id: 'crear', label: 'Crear empresa', hint: 'Nuevo cliente' },
                { id: 'empresas', label: 'Empresas', hint: 'Listado global' },
                { id: 'editar', label: 'Editar empresa', hint: 'Ajustes y sucursales' },
                { id: 'cuenta', label: 'Cuenta', hint: 'Acceso actual' },
              ].map((section) => {
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
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Control global</p>
            <div className="mt-4 space-y-3 text-sm text-[var(--text-secondary)]">
              <p>Empresas: {orderedTenants.length}</p>
              <p>Activas: {orderedTenants.filter((tenant) => tenant.status === 'active').length}</p>
              <p>Tu perfil: {profile?.displayName || 'Superadmin'}</p>
            </div>
          </Card>
        </aside>

        <main className="space-y-6">
          {activeSection === 'resumen' ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <MetricCard
                  helper="Cantidad total de clientes dentro de la plataforma."
                  label="Empresas"
                  value={String(orderedTenants.length)}
                />
                <MetricCard
                  helper="Clientes que hoy están habilitados para operar."
                  label="Activas"
                  value={String(orderedTenants.filter((tenant) => tenant.status === 'active').length)}
                />
                <MetricCard
                  helper="Tu sesión global actual."
                  label="Cuenta"
                  value={profile?.displayName || 'Superadmin'}
                />
              </div>

              <Card>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Centro de plataforma</p>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">Creá y administrá clientes desde un solo lugar.</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                  Cada empresa queda aislada y con su propia imagen de marca, sucursales y acceso operativo.
                </p>
              </Card>
            </>
          ) : null}

          {activeSection === 'crear' ? (
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Crear empresa</p>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    Armá un cliente nuevo con imagen de marca, dueño y sucursales iniciales en un solo paso.
                  </p>
                </div>
                <div className="rounded-[18px] border border-[var(--accent-strong)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--accent-strong)]">
                  Todo queda aislado por empresa.
                </div>
              </div>

              {tenantError ? (
                <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-600">
                  {tenantError}
                </div>
              ) : null}

              {tenantMessage ? (
                <div className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-600">
                  {tenantMessage}
                </div>
              ) : null}

              <form className="mt-4 space-y-4" onSubmit={handleCreateTenant}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm text-[var(--text-secondary)]">Nombre visible</span>
                    <input
                      className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                      onChange={(event) => setTenantForm((current) => ({ ...current, displayName: event.target.value }))}
                      placeholder="Demo Empresa"
                      type="text"
                      value={tenantForm.displayName}
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm text-[var(--text-secondary)]">Alias de la empresa</span>
                    <input
                      className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                      onChange={(event) => setTenantForm((current) => ({ ...current, slug: event.target.value }))}
                      placeholder="demo"
                      type="text"
                      value={tenantForm.slug}
                    />
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm text-[var(--text-secondary)]">Email de acceso</span>
                    <input
                      className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                      onChange={(event) => setTenantForm((current) => ({ ...current, accessEmail: event.target.value }))}
                      placeholder="admin@empresa.com"
                      type="email"
                      value={tenantForm.accessEmail}
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm text-[var(--text-secondary)]">Nombre del acceso</span>
                    <input
                      className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                      onChange={(event) => setTenantForm((current) => ({ ...current, accessDisplayName: event.target.value }))}
                      placeholder="Admin Demo"
                      type="text"
                      value={tenantForm.accessDisplayName}
                    />
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm text-[var(--text-secondary)]">Contraseña temporal</span>
                    <div className="flex flex-wrap gap-2">
                      <input
                        className="min-w-0 flex-1 rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                        readOnly
                        value={tenantForm.accessPassword}
                      />
                      <button
                        className="rounded-full border border-[var(--border-soft)] bg-[var(--panel)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent-strong)] hover:text-[var(--accent-strong)]"
                        onClick={() => setTenantForm((current) => ({ ...current, accessPassword: generateStrongTemporaryPassword() }))}
                        type="button"
                      >
                        Generar
                      </button>
                    </div>
                    <p className="text-xs leading-5 text-[var(--text-secondary)]">
                      Presioná generar para crear una clave temporal segura. Después del primer ingreso, esta cuenta va a pedir cambio de contraseña.
                    </p>
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm text-[var(--text-secondary)]">Nombre de la marca</span>
                    <input
                      className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                      onChange={(event) => setTenantForm((current) => ({ ...current, brandingDisplayName: event.target.value }))}
                      placeholder="Demo Empresa"
                      type="text"
                      value={tenantForm.brandingDisplayName}
                    />
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm text-[var(--text-secondary)]">Color principal</span>
                    <div className="flex gap-3">
                      <input
                        className="h-12 w-16 rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] p-1"
                        onChange={(event) => setTenantForm((current) => ({ ...current, primaryColor: event.target.value }))}
                        type="color"
                        value={tenantForm.primaryColor}
                      />
                      <input
                        className="min-w-0 flex-1 rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                        onChange={(event) => setTenantForm((current) => ({ ...current, primaryColor: event.target.value }))}
                        type="text"
                        value={tenantForm.primaryColor}
                      />
                    </div>
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm text-[var(--text-secondary)]">Logo de la empresa</span>
                    <input
                      className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition file:mr-4 file:rounded-full file:border-0 file:bg-[var(--accent-soft)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[var(--accent-strong)] focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                      accept="image/*"
                      onChange={(event) => setTenantLogoFile(event.target.files?.[0] || null)}
                      type="file"
                    />
                    <div className="rounded-2xl border border-dashed border-[var(--border-soft)] bg-[var(--panel)] p-3">
                      {tenantLogoPreview ? (
                        <img alt="Vista previa del logo" className="h-28 w-full rounded-xl object-contain" src={tenantLogoPreview} />
                      ) : (
                        <p className="text-sm text-[var(--text-secondary)]">Todavía no cargaste un logo.</p>
                      )}
                    </div>
                  </label>
                </div>

                <label className="block space-y-2">
                  <span className="text-sm text-[var(--text-secondary)]">Sucursales iniciales</span>
                  <textarea
                    className="min-h-[120px] w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                    onChange={(event) => setTenantForm((current) => ({ ...current, branchesText: event.target.value }))}
                    placeholder={'Sucursal Central\nSucursal Norte'}
                    value={tenantForm.branchesText}
                  />
                </label>

                <button
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-blue)] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_color-mix(in_srgb,var(--accent-strong)_26%,transparent)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={tenantSaving}
                  type="submit"
                >
                  {tenantSaving ? 'Creando empresa...' : 'Crear empresa'}
                </button>
              </form>
            </Card>
          ) : null}

          {activeSection === 'empresas' ? (
            <Card>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Empresas creadas</p>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">Todos los clientes quedan aislados y cada uno abre su propio espacio.</p>
                </div>
                <div className="rounded-full border border-[var(--border-soft)] bg-[var(--panel)] px-4 py-2 text-sm text-[var(--text-secondary)]">
                  {tenantReady ? 'Actualizado' : 'Cargando...'}
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {!tenantReady ? (
                  <LoadingDots label="Cargando empresas" />
                ) : orderedTenants.length > 0 ? (
                  orderedTenants.map((tenant) => (
                    <TenantCard
                      key={tenant.id}
                      onEdit={(selected) => {
                        setSelectedTenantSlug(selected.slug);
                        setActiveSection('editar');
                      }}
                      onOpen={openTenant}
                      onResetAccess={(selected) => {
                        setSelectedTenantSlug(selected.slug);
                        setActiveSection('editar');
                      }}
                      onToggleStatus={handleToggleTenantStatus}
                      tenant={tenant}
                    />
                  ))
                ) : (
                  <p className="text-sm text-[var(--text-secondary)]">Todavía no hay empresas creadas.</p>
                )}
              </div>
            </Card>
          ) : null}

          {activeSection === 'editar' ? (
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Editar empresa</p>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    Ajustá datos visibles, marca, estado y sucursales de una empresa existente.
                  </p>
                </div>
                <div className="rounded-[18px] border border-[var(--accent-strong)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--accent-strong)]">
                  {selectedTenant?.slug || 'Sin selección'}
                </div>
              </div>

              {editTenantError ? (
                <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-600">
                  {editTenantError}
                </div>
              ) : null}

              {editTenantMessage ? (
                <div className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-600">
                  {editTenantMessage}
                </div>
              ) : null}

              <form className="mt-4 space-y-4" onSubmit={handleEditTenant}>
                <label className="block space-y-2">
                  <span className="text-sm text-[var(--text-secondary)]">Empresa seleccionada</span>
                  <select
                    className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                    onChange={(event) => setSelectedTenantSlug(event.target.value)}
                    value={selectedTenantSlug}
                  >
                    {orderedTenants.length > 0 ? (
                      orderedTenants.map((tenant) => (
                        <option key={tenant.slug} value={tenant.slug}>
                          {tenant.displayName || tenant.slug}
                        </option>
                      ))
                    ) : (
                      <option value="">Sin empresas</option>
                    )}
                  </select>
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm text-[var(--text-secondary)]">Nombre visible</span>
                    <input
                      className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                      onChange={(event) => setEditTenantForm((current) => ({ ...current, displayName: event.target.value }))}
                      value={editTenantForm.displayName}
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm text-[var(--text-secondary)]">Alias interno</span>
                    <input
                      className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] opacity-80 outline-none transition"
                      readOnly
                      value={editTenantForm.slug}
                    />
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm text-[var(--text-secondary)]">Email dueño</span>
                    <input
                      className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                      onChange={(event) => setEditTenantForm((current) => ({ ...current, ownerEmail: event.target.value }))}
                      type="email"
                      value={editTenantForm.ownerEmail}
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm text-[var(--text-secondary)]">Estado</span>
                    <select
                      className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                      onChange={(event) => setEditTenantForm((current) => ({ ...current, status: event.target.value }))}
                      value={editTenantForm.status}
                    >
                      <option value="active">Activa</option>
                      <option value="paused">Pausada</option>
                    </select>
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm text-[var(--text-secondary)]">Nombre de la marca</span>
                    <input
                      className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                      onChange={(event) => setEditTenantForm((current) => ({ ...current, brandingDisplayName: event.target.value }))}
                      value={editTenantForm.brandingDisplayName}
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm text-[var(--text-secondary)]">Color principal</span>
                    <div className="flex gap-3">
                      <input
                        className="h-12 w-16 rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] p-1"
                        onChange={(event) => setEditTenantForm((current) => ({ ...current, primaryColor: event.target.value }))}
                        type="color"
                        value={editTenantForm.primaryColor}
                      />
                      <input
                        className="min-w-0 flex-1 rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                        onChange={(event) => setEditTenantForm((current) => ({ ...current, primaryColor: event.target.value }))}
                        type="text"
                        value={editTenantForm.primaryColor}
                      />
                    </div>
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm text-[var(--text-secondary)]">Logo de la empresa</span>
                    <input
                      className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition file:mr-4 file:rounded-full file:border-0 file:bg-[var(--accent-soft)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[var(--accent-strong)] focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                      accept="image/*"
                      onChange={(event) => setEditTenantLogoFile(event.target.files?.[0] || null)}
                      type="file"
                    />
                    <div className="rounded-2xl border border-dashed border-[var(--border-soft)] bg-[var(--panel)] p-3">
                      {editTenantLogoPreview ? (
                        <img alt="Vista previa del logo" className="h-28 w-full rounded-xl object-contain" src={editTenantLogoPreview} />
                      ) : (
                        <p className="text-sm text-[var(--text-secondary)]">Todavía no cargaste un logo.</p>
                      )}
                    </div>
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm text-[var(--text-secondary)]">Sucursales</span>
                    <textarea
                      className="min-h-[120px] w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                      onChange={(event) => setEditTenantForm((current) => ({ ...current, branchesText: event.target.value }))}
                      value={editTenantForm.branchesText}
                    />
                  </label>
                </div>

                <button
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-blue)] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_color-mix(in_srgb,var(--accent-strong)_26%,transparent)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={editTenantSaving}
                  type="submit"
                >
                  {editTenantSaving ? 'Guardando cambios...' : 'Guardar cambios'}
                </button>
              </form>

              <div className="mt-6 rounded-[22px] border border-[var(--border-soft)] bg-[var(--panel-muted)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Resetear acceso</p>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                      Reemplazá el acceso actual de esta empresa por una cuenta nueva o reutilizá el mismo email con una contraseña temporal nueva.
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-[var(--border-soft)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                    El ingreso pedirá cambio de contraseña al primer uso.
                  </div>
                </div>

                {resetAccessError ? (
                  <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-600">
                    {resetAccessError}
                  </div>
                ) : null}

                {resetAccessMessage ? (
                  <div className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-600">
                    {resetAccessMessage}
                  </div>
                ) : null}

                <form className="mt-4 space-y-4" onSubmit={handleResetAccess}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm text-[var(--text-secondary)]">Email de acceso</span>
                      <input
                        className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                        onChange={(event) => setResetAccessForm((current) => ({ ...current, email: event.target.value }))}
                        placeholder="admin@empresa.com"
                        type="email"
                        value={resetAccessForm.email}
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm text-[var(--text-secondary)]">Nombre del acceso</span>
                      <input
                        className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                        onChange={(event) => setResetAccessForm((current) => ({ ...current, displayName: event.target.value }))}
                        placeholder="Admin Demo"
                        type="text"
                        value={resetAccessForm.displayName}
                      />
                    </label>
                  </div>

                  <label className="space-y-2 block">
                    <span className="text-sm text-[var(--text-secondary)]">Contraseña temporal</span>
                    <div className="flex flex-wrap gap-2">
                      <input
                        className="min-w-0 flex-1 rounded-2xl border border-[var(--border-soft)] bg-[var(--panel)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                        readOnly
                        value={resetAccessForm.password}
                      />
                      <button
                        className="rounded-full border border-[var(--border-soft)] bg-[var(--panel)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent-strong)] hover:text-[var(--accent-strong)]"
                        onClick={() => setResetAccessForm((current) => ({ ...current, password: generateStrongTemporaryPassword() }))}
                        type="button"
                      >
                        Generar
                      </button>
                    </div>
                    <p className="text-xs leading-5 text-[var(--text-secondary)]">
                      Presioná generar para crear una clave temporal segura y después Resetear acceso para aplicarla. En local, si no usás vercel dev, usá el email de recuperación.
                    </p>
                  </label>

                  <div className="flex flex-wrap gap-2">
                    <button
                      className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-blue)] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_color-mix(in_srgb,var(--accent-strong)_26%,transparent)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={resetAccessSaving}
                      type="submit"
                    >
                      {resetAccessSaving ? 'Reseteando acceso...' : 'Resetear acceso'}
                    </button>
                    <button
                      className="inline-flex items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--panel)] px-6 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent-strong)] hover:text-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={passwordRecoverySaving}
                      onClick={handleSendPasswordRecovery}
                      type="button"
                    >
                      {passwordRecoverySaving ? 'Enviando...' : 'Enviar email de recuperación'}
                    </button>
                  </div>
                </form>
              </div>
            </Card>
          ) : null}

          {activeSection === 'cuenta' ? (
            <Card>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Tu acceso</p>
              <div className="mt-4 space-y-3 text-sm text-[var(--text-secondary)]">
                <p>Email: {currentUser.email}</p>
                <p>Tipo de acceso: {getRoleLabel(profile?.role)}</p>
                <p>Nombre mostrado: {profile?.displayName || 'Sin nombre'}</p>
              </div>
            </Card>
          ) : null}
        </main>
      </div>
    </Shell>
  );
}

