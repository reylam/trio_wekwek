import { useState, type FormEvent } from 'react';
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

const DEMO_ACCOUNTS = [
  {
    demoKey: 'satpol-semarang',
    label: 'Satpol PP',
    city: 'Kota Semarang',
    role: 'SATPOL_PP' as const,
  },
  {
    demoKey: 'satpol-jkt-pusat',
    label: 'Satpol PP',
    city: 'Jakarta Pusat',
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

function SatpolOfficerIllustration() {
  return (
    <svg
      viewBox="0 0 360 400"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-full w-full max-w-[330px] select-none"
      aria-hidden="true"
    >
      {/* Stylized street & city skyline background */}
      <g opacity="0.28">
        <rect x="26" y="176" width="52" height="145" rx="6" fill="#73A6E9" />
        <rect x="86" y="132" width="44" height="189" rx="6" fill="#9EC1EB" />
        <rect x="138" y="156" width="48" height="165" rx="6" fill="#73A6E9" />
        <circle cx="52" cy="252" r="34" fill="#3B82F6" />
        <ellipse cx="145" cy="116" rx="34" ry="12" fill="#E0EEFF" />
      </g>

      {/* Stylized car silhouette in street */}
      <g opacity="0.45">
        <rect x="34" y="302" width="102" height="44" rx="12" fill="#DCE8F8" />
        <path d="M48 302L60 278H110L122 302H48Z" fill="#9EC1EB" />
        <rect x="44" y="318" width="18" height="8" rx="4" fill="#EF4444" />
        <rect x="108" y="318" width="18" height="8" rx="4" fill="#EF4444" />
        <rect x="44" y="346" width="16" height="12" rx="4" fill="#0B132B" />
        <rect x="110" y="346" width="16" height="12" rx="4" fill="#0B132B" />
      </g>

      {/* Officer hair & head */}
      <ellipse cx="212" cy="128" rx="52" ry="48" fill="#0F172A" />
      <circle cx="218" cy="144" r="37" fill="#FAD2B9" />
      <path d="M180 132C184 96 226 88 250 112C258 122 256 142 246 144C244 126 226 116 202 124C194 127 186 132 180 132Z" fill="#0F172A" />
      <circle cx="182" cy="147" r="9" fill="#FAD2B9" />
      {/* Facial features */}
      <circle cx="220" cy="140" r="3.5" fill="#0F172A" />
      <circle cx="240" cy="143" r="3.5" fill="#0F172A" />
      <path d="M214 156C220 163 230 163 236 157" stroke="#C97B63" strokeWidth="3" strokeLinecap="round" />

      {/* Neck & Collar */}
      <rect x="196" y="176" width="24" height="24" rx="8" fill="#F2BE9E" />
      <path d="M174 198L208 220L240 202L224 188H188L174 198Z" fill="#BBD4F6" />

      {/* Officer Uniform Torso */}
      <path
        d="M142 232C146 206 172 194 208 194C246 194 268 212 276 244L286 382H132L142 232Z"
        fill="#27476E"
      />
      {/* Tie */}
      <path d="M206 206L218 206L222 288L212 302L202 288L206 206Z" fill="#173050" />
      {/* Shoulder strap & body cam */}
      <rect x="182" y="218" width="22" height="28" rx="6" fill="#3B5C85" />
      <circle cx="193" cy="232" r="6" fill="#0B132B" />
      {/* Badge on left sleeve */}
      <path d="M142 246L156 241L168 248L165 268L154 275L143 266L142 246Z" fill="#73A6E9" stroke="#FFFFFF" strokeWidth="2" />
      <circle cx="154" cy="257" r="4.5" fill="#043FA5" />

      {/* Belt & Radio */}
      <rect x="136" y="346" width="144" height="18" fill="#1E293B" />
      <rect x="192" y="344" width="20" height="22" rx="4" fill="#94A3B8" />
      <rect x="166" y="328" width="22" height="38" rx="5" fill="#334155" />
      <circle cx="177" cy="348" r="5" fill="#94A3B8" />

      {/* Notepad & Hand */}
      <g transform="rotate(14 282 282)">
        <rect x="240" y="242" width="76" height="96" rx="8" fill="#FFFFFF" />
        <rect x="252" y="264" width="52" height="5" rx="2.5" fill="#DCE8F8" />
        <rect x="252" y="278" width="44" height="5" rx="2.5" fill="#DCE8F8" />
        <rect x="252" y="292" width="48" height="5" rx="2.5" fill="#DCE8F8" />
        <circle cx="252" cy="242" r="4" fill="#1E293B" />
        <circle cx="266" cy="242" r="4" fill="#1E293B" />
        <circle cx="280" cy="242" r="4" fill="#1E293B" />
        <circle cx="294" cy="242" r="4" fill="#1E293B" />
        <circle cx="308" cy="242" r="4" fill="#1E293B" />
      </g>

      {/* Writing hand & arm */}
      <path d="M138 258L192 292L242 276L250 302L186 332L128 292L138 258Z" fill="#33547C" />
      <ellipse cx="242" cy="284" rx="22" ry="15" fill="#FAD2B9" />
      <path d="M236 270L264 288" stroke="#043FA5" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

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
    <div className="flex min-h-screen items-center justify-center bg-[#F4F7FC] p-4 sm:p-8">
      <div className="relative grid w-full max-w-[980px] overflow-hidden rounded-[2rem] bg-white shadow-[0_24px_70px_-20px_rgba(4,63,165,0.22)] md:grid-cols-12">
        {/* Left Cobalt Blue Illustrated Panel (matching Log In (Satpol PP).png) */}
        <div className="relative flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#00266D] via-[#043FA5] to-[#1D5FD4] px-8 pt-8 text-white md:col-span-5">
          {/* Smooth organic curved cutout edge into white right side */}
          <svg
            viewBox="0 0 80 600"
            preserveAspectRatio="none"
            className="pointer-events-none absolute -right-1 bottom-0 top-0 hidden h-full w-16 md:block"
            aria-hidden="true"
          >
            <path d="M80 0C16 0 4 46 4 110V600H80V0Z" fill="#FFFFFF" />
          </svg>

          <div className="relative z-10 flex items-center gap-3">
            <PatraMark inverted className="h-10 w-10" />
            <div>
              <p className="text-base font-extrabold tracking-tight text-white">PATRA</p>
              <p className="text-[11px] text-blue-100/85">Pantauan Transparan Ruang Publik</p>
            </div>
          </div>

          <div className="relative z-10 mt-6 flex items-end justify-center md:-mr-10">
            <SatpolOfficerIllustration />
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="flex flex-col justify-between px-7 py-8 sm:px-12 sm:py-10 md:col-span-7">
          {/* Top utility row */}
          <div className="flex items-center justify-end gap-3 text-xs font-medium text-secondary">
            <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-3 py-1 text-primary/80">
              Bahasa Indonesia (WIB)
              <ChevronDown className="h-3.5 w-3.5" />
            </span>
          </div>

          {/* Main Login Form */}
          <div className="mx-auto my-6 w-full max-w-md">
            <h1 className="text-3xl font-bold tracking-tight text-primary sm:text-[34px]">
              Welcome Back!
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Masuk ke portal instansi PATRA yang terkunci sesuai kota tugas Anda.
            </p>

            {errorMsg && (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
                {errorMsg}
              </div>
            )}

            {infoNote && (
              <div className="mt-5 rounded-xl border border-accent bg-canvas px-4 py-3 text-xs text-primary">
                {infoNote}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-7 space-y-6">
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
                  className="w-full border-b border-accent bg-transparent py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-primary focus:outline-none"
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
                  className="w-full border-b border-accent bg-transparent py-2.5 pr-10 text-sm text-slate-800 placeholder:text-slate-400 focus:border-primary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-0 top-2 p-1 text-primary/75 hover:text-primary"
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                >
                  {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>

              <div className="flex items-center justify-between pt-1">
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
                  className="inline-flex min-w-[116px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#2D6EEB] to-[#043FA5] px-7 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_-8px_rgba(4,63,165,0.6)] transition hover:brightness-105 disabled:opacity-60"
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
            <div className="mt-8 rounded-2xl border border-accent/55 bg-canvas/80 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Akses Demo 1-Klik (Pengujian Juri)</span>
                </div>
                <span className="text-[10px] font-medium text-slate-500">Region-Locked</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {DEMO_ACCOUNTS.map((demo) => {
                  const loading = activeDemoKey === demo.demoKey;
                  const Icon = demo.role === 'SATPOL_PP' ? Shield : Building2;
                  return (
                    <button
                      key={demo.demoKey}
                      type="button"
                      disabled={isSubmitting || Boolean(activeDemoKey)}
                      onClick={() => void handleDemoLogin(demo.demoKey)}
                      className="flex items-center gap-2 rounded-xl border border-accent/50 bg-white px-3 py-2 text-left transition hover:border-primary hover:bg-[#E9F1FD] disabled:opacity-60"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        {loading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Icon className="h-3.5 w-3.5" />
                        )}
                      </span>
                      <span className="min-w-0 leading-tight">
                        <span className="block truncate text-xs font-bold text-primary">
                          {demo.label}
                        </span>
                        <span className="block truncate text-[10px] text-slate-500">
                          {demo.city}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer support link */}
          <p className="text-center text-xs text-slate-400">
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
