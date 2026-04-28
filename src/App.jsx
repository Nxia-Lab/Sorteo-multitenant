import { Component, lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

const PortalPage = lazy(() => import('./pages/PortalPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const TenantWorkspacePage = lazy(() => import('./pages/TenantWorkspacePage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] px-6 text-[var(--text-primary)]">
      <div className="rounded-[24px] border border-[var(--border-soft)] bg-[var(--panel)] px-6 py-5 text-center shadow-[var(--card-shadow)]">
        <p className="text-sm uppercase tracking-[0.28em] text-[var(--accent-strong)]">Cargando</p>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">Preparando la vista solicitada...</p>
      </div>
    </div>
  );
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] px-6 text-[var(--text-primary)]">
          <div className="max-w-2xl rounded-[24px] border border-rose-400/30 bg-rose-400/10 px-6 py-5 shadow-[var(--card-shadow)]">
            <p className="text-sm uppercase tracking-[0.28em] text-rose-500">Error de interfaz</p>
            <p className="mt-3 text-sm text-rose-500">
              Algo se rompió al mostrar la pantalla. Recargá la página y, si vuelve a pasar, avisame qué mensaje aparece acá.
            </p>
            <pre className="mt-4 overflow-auto rounded-2xl border border-rose-400/20 bg-[rgba(255,255,255,0.04)] p-4 text-xs text-rose-500">
              {this.state.error?.message || String(this.state.error)}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<PortalPage />} />
          <Route path="/registro/:tenantId/:branchSlug" element={<RegisterPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/tenant/:tenantId" element={<TenantWorkspacePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppErrorBoundary>
  );
}
