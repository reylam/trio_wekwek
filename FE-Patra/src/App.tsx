import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';
import { Building2, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ToastProvider } from '@/components/ui/Toast';
import SatpolLayout from '@/components/layout/SatpolLayout';
import LoginPage from '@/pages/feat-login/LoginPage';
import CctvListPage from '@/pages/feat-cctv/CctvListPage';
import CctvLivePage from '@/pages/feat-cctv/CctvLivePage';
import RegionalMapPage from '@/pages/feat-maps/RegionalMapPage';
import ReportsListPage from '@/pages/feat-reports/ReportsListPage';
import ReportDetailPage from '@/pages/feat-reports/ReportDetailPage';
import type { UserRole } from '@/types';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <div className="flex items-center gap-3 rounded-2xl border border-accent/60 bg-white px-5 py-3.5 text-sm font-semibold text-primary shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Memuat sesi PATRA...</span>
      </div>
    </div>
  );
}

function RequireRole({
  role,
  children,
}: {
  role: UserRole;
  children: JSX.Element;
}) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) {
    return (
      <Navigate
        to={user.role === 'SATPOL_PP' ? '/satpol/cctv' : '/dinas/dashboard'}
        replace
      />
    );
  }
  return children;
}

function GuestOnly({ children }: { children: JSX.Element }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullPageLoader />;
  if (user) {
    return (
      <Navigate
        to={user.role === 'SATPOL_PP' ? '/satpol/cctv' : '/dinas/dashboard'}
        replace
      />
    );
  }
  return children;
}

function RootRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <Navigate
      to={user.role === 'SATPOL_PP' ? '/satpol/cctv' : '/dinas/dashboard'}
      replace
    />
  );
}

// Placeholder bersih untuk Portal Dinas UMKM sampai T2-06 dikerjakan
function DinasPortalPlaceholder() {
  const { user, logout } = useAuth();
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-lg rounded-3xl border border-accent/60 bg-white p-8 shadow-sm">
        <div className="inline-flex items-center gap-2 rounded-full bg-[#E9F1FD] px-3 py-1 text-xs font-bold text-primary">
          <Building2 className="h-4 w-4" />
          <span>{user?.region.umkmAgencyName}</span>
        </div>
        <h1 className="mt-4 text-2xl font-extrabold text-primary">
          Portal Dinas UMKM (Tahap T2-06)
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Anda masuk sebagai <strong>{user?.fullName}</strong> (terkunci pada{' '}
          <strong>{user?.region.city}</strong>). Saat ini antarmuka Portal Satpol PP sesuai
          desain <code>docs/pages</code> telah siap digunakan; antarmuka 3 menu Dinas UMKM akan
          dibangun pada tahap berikutnya.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-white hover:bg-primary/90"
          >
            <LogOut className="h-4 w-4" />
            <span>Kembali ke Login / Ganti Akun Satpol PP</span>
          </button>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <ShieldCheck className="h-4 w-4 text-secondary" />
            Region-Locked Aktif
          </span>
        </div>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<RootRedirect />} />
              <Route
                path="/login"
                element={
                  <GuestOnly>
                    <LoginPage />
                  </GuestOnly>
                }
              />

              {/* Portal Satpol PP (Region-Locked — Hanya 3 Menu Inti) */}
              <Route
                path="/satpol"
                element={
                  <RequireRole role="SATPOL_PP">
                    <SatpolLayout />
                  </RequireRole>
                }
              >
                <Route index element={<Navigate to="cctv" replace />} />
                <Route path="cctv" element={<CctvListPage />} />
                <Route path="cctv/:cameraId" element={<CctvLivePage />} />
                <Route path="peta" element={<RegionalMapPage />} />
                <Route path="laporan" element={<ReportsListPage />} />
                <Route path="laporan/:reportId" element={<ReportDetailPage />} />
              </Route>

              {/* Portal Dinas UMKM (Placeholder sampai T2-06) */}
              <Route
                path="/dinas/*"
                element={
                  <RequireRole role="DINAS_UMKM">
                    <DinasPortalPlaceholder />
                  </RequireRole>
                }
              />

              <Route path="*" element={<RootRedirect />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
