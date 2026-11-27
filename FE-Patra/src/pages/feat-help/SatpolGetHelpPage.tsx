import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { PatraMark } from '@/components/ui/PatraLogo';
import polisiGetHelpUrl from '@/assets/images/Polisi GetHelp.png';

const HELP_STORAGE_KEY = 'patra_satpol_help_questions';

interface StoredHelpQuestion {
  id: string;
  email: string;
  question: string;
  regionCity: string;
  createdAt: string;
}

function saveHelpQuestionLocally(entry: StoredHelpQuestion): void {
  try {
    const raw = window.localStorage.getItem(HELP_STORAGE_KEY);
    const list: StoredHelpQuestion[] = raw ? JSON.parse(raw) : [];
    const next = [entry, ...(Array.isArray(list) ? list : [])].slice(0, 20);
    window.localStorage.setItem(HELP_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Abaikan keterbatasan storage browser
  }
}

export default function SatpolGetHelpPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [question, setQuestion] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sentSuccess, setSentSuccess] = useState(false);

  useEffect(() => {
    if (!sentSuccess) return;
    const id = window.setTimeout(() => setSentSuccess(false), 4500);
    return () => window.clearTimeout(id);
  }, [sentSuccess]);

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/satpol/cctv', { replace: true });
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    const trimmedQuestion = question.trim();

    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMsg('Mohon masukkan alamat email yang valid.');
      return;
    }
    if (trimmedQuestion.length < 5) {
      setErrorMsg('Mohon tuliskan pertanyaan Anda minimal 5 karakter.');
      return;
    }

    setErrorMsg(null);
    saveHelpQuestionLocally({
      id: `help-${Date.now()}`,
      email: trimmedEmail,
      question: trimmedQuestion,
      regionCity: user?.region.city ?? 'Satpol PP',
      createdAt: new Date().toISOString(),
    });

    setEmail('');
    setQuestion('');
    setSentSuccess(true);
  };

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-[#FAFBFD]">
      {/* Top Bar: Circular Back Button + Centered Patra Logo */}
      <header className="relative z-20 flex items-center justify-between px-5 py-5 sm:px-8 sm:py-6">
        <button
          type="button"
          onClick={handleBack}
          aria-label="Kembali"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[#002870] text-white shadow-sm transition hover:-translate-x-0.5 hover:bg-primary"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2">
          <PatraMark className="h-7 w-7" />
          <span className="text-xl font-extrabold tracking-tight text-[#002870]">
            Patra
          </span>
        </div>

        <div className="h-10 w-10" aria-hidden="true" />
      </header>

      {/* Main Split Content: Left Satpol Illustration + Right Overlapping White Card */}
      <main className="relative flex flex-1 flex-col lg:flex-row lg:items-end">
        {/* Left Officer Street Illustration */}
        <div className="relative z-0 flex w-full shrink-0 items-end justify-center px-6 pt-2 lg:w-[44%] lg:justify-start lg:px-0 lg:pt-0 xl:w-[42%]">
          <img
            src={polisiGetHelpUrl}
            alt="Ilustrasi Petugas Satpol PP PATRA"
            className="max-h-[260px] w-auto object-contain object-bottom sm:max-h-[320px] lg:max-h-[calc(100vh-92px)] lg:w-full lg:object-cover lg:object-bottom"
          />
        </div>

        {/* Right Form Card */}
        <div className="relative z-10 flex flex-1 flex-col justify-center px-4 pb-8 pt-2 sm:px-8 lg:-ml-10 lg:self-stretch lg:pb-0 lg:pl-0 lg:pr-0 lg:pt-4">
          <div className="relative flex flex-1 flex-col justify-center rounded-3xl border border-slate-100/90 bg-white px-6 py-10 shadow-[0_14px_45px_-12px_rgba(4,63,165,0.16)] sm:px-12 sm:py-14 lg:rounded-b-none lg:rounded-r-none lg:rounded-tl-3xl lg:px-16 xl:px-20">
            {/* Floating Success Pill matching docs/pages/image.png */}
            {sentSuccess && (
              <div
                role="status"
                aria-live="polite"
                onClick={() => setSentSuccess(false)}
                className="animate-patra-enter absolute -top-5 left-1/2 z-20 -translate-x-1/2 cursor-pointer whitespace-nowrap rounded-xl border border-slate-100 bg-white px-6 py-3 text-sm font-semibold text-[#2E9E4F] shadow-[0_12px_30px_-6px_rgba(4,63,165,0.22)] lg:left-8 lg:translate-x-0"
              >
                Questions Successfully Sent!
              </div>
            )}

            <div className="mx-auto w-full max-w-lg">
              <h1 className="text-center text-2xl font-extrabold leading-snug tracking-tight text-[#002870] sm:text-3xl">
                How can we
                <br />
                help you today?
              </h1>

              <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
                <div>
                  <label htmlFor="satpol-help-email" className="sr-only">
                    Email
                  </label>
                  <input
                    id="satpol-help-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    placeholder="Email"
                    className="w-full rounded-xl border border-slate-100/90 bg-white px-5 py-3.5 text-sm text-[#002870] shadow-[0_6px_24px_-4px_rgba(115,166,233,0.38)] transition placeholder:text-[#73A6E9]/70 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label htmlFor="satpol-help-question" className="sr-only">
                    Type Your Questions
                  </label>
                  <textarea
                    id="satpol-help-question"
                    rows={5}
                    value={question}
                    onChange={(e) => {
                      setQuestion(e.target.value);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    placeholder="Type Your Questions..."
                    className="w-full resize-none rounded-xl border border-slate-100/90 bg-white px-5 py-4 text-sm text-[#002870] shadow-[0_6px_24px_-4px_rgba(115,166,233,0.38)] transition placeholder:text-[#73A6E9]/70 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                {errorMsg && (
                  <p className="text-xs font-medium text-red-600" role="alert">
                    {errorMsg}
                  </p>
                )}

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="rounded-lg bg-[#002870] px-8 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary active:scale-[0.99]"
                  >
                    Send
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
