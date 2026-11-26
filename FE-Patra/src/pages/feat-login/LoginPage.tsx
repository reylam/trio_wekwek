import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  Shield,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { PatraMark } from '@/components/ui/PatraLogo';
import { EXTRA_PUBLIC_CITY_ACCOUNTS } from '@/services/offlineMock';
import loginBgUrl from '@/assets/images/Login BG.png';
import polisiLoginUrl from '@/assets/images/Polisi Login.png';
import polisiLoginMobileUrl from '@/assets/images/Polisi Login Mobile.png';

const DEMO_ACCOUNTS = [
  {
    demoKey: 'satpol-semarang',
    label: 'Satpol PP',
    city: 'Kota Semarang (54 CCTV)',
    role: 'SATPOL_PP' as const,
  },
  {
    demoKey: 'satpol-jkt-pusat',
    label: 'Satpol PP',
    city: 'Jakarta Pusat (30 CCTV)',
    role: 'SATPOL_PP' as const,
  },
  {
    demoKey: 'dinas-semarang',
    label: 'Dinas UMKM',
    city: 'Kota Semarang',
    role: 'DINAS_UMKM' as const,
  },
  {
    demoKey: 'dinas-jkt-pusat',
    label: 'Sudin PPKUKM',
    city: 'Jakarta Pusat',
    role: 'DINAS_UMKM' as const,
  },
];

export default function LoginPage() {
  const { login, demoLogin } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeDemoKey, setActiveDemoKey] = useState<string | null>(null);
  const [infoNote, setInfoNote] = useState<string | null>(null);
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const cityDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!cityDropdownOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (cityDropdownRef.current && !cityDropdownRef.current.contains(e.target as Node)) {
        setCityDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCityDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [cityDropdownOpen]);

  const redirectByRole = (role: 'SATPOL_PP' | 'DINAS_UMKM') => {
    navigate(role === 'SATPOL_PP' ? '/satpol/cctv' : '/dinas/dashboard', { replace: true });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoNote(null);

    if (!email.trim() || !password) {
      setErrorMsg('Email dan kata sandi wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    try {
      const user = await login(email.trim(), password);
      redirectByRole(user.role);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Email atau kata sandi tidak sesuai.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoLogin = async (demoKey: string) => {
    setErrorMsg(null);
    setInfoNote(null);
    setActiveDemoKey(demoKey);

    try {
      const user = await demoLogin(demoKey);
      redirectByRole(user.role);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Gagal masuk dengan akun demo.',
      );
    } finally {
      setActiveDemoKey(null);
    }
  };

  return (
    <div className="min-h-screen bg-white md:flex md:items-center md:justify-center md:bg-[#F4F7FC] md:p-5">
      <div className="relative grid w-full bg-white md:max-w-[880px] md:grid-cols-12 md:overflow-hidden md:rounded-[1.75rem] md:shadow-[0_24px_70px_-20px_rgba(4,63,165,0.22)]">
        {/* Top Cobalt Hero (Mobile) / Left Panel (Desktop) */}
        <div className="relative flex flex-col justify-between overflow-hidden rounded-b-[2rem] bg-gradient-to-br from-[#001F6B] via-[#043FA5] to-[#1A58C8] px-5 pt-4 text-white sm:px-7 md:col-span-5 md:overflow-visible md:rounded-b-none md:pt-6">
          {/* Lapisan Latar Jalan Perkotaan (Login BG.png) */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[72%] overflow-hidden opacity-65 md:h-[62%]">
            <img
              src={loginBgUrl}
              alt=""
              aria-hidden="true"
              decoding="async"
              draggable={false}
              className="h-full w-full select-none object-cover object-bottom"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#043FA5] via-[#043FA5]/35 to-[#001F6B]/60" />
          </div>

          {/* Potongan Kurva Putih Organik Sisi Kanan (Desktop) */}
          <svg
            viewBox="0 0 80 600"
            preserveAspectRatio="none"
            className="pointer-events-none absolute -right-1 bottom-0 top-0 z-10 hidden h-full w-14 md:block"
            aria-hidden="true"
          >
            <path d="M80 0C16 0 4 46 4 110V600H80V0Z" fill="#FFFFFF" />
          </svg>

          {/* Mobile Hero Header + Centered Logo + Stacked Headline + Officer (Log In (Satpol PP) - Mobile.png) */}
          <div className="relative z-20 flex flex-col md:hidden">
            <div className="flex justify-end">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                Bahasa Indonesia (WIB)
                <ChevronDown className="h-3.5 w-3.5" />
              </span>
            </div>

            <div className="mt-1.5 flex flex-col items-center">
              <PatraMark inverted className="h-10 w-10 drop-shadow-sm" />
            </div>

            <div className="mt-3">
              <h1 className="text-[30px] font-bold leading-[1.08] tracking-tight text-white">
                Welcome
                <br />
                Back!
              </h1>
              <p className="mt-1 max-w-[260px] text-xs text-blue-100/90">
                Portal instansi PATRA terkunci sesuai kota tugas Anda.
              </p>
            </div>

            <div className="-mb-1 mt-1.5 flex justify-center">
              <img
                src={polisiLoginMobileUrl}
                alt="Ilustrasi Petugas Satpol PP PATRA"
                decoding="async"
                draggable={false}
                className="pointer-events-none h-[180px] w-[190px] select-none object-cover object-top drop-shadow-[0_10px_20px_rgba(0,31,107,0.3)]"
              />
            </div>
          </div>

          {/* Desktop Header Brand */}
          <div className="relative z-20 hidden items-center gap-2.5 md:flex">
            <PatraMark inverted className="h-9 w-9" />
            <div>
              <p className="text-sm font-extrabold tracking-tight text-white">PATRA</p>
              <p className="text-[10.5px] text-blue-100/85">
                Pantauan Transparan Ruang Publik
              </p>
            </div>
          </div>

          {/* Desktop Officer (Polisi Login.png) overlap mulus di atas kurva putih */}
          <div className="relative z-20 mt-3 hidden items-end justify-center md:-mr-10 md:flex lg:-mr-12">
            <img
              src={polisiLoginUrl}
              alt="Ilustrasi Petugas Satpol PP PATRA"
              decoding="async"
              draggable={false}
              className="pointer-events-none w-[245px] max-w-none select-none object-contain object-bottom drop-shadow-[0_12px_24px_rgba(0,31,107,0.28)] lg:w-[270px]"
            />
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="relative z-20 flex flex-col justify-between bg-white px-5 pb-6 pt-5 sm:px-8 sm:py-6 md:col-span-7 md:pl-10 lg:pl-12">
          {/* Top utility row (Desktop only; on mobile rendered inside blue hero) */}
          <div className="hidden items-center justify-end gap-3 text-xs font-medium text-secondary md:flex">
            <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-3 py-1 text-[11px] text-primary/80">
              Bahasa Indonesia (WIB)
              <ChevronDown className="h-3.5 w-3.5" />
            </span>
          </div>

          {/* Main Login Form */}
          <div className="mx-auto w-full max-w-sm md:my-3">
            <div className="hidden md:block">
              <h1 className="text-2xl font-bold tracking-tight text-primary sm:text-[28px]">
                Welcome Back!
              </h1>
              <p className="mt-1 text-xs text-slate-500">
                Masuk ke portal instansi PATRA yang terkunci sesuai kota tugas Anda.
              </p>
            </div>

            {errorMsg && (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700 md:mb-0 md:mt-4">
                {errorMsg}
              </div>
            )}

            {infoNote && (
              <div className="mb-3 rounded-xl border border-accent bg-canvas px-3.5 py-2.5 text-xs text-primary md:mb-0 md:mt-4">
                {infoNote}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3 md:mt-4 md:space-y-4">
              <div>
                <label htmlFor="email" className="sr-only">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  className="w-full rounded-full border border-slate-200/80 bg-white px-5 py-3 text-sm text-slate-800 shadow-[0_6px_20px_-6px_rgba(4,63,165,0.16)] placeholder:text-slate-400 focus:border-primary focus:outline-none md:rounded-none md:border-0 md:border-b md:border-accent md:bg-transparent md:px-0 md:py-2 md:shadow-none"
                />
              </div>

              <div className="relative">
                <label htmlFor="password" className="sr-only">
                  Password
                </label>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full rounded-full border border-slate-200/80 bg-white py-3 pl-5 pr-12 text-sm text-slate-800 shadow-[0_6px_20px_-6px_rgba(4,63,165,0.16)] placeholder:text-slate-400 focus:border-primary focus:outline-none md:rounded-none md:border-0 md:border-b md:border-accent md:bg-transparent md:py-2 md:pl-0 md:pr-10 md:shadow-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-primary/75 hover:text-primary md:right-0 md:top-1.5 md:translate-y-0"
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                >
                  {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>

              <div className="flex items-center justify-between pt-0.5">
                <button
                  type="button"
                  onClick={() =>
                    setInfoNote(
                      'Untuk akun instansi resmi, hubungi admin Pemda setempat. Untuk pengujian cepat juri, gunakan tombol Akses Demo 1-Klik di bawah.',
                    )
                  }
                  className="text-xs font-medium text-secondary underline underline-offset-2 hover:text-primary"
                >
                  Forgot Password?
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting || Boolean(activeDemoKey)}
                  className="inline-flex min-w-[104px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#2D6EEB] to-[#043FA5] px-6 py-2 text-xs font-semibold text-white shadow-[0_10px_24px_-8px_rgba(4,63,165,0.6)] transition hover:brightness-105 disabled:opacity-60 sm:text-sm"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Masuk...</span>
                    </>
                  ) : (
                    'Log In'
                  )}
                </button>
              </div>
            </form>

            {/* LOCKED DECISION FEAT-PUB-02: Panel Akses Demo 1-Klik */}
            <div className="mt-5 rounded-xl border border-accent/55 bg-canvas/80 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Akses Demo 1-Klik (Pengujian Juri)</span>
                </div>
                <span className="text-[10px] font-medium text-slate-500">Region-Locked</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {DEMO_ACCOUNTS.map((demo) => {
                  const loading = activeDemoKey === demo.demoKey;
                  const Icon = demo.role === 'SATPOL_PP' ? Shield : Building2;
                  return (
                    <button
                      key={demo.demoKey}
                      type="button"
                      disabled={isSubmitting || Boolean(activeDemoKey)}
                      onClick={() => void handleDemoLogin(demo.demoKey)}
                      className="flex items-center gap-2 rounded-lg border border-accent/50 bg-white px-2.5 py-1.5 text-left transition hover:border-primary hover:bg-[#E9F1FD] disabled:opacity-60"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        {loading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Icon className="h-3 w-3" />
                        )}
                      </span>
                      <span className="min-w-0 leading-tight">
                        <span className="block truncate text-[11px] font-bold text-primary">
                          {demo.label}
                        </span>
                        <span className="block truncate text-[9.5px] text-slate-500">
                          {demo.city}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div ref={cityDropdownRef} className="mt-2.5 border-t border-accent/40 pt-2.5">
                <label
                  htmlFor="extra-city-select"
                  className="block text-[9.5px] font-semibold uppercase tracking-wide text-slate-500"
                >
                  Atau jelajahi Satpol PP kota publik lainnya (874 CCTV, 20 Kota)
                </label>
                <div className="relative mt-1">
                  <button
                    id="extra-city-select"
                    type="button"
                    disabled={isSubmitting || Boolean(activeDemoKey)}
                    aria-expanded={cityDropdownOpen}
                    aria-haspopup="listbox"
                    onClick={() => setCityDropdownOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between rounded-lg border border-accent/60 bg-white py-1.5 pl-2.5 pr-2.5 text-left text-[11px] font-medium text-primary transition hover:border-primary/70 focus:border-primary focus:outline-none disabled:opacity-60"
                  >
                    <span className="truncate">
                      {activeDemoKey && EXTRA_PUBLIC_CITY_ACCOUNTS.some((i) => i.demoKey === activeDemoKey)
                        ? `Masuk ke ${EXTRA_PUBLIC_CITY_ACCOUNTS.find((i) => i.demoKey === activeDemoKey)?.city}...`
                        : 'Pilih kota publik lainnya...'}
                    </span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 text-primary/70 transition-transform duration-200 ${
                        cityDropdownOpen ? 'rotate-180' : ''
                      }`}
                      aria-hidden="true"
                    />
                  </button>

                  {cityDropdownOpen && (
                    <div
                      role="listbox"
                      aria-label="Daftar kota publik PATRA"
                      className="mt-1 max-h-36 w-full overflow-y-auto overscroll-contain rounded-lg border border-accent/60 bg-white py-1 shadow-md"
                    >
                      {EXTRA_PUBLIC_CITY_ACCOUNTS.map((item) => {
                        const isItemLoading = activeDemoKey === item.demoKey;
                        return (
                          <button
                            key={item.demoKey}
                            type="button"
                            role="option"
                            aria-selected={false}
                            disabled={isSubmitting || Boolean(activeDemoKey)}
                            onClick={() => {
                              setCityDropdownOpen(false);
                              void handleDemoLogin(item.demoKey);
                            }}
                            className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[11px] text-primary transition hover:bg-[#E9F1FD] disabled:opacity-60"
                          >
                            <span className="min-w-0 truncate">
                              <span className="font-semibold">{item.city}</span>
                              <span className="text-slate-500">, {item.province}</span>
                            </span>
                            <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9.5px] font-bold text-primary">
                              {isItemLoading ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                `${item.cameraCount} CCTV`
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Footer support link */}
          <p className="mt-4 text-center text-[11px] text-slate-400 md:mt-2">
            Having trouble signing in?{' '}
            <button
              type="button"
              onClick={() =>
                setInfoNote(
                  'Tim dukungan PATRA siap membantu. Gunakan Panel Akses Demo 1-Klik di atas untuk mencoba portal Satpol PP atau Dinas UMKM secara instan.',
                )
              }
              className="font-semibold text-secondary underline underline-offset-2 hover:text-primary"
            >
              Get Support.
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
