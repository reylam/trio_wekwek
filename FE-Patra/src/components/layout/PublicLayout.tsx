import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ArrowRight, Menu, X } from 'lucide-react';
import { PatraMark, PatraWordmark } from '@/components/ui/PatraLogo';
import { useWalkthrough } from '@/components/walkthrough/WalkthroughContext';
import WalkthroughTriggerButton from '@/components/walkthrough/WalkthroughTriggerButton';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

const PUBLIC_NAV_ITEMS = [
  { to: '/', label: 'Beranda', end: true },
  { to: '/zona-hijau', label: 'Zona Hijau', end: false },
  { to: '/panduan-pkl', label: 'Panduan PKL', end: false },
  { to: '/tentang', label: 'Tentang & Privasi', end: false },
] as const;

export default function PublicLayout() {
  const { user } = useAuth();
  const { isOpen: isTourOpen } = useWalkthrough();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Tutup menu mobile dan gulir ke atas saat pindah halaman publik (kecuali saat walkthrough sedang mengarahkan scroll)
  useEffect(() => {
    setMobileOpen(false);
    if (!isTourOpen) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [location.pathname, isTourOpen]);

  return (
    <div className="flex min-h-screen flex-col bg-[#F6F8FB] text-slate-900">
      {/* Sticky Civic Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-slate-200 border-t-2 border-t-primary bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 py-3">
            <button
              type="button"
              data-tour="public-nav"
              onClick={() => setMobileOpen((prev) => !prev)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition hover:bg-slate-50 md:hidden"
              aria-label={mobileOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>

            <Link to="/" className="min-w-0">
              <PatraWordmark subtitle="Portal Transparansi Ruang Publik" />
            </Link>
          </div>

          <nav
            data-tour="public-nav"
            aria-label="Navigasi Portal Publik"
            className="hidden h-full items-stretch gap-1 md:flex"
          >
            {PUBLIC_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'relative inline-flex items-center px-3.5 py-5 text-[13px] font-semibold transition-colors',
                    isActive
                      ? 'text-primary'
                      : 'text-slate-600 hover:text-slate-950',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span>{item.label}</span>
                    {isActive && (
                      <span
                        className="absolute inset-x-3 bottom-0 h-[2px] bg-primary"
                        aria-hidden="true"
                      />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2 py-3">
            <WalkthroughTriggerButton
              tourId="public"
              label="Panduan Tur"
              className="rounded-lg border-slate-200 shadow-none"
            />
            {user ? (
              <Link
                to={
                  user.role === 'SATPOL_PP'
                    ? '/satpol/cctv'
                    : '/dinas/dashboard'
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#033285]"
              >
                <span className="max-w-[120px] truncate sm:max-w-none">
                  Portal {user.region.city}
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
              </Link>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#033285]"
              >
                <span>Masuk Instansi</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
              </Link>
            )}
          </div>
        </div>

        {/* Mobile Navigation Panel */}
        {mobileOpen && (
          <nav
            aria-label="Navigasi Mobile Portal Publik"
            className="border-t border-slate-200 bg-white px-4 py-2.5 md:hidden"
          >
            <div className="flex flex-col gap-1">
              {PUBLIC_NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors',
                      isActive
                        ? 'bg-[#EEF4FD] text-primary'
                        : 'text-slate-700 hover:bg-slate-50',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>
        )}
      </header>

      {/* Active Public Page */}
      <div className="flex-1">
        <Outlet />
      </div>

      {/* Shared Civic Footer */}
      <footer className="mt-12 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <PatraMark className="h-6 w-6" />
            <p>
              <strong className="font-bold text-slate-900">PATRA</strong>:
              Pantauan Transparan Ruang Publik (SDG 16)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-5 font-medium">
            <Link to="/" className="hover:text-primary">
              Beranda
            </Link>
            <Link to="/zona-hijau" className="hover:text-primary">
              Zona Hijau
            </Link>
            <Link to="/panduan-pkl" className="hover:text-primary">
              Panduan PKL
            </Link>
            <Link to="/tentang" className="hover:text-primary">
              Tentang & Privasi
            </Link>
            <Link
              to="/login"
              className="font-semibold text-primary hover:underline"
            >
              Portal Instansi →
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
