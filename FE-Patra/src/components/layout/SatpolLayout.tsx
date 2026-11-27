import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Bell,
  HelpCircle,
  LogOut,
  Map as MapIcon,
  Menu,
  ShieldCheck,
  UserCircle2,
  Video,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { reportApi } from '@/services/api';
import { PatraWordmark } from '@/components/ui/PatraLogo';
import WalkthroughTriggerButton from '@/components/walkthrough/WalkthroughTriggerButton';
import { formatHeaderClock, REPORT_STATUS_META } from '@/lib/formatters';
import { cn } from '@/lib/utils';

// LOCKED DECISION: Satpol PP hanya memiliki 3 Menu Inti
const SATPOL_NAV_ITEMS = [
  { to: '/satpol/cctv', label: 'CCTV Monitoring', icon: Video },
  { to: '/satpol/peta', label: 'Regional Map', icon: MapIcon },
  { to: '/satpol/laporan', label: 'Reports & Actions', icon: BarChart3 },
];

function SatpolNotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [bellOpen, setBellOpen] = useState(false);

  const activeReportsQuery = useQuery({
    queryKey: ['reports', 'active-bell', user?.region.id],
    queryFn: () =>
      reportApi.list({
        statuses: ['NEED_ACTION', 'NEEDS_REVISION'],
        pageSize: 5,
      }),
    enabled: Boolean(user && user.role === 'SATPOL_PP'),
    staleTime: 30_000,
  });

  const activeReports = activeReportsQuery.data?.reports ?? [];
  const activeCount = activeReportsQuery.data?.pagination.totalItems ?? activeReports.length;

  return (
    <div className="relative">
      <button
        type="button"
        data-tour="satpol-header-bell"
        onClick={() => setBellOpen((prev) => !prev)}
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-primary transition hover:bg-accent/25 sm:h-10 sm:w-10"
        aria-label="Notifikasi laporan aktif"
      >
        <Bell className="h-5 w-5" />
        {activeCount > 0 && (
          <span className="absolute right-1 top-1 flex h-2.5 w-2.5 sm:right-1.5 sm:top-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
          </span>
        )}
      </button>

      {bellOpen && (
        <div className="absolute right-0 top-11 z-50 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-accent/60 bg-white p-4 shadow-xl sm:top-12">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div>
              <p className="text-sm font-bold text-primary">Laporan Perlu Tindakan</p>
              <p className="text-[11px] text-slate-500">
                {activeCount} laporan aktif di {user?.region.city}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setBellOpen(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2.5 max-h-64 space-y-2 overflow-y-auto">
            {activeReports.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-500">
                Semua laporan di wilayah Anda sudah ditangani.
              </p>
            ) : (
              activeReports.map((rep) => {
                const meta = REPORT_STATUS_META[rep.status];
                return (
                  <button
                    key={rep.id}
                    type="button"
                    onClick={() => {
                      setBellOpen(false);
                      navigate(`/satpol/laporan/${rep.id}`);
                    }}
                    className="w-full rounded-xl border border-slate-100 bg-canvas/70 p-2.5 text-left transition hover:border-accent hover:bg-accent/15"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-semibold text-primary">
                        {rep.reportCode}
                      </span>
                      <span
                        className={cn(
                          'rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                          meta.badgeClass,
                        )}
                      >
                        {meta.shortLabel}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs font-medium text-slate-700">
                      {rep.address}
                    </p>
                  </button>
                );
              })
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setBellOpen(false);
              navigate('/satpol/laporan');
            }}
            className="mt-3 w-full rounded-xl bg-primary/10 py-2 text-xs font-semibold text-primary transition hover:bg-primary hover:text-white"
          >
            Buka Semua Laporan & Penindakan
          </button>
        </div>
      )}
    </div>
  );
}

export function SatpolTopHeader({
  title,
  subtitle,
  leftSlot,
}: {
  title?: string;
  subtitle?: string;
  leftSlot?: ReactNode;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [clockText, setClockText] = useState(() => formatHeaderClock());
  const isLiveCctvDetail = /^\/satpol\/cctv\/.+/.test(location.pathname);

  useEffect(() => {
    const id = window.setInterval(() => setClockText(formatHeaderClock()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header
      className={cn(
        'items-start justify-between gap-3 pb-4 sm:gap-4 lg:flex lg:pb-5',
        leftSlot ? 'flex' : 'hidden',
      )}
    >
      <div className="min-w-0 flex-1">
        {leftSlot ? (
          leftSlot
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="break-words text-lg font-extrabold leading-snug tracking-tight text-primary sm:text-2xl lg:text-[28px]">
                {title ?? `${user?.region.city ?? ''}, ${user?.region.province ?? ''}`}
              </h1>
            </div>
            <p className="mt-1 font-mono text-[11px] font-medium text-primary/75 sm:text-sm">
              {subtitle ?? clockText}
            </p>
          </>
        )}
      </div>

      <div className="relative hidden shrink-0 items-center gap-2 sm:gap-3 lg:flex">
        <WalkthroughTriggerButton
          tourId={isLiveCctvDetail ? 'satpol-live' : 'satpol'}
          label={isLiveCctvDetail ? 'Tur Kamera AI' : 'Panduan Tur'}
        />

        <SatpolNotificationBell />

        <button
          type="button"
          onClick={() => navigate('/satpol/profile')}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white shadow-sm transition hover:bg-primary/90 sm:h-10 sm:w-10"
          title={user?.fullName ?? 'Profil Petugas'}
          aria-label="Profil petugas"
        >
          <UserCircle2 className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>
      </div>
    </header>
  );
}

export default function SatpolLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [clockText, setClockText] = useState(() => formatHeaderClock());

  useEffect(() => {
    const id = window.setInterval(() => setClockText(formatHeaderClock()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const isMapPage = location.pathname.startsWith('/satpol/peta');
  const isReportsList = location.pathname === '/satpol/laporan';
  const isProfilePage = location.pathname === '/satpol/profile';
  const isLiveCctvDetail = /^\/satpol\/cctv\/.+/.test(location.pathname);
  const mobileTitle = isProfilePage
    ? 'Profile'
    : isReportsList
      ? 'Reports & Actions'
      : `${user?.region.city ?? ''}, ${user?.region.province ?? ''}`;

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between bg-white">
      <div>
        <div className="px-6 pb-7 pt-7">
          <PatraWordmark subtitle={user?.region.city ?? 'Portal Satpol PP'} />
        </div>

        <nav data-tour="satpol-nav" className="space-y-1" aria-label="Menu Utama Satpol PP">
          {SATPOL_NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center gap-3.5 px-6 py-3.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-[#E9F1FD] font-semibold text-primary'
                    : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn(
                      'h-5 w-5 shrink-0',
                      isActive ? 'text-primary' : 'text-slate-400',
                    )}
                  />
                  <span>{label}</span>
                  {isActive && (
                    <span className="absolute bottom-1 right-0 top-1 w-1 rounded-l-full bg-primary" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mx-6 my-5 border-t border-slate-100" />

        <div className="space-y-1">
          <NavLink
            to="/satpol/profile"
            onClick={() => setMobileMenuOpen(false)}
            className={({ isActive }) =>
              cn(
                'relative flex w-full items-center gap-3.5 px-6 py-3 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[#E9F1FD] font-semibold text-primary'
                  : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700',
              )
            }
          >
            {({ isActive }) => (
              <>
                <UserCircle2
                  className={cn(
                    'h-5 w-5 shrink-0',
                    isActive ? 'text-primary' : 'text-slate-400',
                  )}
                />
                <span>Profile</span>
                {isActive && (
                  <span className="absolute bottom-1 right-0 top-1 w-1 rounded-l-full bg-primary" />
                )}
              </>
            )}
          </NavLink>
          <NavLink
            to="/satpol/help"
            onClick={() => setMobileMenuOpen(false)}
            className={({ isActive }) =>
              cn(
                'relative flex w-full items-center gap-3.5 px-6 py-3 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[#E9F1FD] font-semibold text-primary'
                  : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700',
              )
            }
          >
            {({ isActive }) => (
              <>
                <HelpCircle
                  className={cn(
                    'h-5 w-5 shrink-0',
                    isActive ? 'text-primary' : 'text-slate-400',
                  )}
                />
                <span>Get Help</span>
                {isActive && (
                  <span className="absolute bottom-1 right-0 top-1 w-1 rounded-l-full bg-primary" />
                )}
              </>
            )}
          </NavLink>
        </div>
      </div>

      <div className="px-6 pb-6 pt-4">
        <div className="mb-3 rounded-xl bg-canvas px-3 py-2.5 text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5 font-semibold text-primary">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Region-Locked Access</span>
          </div>
          <p className="mt-0.5 truncate">{user?.region.satpolAgencyName}</p>
        </div>

        <button
          type="button"
          onClick={() => void handleLogout()}
          className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-red-50 hover:text-red-600"
        >
          <LogOut className="h-5 w-5" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#FAFBFD]">
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-[700] hidden w-64 border-r border-slate-200/80 bg-white shadow-[4px_0_24px_-12px_rgba(4,63,165,0.08)] lg:block">
        {sidebarContent}
      </aside>

      {/* Unified Mobile Topbar — Matches CCTV Monitoring, Regional Map, & Reports Mobile Mockups */}
      {!isLiveCctvDetail && (
        <div
          className={cn(
            'fixed inset-x-0 top-0 z-[800] flex h-16 items-center justify-between gap-2.5 border-b px-3.5 transition-colors lg:hidden',
            isMapPage
              ? 'border-slate-200/60 bg-white/85 backdrop-blur-md'
              : 'border-slate-200/80 bg-white',
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <button
              type="button"
              data-tour="satpol-nav"
              onClick={() => setMobileMenuOpen(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-primary hover:bg-accent/20"
              aria-label="Buka navigasi"
            >
              <Menu className="h-6 w-6" />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[15px] font-extrabold leading-tight tracking-tight text-primary">
                {mobileTitle}
              </h1>
              <p className="truncate font-mono text-[10.5px] font-medium text-primary/75">
                {clockText}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <WalkthroughTriggerButton tourId="satpol" label="Panduan Tur" />

            <SatpolNotificationBell />

            <button
              type="button"
              onClick={() => navigate('/satpol/profile')}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white shadow-sm transition hover:bg-primary/90"
              title={user?.fullName ?? 'Profil Petugas'}
              aria-label="Profil petugas"
            >
              <UserCircle2 className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[900] lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px]"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-72 bg-white shadow-2xl">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="absolute right-3 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              aria-label="Tutup navigasi"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main Content (isolated stacking context so Leaflet panes stay below navbar & drawer) */}
      <main
        className={cn(
          'relative z-0 isolate min-w-0 flex-1 lg:pl-64 lg:pt-0',
          isMapPage
            ? 'h-screen overflow-hidden pt-0'
            : isLiveCctvDetail
              ? 'min-h-screen pt-0'
              : 'min-h-screen pt-16',
        )}
      >
        <Outlet />
      </main>
    </div>
  );
}
