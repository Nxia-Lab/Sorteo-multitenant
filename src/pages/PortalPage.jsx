import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import Card from '../components/Card';
import LoadingDots from '../components/LoadingDots';
import Shell from '../components/Shell';
import { auth } from '../lib/firebase';
import { getAuthSessionSnapshot, subscribeAuthSession } from '../lib/authSession';
import { fetchUserProfileByEmail, fetchUserProfileByUid, resolvePortalRoute, resolveTenantId } from '../lib/portal';
import { getRoleLabel, ROLES } from '../lib/tenantModel';

function FeatureItem({ title, text }) {
  return (
    <div className="rounded-[22px] border border-[var(--border-soft)] bg-[var(--panel-muted)] p-4">
      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{text}</p>
    </div>
  );
}

async function resolveProfileForAccount(user) {
  if (!user) {
    return null;
  }

  const directProfile = await fetchUserProfileByUid(user.uid);
  const fallbackProfile = await fetchUserProfileByEmail(user.email);
  return directProfile?.tenantId ? directProfile : fallbackProfile || directProfile;
}

export default function PortalPage() {
  const navigate = useNavigate();
  const { authUser, authReady } = useSyncExternalStore(
    subscribeAuthSession,
    getAuthSessionSnapshot,
    getAuthSessionSnapshot,
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileReady, setProfileReady] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [error, setError] = useState('');
  const currentUser = authUser || auth.currentUser;

  useEffect(() => {
    let active = true;

    async function resolveCurrentProfile() {
      if (!currentUser) {
        setProfile(null);
        setProfileReady(false);
        setProfileError('');
        return;
      }

      setProfileReady(false);

      try {
        const resolvedProfile = await resolveProfileForAccount(currentUser);
        if (!active) {
          return;
        }

        if (!resolvedProfile) {
          setProfile(null);
          setProfileReady(true);
          setProfileError(
            `Todavía no existe un perfil para esta cuenta en Firestore. El documento debe llamarse exactamente ${currentUser.uid}.`,
          );
          return;
        }

        const tenantId = resolveTenantId(resolvedProfile, currentUser.email);
        setProfile(resolvedProfile);
        setProfileReady(true);

        if (!tenantId && resolvedProfile.role !== ROLES.SUPERADMIN) {
          setProfileError('Tu cuenta no tiene una empresa asignada todavía.');
          return;
        }

        setProfileError('');

        const target = resolvePortalRoute({
          ...resolvedProfile,
          tenantId,
        });

        if (target !== '/') {
          navigate(target, { replace: true });
        }
      } catch {
        if (!active) {
          return;
        }

        setProfile(null);
        setProfileReady(true);
        setProfileError('No pudimos resolver tu perfil desde Firestore.');
      }
    }

    resolveCurrentProfile();

    return () => {
      active = false;
    };
  }, [currentUser, navigate]);

  const portalFeatures = useMemo(
    () => [
      {
        title: 'Acceso simple',
        text: 'Cada usuario entra con su cuenta y la plataforma lo lleva a su espacio correcto.',
      },
      {
        title: 'Datos separados',
        text: 'Cada empresa tendrá sus propios sorteos, sucursales, clientes y usuarios.',
      },
      {
        title: 'Control total',
        text: 'Vos podés administrar altas, permisos y situación general sin perder visibilidad global.',
      },
    ],
    [],
  );

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const credentials = await signInWithEmailAndPassword(auth, email.trim(), password);
      const signedInUser = credentials.user || auth.currentUser;
      const resolvedProfile = await resolveProfileForAccount(signedInUser);

      if (!resolvedProfile) {
        setError(
          `Iniciaste sesión, pero todavía no existe un perfil para esta cuenta en Firestore. El documento esperado es ${signedInUser?.uid || 'desconocido'}.`,
        );
        return;
      }

      if (resolvedProfile.active === false) {
        setError('Tu cuenta está deshabilitada. Contactá al superadmin.');
        await signOut(auth);
        return;
      }

      const tenantId = resolveTenantId(resolvedProfile, signedInUser?.email);
      if (!tenantId && resolvedProfile.role !== ROLES.SUPERADMIN) {
        setError('Tu cuenta no tiene una empresa asignada todavía.');
        return;
      }

      setProfile(resolvedProfile);
      setProfileReady(true);
      navigate(
        resolvePortalRoute({
          ...resolvedProfile,
          tenantId,
        }),
        { replace: true },
      );
    } catch (authError) {
      setError(
        authError?.code === 'auth/invalid-credential'
          ? 'Email o contraseña incorrectos.'
          : 'No pudimos iniciar sesión. Revisá tus credenciales.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell
      brandLogoUrl="/nxia-lab-logo.png"
      brandName="NxIA-Lab"
      eyebrow="Portal central"
      title="Entrá a tu empresa"
      description="Usá tu cuenta autorizada y el sistema te lleva directo al espacio correcto."
      topLabel="Portal de clientes"
      topSubtitle="Entrada única"
    >
      {!authReady ? (
        <Card>
          <LoadingDots label="Preparando el portal" />
        </Card>
      ) : currentUser && !profileReady ? (
        <Card>
          <LoadingDots label="Identificando tu empresa" />
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <div className="space-y-6">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Ingreso</p>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">Entrar a la plataforma</h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
                  Usá tu usuario para entrar al espacio correcto. Si tu cuenta pertenece a una empresa, la plataforma te redirige automáticamente.
                </p>
              </div>

              <form className="space-y-4" onSubmit={handleSubmit}>
                <label className="block space-y-2">
                  <span className="text-sm text-[var(--text-secondary)]">Email</span>
                  <input
                    className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-muted)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="nombre@empresa.com"
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

                {profileError ? (
                  <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-600">
                    {profileError}
                  </div>
                ) : null}

                {error ? (
                  <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-600">
                    {error}
                  </div>
                ) : null}

                <button
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-strong)] px-6 py-3 text-sm font-semibold text-white transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={loading}
                  type="submit"
                >
                  {loading ? 'Ingresando...' : 'Entrar'}
                </button>
              </form>
            </div>
          </Card>

          <div className="space-y-6">
            <Card>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Cómo funciona</p>
              <div className="mt-4 space-y-3">
                {portalFeatures.map((feature) => (
                  <FeatureItem key={feature.title} title={feature.title} text={feature.text} />
                ))}
              </div>
            </Card>

            <Card>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Resumen de acceso</p>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                {currentUser
                  ? profile
                    ? `Sesión activa para ${currentUser.email}.`
                    : 'Sesión activa, esperando la información de tu empresa.'
                  : 'Aún no iniciaste sesión.'}
              </p>
              {currentUser && profile ? (
                <div className="mt-4 rounded-[22px] border border-[var(--border-soft)] bg-[var(--panel-muted)] p-4 text-sm text-[var(--text-secondary)]">
                  <p className="font-semibold text-[var(--text-primary)]">Cuenta resuelta</p>
                  <p className="mt-2">UID: {profile.id || currentUser.uid}</p>
                  <p>Email: {profile.email || currentUser.email}</p>
                  <p>Tipo de acceso: {getRoleLabel(profile.role)}</p>
                  <p>Empresa: {resolveTenantId(profile, currentUser.email) || 'Sin empresa'}</p>
                  <p>Destino: {resolvePortalRoute({ ...profile, tenantId: resolveTenantId(profile, currentUser.email) })}</p>
                </div>
              ) : null}
              <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
                Más adelante este portal podrá mostrarte la empresa, las sucursales y los accesos disponibles antes de entrar al panel.
              </p>
            </Card>
          </div>
        </div>
      )}
    </Shell>
  );
}
