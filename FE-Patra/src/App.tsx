import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ToastProvider } from '@/components/ui/Toast';
import SatpolLayout from '@/components/layout/SatpolLayout';
import DinasLayout from '@/components/layout/DinasLayout';
import LoginPage from '@/pages/feat-login/LoginPage';
import CctvListPage from '@/pages/feat-cctv/CctvListPage';
import CctvLivePage from '@/pages/feat-cctv/CctvLivePage';
import RegionalMapPage from '@/pages/feat-maps/RegionalMapPage';
import ReportsListPage from '@/pages/feat-reports/ReportsListPage';
import ReportDetailPage from '@/pages/feat-reports/ReportDetailPage';
import DinasDashboardPage from '@/pages/feat-dinas-dashboard/DinasDashboardPage';
import ValidationListPage from '@/pages/feat-validation/ValidationListPage';
import ValidationSplitPage from '@/pages/feat-validation/ValidationSplitPage';
import RelocationSitesPage from '@/pages/feat-relocation/RelocationSitesPage';
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

              {/* Portal Dinas UMKM (Region-Locked — Hanya 3 Menu Inti) */}
              <Route
                path="/dinas"
                element={
                  <RequireRole role="DINAS_UMKM">
                    <DinasLayout />
                  </RequireRole>
                }
              >
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<DinasDashboardPage />} />
                <Route path="validasi" element={<ValidationListPage />} />
                <Route path="validasi/:reportId" element={<ValidationSplitPage />} />
                <Route path="lokasi-binaan" element={<RelocationSitesPage />} />
              </Route>

              <Route path="*" element={<RootRedirect />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
