import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { ToastProvider } from '@/components/ui/Toast';
import { WalkthroughProvider } from '@/components/walkthrough/WalkthroughContext';
import type { UserRole } from '@/types';

const WalkthroughOverlay = lazy(
  () => import('@/components/walkthrough/WalkthroughOverlay'),
);

const PublicLayout = lazy(() => import('@/components/layout/PublicLayout'));
const PublicHomePage = lazy(() => import('@/pages/feat-public/PublicHomePage'));
const PublicGreenZonesPage = lazy(
  () => import('@/pages/feat-public/PublicGreenZonesPage'),
);
const PublicPklGuidePage = lazy(
  () => import('@/pages/feat-public/PublicPklGuidePage'),
);
const PublicAboutPage = lazy(
  () => import('@/pages/feat-public/PublicAboutPage'),
);
const LoginPage = lazy(() => import('@/pages/feat-login/LoginPage'));

const SatpolLayout = lazy(() => import('@/components/layout/SatpolLayout'));
const CctvListPage = lazy(() => import('@/pages/feat-cctv/CctvListPage'));
const CctvLivePage = lazy(() => import('@/pages/feat-cctv/CctvLivePage'));
const RegionalMapPage = lazy(() => import('@/pages/feat-maps/RegionalMapPage'));
const ReportsListPage = lazy(() => import('@/pages/feat-reports/ReportsListPage'));
const ReportDetailPage = lazy(() => import('@/pages/feat-reports/ReportDetailPage'));

const DinasLayout = lazy(() => import('@/components/layout/DinasLayout'));
const DinasDashboardPage = lazy(
  () => import('@/pages/feat-dinas-dashboard/DinasDashboardPage'),
);
const ValidationListPage = lazy(
  () => import('@/pages/feat-validation/ValidationListPage'),
);
const ValidationSplitPage = lazy(
  () => import('@/pages/feat-validation/ValidationSplitPage'),
);
const RelocationSitesPage = lazy(
  () => import('@/pages/feat-relocation/RelocationSitesPage'),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
      gcTime: 10 * 60_000,
    },
  },
});

function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <div className="flex items-center gap-3 rounded-2xl border border-accent/60 bg-white px-5 py-3.5 text-sm font-semibold text-primary shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Memuat halaman PATRA...</span>
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

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <ToastProvider>
              <WalkthroughProvider>
                <Suspense fallback={<FullPageLoader />}>
                  <Routes>
                    {/* Portal Publik Transparansi SDG 16 (Tanpa Login) */}
                    <Route element={<PublicLayout />}>
                      <Route path="/" element={<PublicHomePage />} />
                      <Route path="/zona-hijau" element={<PublicGreenZonesPage />} />
                      <Route path="/panduan-pkl" element={<PublicPklGuidePage />} />
                      <Route path="/tentang" element={<PublicAboutPage />} />
                    </Route>

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

                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
                <Suspense fallback={null}>
                  <WalkthroughOverlay />
                </Suspense>
              </WalkthroughProvider>
            </ToastProvider>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
