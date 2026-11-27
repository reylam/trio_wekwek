import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Bell,
  Building2,
  ClipboardCheck,
  HelpCircle,
  LogOut,
  MapPin,
  Menu,
  ShieldCheck,
  UserCircle2,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { dinasReportApi } from '@/services/dinasApi';
import { PatraWordmark } from '@/components/ui/PatraLogo';
import WalkthroughTriggerButton from '@/components/walkthrough/WalkthroughTriggerButton';
import { useWalkthrough } from '@/components/walkthrough/WalkthroughContext';
import { formatHeaderClock, REPORT_STATUS_META } from '@/lib/formatters';
import { cn } from '@/lib/utils';

// LOCKED DECISION: Portal Dinas UMKM hanya memiliki 3 Menu Inti
const DINAS_NAV_ITEMS = [
  { to: '/dinas/dashboard', label: 'Dashboard Analitik', icon: BarChart3 },
  { to: '/dinas/validasi', label: 'Validasi Laporan', icon: ClipboardCheck },
  { to: '/dinas/lokasi-binaan', label: 'Data Lokasi Binaan', icon: MapPin },
];

export function DinasTopHeader({
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
  const [clockText, setClockText] = useState(() => formatHeaderClock());
  const [bellOpen, setBellOpen] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setClockText(formatHeaderClock()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const pendingQuery = useQuery({
    queryKey: ['dinas', 'reports', 'pending-bell', user?.region.id],
    queryFn: () =>
      dinasReportApi.list({
        statuses: ['PENDING_VALIDATION'],
        pageSize: 5,
      }),
    enabled: Boolean(user && user.role === 'DINAS_UMKM'),
    staleTime: 30_000,
  });

  const pendingReports = pendingQuery.data?.reports ?? [];
  const pendingCount =
    pendingQuery.data?.pagination.totalItems ?? pendingReports.length;

  return (
    <header className="flex items-start justify-between gap-3 pb-5 sm:gap-4">
      <div className="min-w-0 flex-1">
        {leftSlot ? (
          leftSlot
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="break-words text-lg font-extrabold leading-snug tracking-tight text-primary sm:text-2xl lg:text-[28px]">
                {title ?? user?.region.umkmAgencyName ?? 'Portal Dinas UMKM'}
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#E9F1FD] px-2.5 py-1 text-[11px] font-bold text-primary">
                <Building2 className="h-3.5 w-3.5" />
                <span>{user?.region.city}</span>
              </span>
            </div>
            <p className="mt-1 font-mono text-[11px] font-medium text-primary/75 sm:text-sm">
              {subtitle ?? `${user?.region.province ?? ''} • ${clockText}`}
            </p>
          </>
        )}
      </div>

      <div className="relative flex shrink-0 items-center gap-2 sm:gap-3">
        <WalkthroughTriggerButton tourId="dinas" label="Panduan Tur" />

        <button
          type="button"
          data-tour="dinas-header-bell"
          onClick={() => setBellOpen((prev) => !prev)}
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-primary transition hover:bg-accent/25 sm:h-10 sm:w-10"
          aria-label="Notifikasi laporan menunggu validasi"
        >
          <Bell className="h-5 w-5" />
          {pendingCount > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => navigate('/dinas/profile')}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white shadow-sm transition hover:bg-primary/90 sm:h-10 sm:w-10"
          title={user?.fullName ?? 'Profil Dinas UMKM'}
          aria-label="Profil akun dinas"
        >
          <UserCircle2 className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>

        {bellOpen && (
          <div className="absolute right-0 top-12 z-50 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-accent/60 bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div>
                <p className="text-sm font-bold text-primary">Menunggu Validasi</p>
                <p className="text-[11px] text-slate-500">
                  {pendingCount} laporan di {user?.region.city}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBellOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Tutup panel notifikasi"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-2.5 max-h-64 space-y-2 overflow-y-auto">
              {pendingReports.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-500">
                  Tidak ada laporan menunggu validasi saat ini.
                </p>
              ) : (
                pendingReports.map((rep) => {
                  const meta = REPORT_STATUS_META[rep.status];
                  return (
                    <button
                      key={rep.id}
                      type="button"
                      onClick={() => {
                        setBellOpen(false);
                        navigate(`/dinas/validasi/${rep.id}`);
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
                navigate('/dinas/validasi');
              }}
              className="mt-3 w-full rounded-xl bg-primary/10 py-2 text-xs font-semibold text-primary transition hover:bg-primary hover:text-white"
            >
              Buka Validasi Laporan
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

export default function DinasLayout() {
  const { user, logout } = useAuth();
  const { startTour } = useWalkthrough();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [modalType, setModalType] = useState<'profile' | 'help' | null>(null);

  const pendingBadgeQuery = useQuery({
    queryKey: ['dinas', 'reports', 'pending-bell', user?.region.id],
    queryFn: () =>
      dinasReportApi.list({
        statuses: ['PENDING_VALIDATION'],
        pageSize: 5,
      }),
    enabled: Boolean(user && user.role === 'DINAS_UMKM'),
    staleTime: 30_000,
  });

  const pendingCount = pendingBadgeQuery.data?.pagination.totalItems ?? 0;

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between bg-white">
      <div>
        <div className="px-6 pb-7 pt-7">
          <PatraWordmark subtitle={user?.region.umkmAgencyName ?? 'Portal Dinas UMKM'} />
        </div>

        <nav data-tour="dinas-nav" className="space-y-1" aria-label="Menu Utama Dinas UMKM">
          {DINAS_NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center justify-between px-6 py-3.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-[#E9F1FD] font-semibold text-primary'
                    : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div className="flex items-center gap-3.5">
                    <Icon
                      className={cn(
                        'h-5 w-5 shrink-0',
                        isActive ? 'text-primary' : 'text-slate-400',
                      )}
                    />
                    <span>{label}</span>
                  </div>
                  {to === '/dinas/validasi' && pendingCount > 0 && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">
                      {pendingCount}
                    </span>
                  )}
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
            to="/dinas/profile"
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
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              setModalType('help');
            }}
            className="flex w-full items-center gap-3.5 px-6 py-3 text-sm font-medium text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
          >
            <HelpCircle className="h-5 w-5" />
            <span>Get Help</span>
          </button>
        </div>
      </div>

      <div className="px-6 pb-6 pt-4">
        <div className="mb-3 rounded-xl bg-canvas px-3 py-2.5 text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5 font-semibold text-primary">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Region-Locked Access</span>
          </div>
          <p className="mt-0.5 truncate">{user?.region.umkmAgencyName}</p>
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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200/80 bg-white shadow-[4px_0_24px_-12px_rgba(4,63,165,0.08)] lg:block">
        {sidebarContent}
      </aside>

      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <PatraWordmark subtitle={user?.region.city} />
        <button
          type="button"
          data-tour="dinas-nav"
          onClick={() => setMobileMenuOpen(true)}
          className="rounded-xl p-2 text-primary hover:bg-accent/20"
          aria-label="Buka navigasi"
        >
          <Menu className="h-6 w-6" />
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
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

      <main className="min-h-screen min-w-0 flex-1 pt-14 lg:pl-64 lg:pt-0">
        <Outlet />
      </main>

      {modalType && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-lg font-bold text-primary">
                {modalType === 'profile'
                  ? 'Profil Instansi Dinas'
                  : 'Panduan Kerja Dinas UMKM'}
              </h2>
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Tutup modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {modalType === 'profile' ? (
              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-xl bg-canvas p-3.5">
                  <p className="text-xs font-medium text-slate-500">Nama Pejabat / Admin</p>
                  <p className="font-semibold text-slate-900">{user?.fullName}</p>
                </div>
                <div className="rounded-xl bg-canvas p-3.5">
                  <p className="text-xs font-medium text-slate-500">Email & Peran</p>
                  <p className="font-mono text-xs text-slate-800">{user?.email}</p>
                  <span className="mt-1.5 inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    Dinas UMKM / PPKUKM
                  </span>
                </div>
                <div className="rounded-xl bg-canvas p-3.5">
                  <p className="text-xs font-medium text-slate-500">Wilayah Terkunci</p>
                  <p className="font-semibold text-primary">
                    {user?.region.city}, {user?.region.province}
                  </p>
                  <p className="text-xs text-slate-600">{user?.region.umkmAgencyName}</p>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3 text-xs leading-relaxed text-slate-600">
                <p>
                  <strong className="text-primary">1. Dashboard Analitik:</strong> Pantau 4
                  indikator strategis, tren 30 hari, jam rawan (WIB), 5 ruas jalan terpadat,
                  serta Peta Penataan Lokasi Binaan.
                </p>
                <p>
                  <strong className="text-primary">2. Validasi Laporan:</strong> Periksa foto{' '}
                  <em>Before</em> vs <em>After</em> pada tampilan <em>Split-View</em>, setujui
                  atau minta revisi dengan alasan jelas, tetapkan Lokasi Binaan 1-klik, dan
                  unduh Berita Acara PDF 1 halaman.
                </p>
                <p>
                  <strong className="text-primary">3. Data Lokasi Binaan:</strong> Tambah atau
                  perbarui selter/lokasi binaan dengan fitur <em>click-to-pin</em> peta.
                </p>
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              {modalType === 'help' && (
                <button
                  type="button"
                  onClick={() => {
                    setModalType(null);
                    startTour('dinas');
                  }}
                  className="rounded-xl border border-primary/25 bg-[#EEF4FD] px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/15"
                >
                  Mulai Tur Interaktif
                </button>
              )}
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
