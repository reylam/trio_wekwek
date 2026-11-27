import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, FileText, Loader2, Pencil, PieChart, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { IS_BACKEND_ENABLED, reportApi } from '@/services/api';
import { dinasReportApi } from '@/services/dinasApi';
import { SatpolTopHeader } from '@/components/layout/SatpolLayout';
import { DinasTopHeader } from '@/components/layout/DinasLayout';
import { useToast } from '@/components/ui/Toast';
import {
  formatFullIndonesianPhone,
  formatIndonesianLocalPhone,
  generateRealisticDefaultPhone,
  validateIndonesianLocalPhone,
} from '@/lib/phoneHelpers';
import { cn } from '@/lib/utils';
import type { ViolationReportDto } from '@/types';

const DAY_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta',
  day: '2-digit',
});

const SHORT_MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Jakarta',
  month: 'short',
});

const LONG_DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

const TIME_24_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function getInitials(fullName: string | undefined): string {
  if (!fullName) return 'PT';
  const words = fullName
    .trim()
    .split(/\s+/)
    .filter((w) => /[a-zA-Z0-9]/.test(w));
  if (words.length === 0) return 'PT';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0] ?? ''}${words[words.length - 1]![0] ?? ''}`.toUpperCase();
}

function formatOfficerCode(userId: string | undefined): string {
  if (!userId) return '2201';
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) % 9000;
  }
  return String(1000 + Math.abs(hash));
}

const PHONE_STORAGE_PREFIX = 'patra_officer_phone_';

function readStoredPhone(userId: string | undefined): string | null {
  if (!userId) return null;
  try {
    const val = window.localStorage.getItem(`${PHONE_STORAGE_PREFIX}${userId}`);
    return val && val.trim() ? val.trim() : null;
  } catch {
    return null;
  }
}

function saveStoredPhone(userId: string | undefined, phone: string): void {
  if (!userId) return;
  try {
    window.localStorage.setItem(`${PHONE_STORAGE_PREFIX}${userId}`, phone);
  } catch {
    // Abaikan keterbatasan storage browser
  }
}

function formatReportDateParts(iso: string | null | undefined): {
  day: string;
  month: string;
  fullLine: string;
} {
  if (!iso) return { day: '--', month: '-', fullLine: '-' };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { day: '--', month: '-', fullLine: '-' };
  return {
    day: DAY_FORMATTER.format(date),
    month: SHORT_MONTH_FORMATTER.format(date),
    fullLine: `${LONG_DATE_FORMATTER.format(date)}, ${TIME_24_FORMATTER.format(date)}`,
  };
}

function buildMiniBars(reports: ViolationReportDto[], fallbackPattern: number[]): number[] {
  if (reports.length === 0) return fallbackPattern;
  const buckets = [0, 0, 0, 0, 0];
  const sorted = [...reports].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  sorted.forEach((_rep, idx) => {
    const bucketIdx = Math.min(4, Math.floor((idx / Math.max(1, sorted.length)) * 5));
    buckets[bucketIdx] = (buckets[bucketIdx] ?? 0) + 1;
  });
  const maxVal = Math.max(...buckets, 1);
  return buckets.map((val, idx) => {
    if (val === 0) return Math.max(24, Math.round((fallbackPattern[idx] ?? 35) * 0.55));
    return Math.max(28, Math.min(100, Math.round((val / maxVal) * 100)));
  });
}

function MiniBarChart({
  bars,
  mutedClass,
  accentClass,
}: {
  bars: number[];
  mutedClass: string;
  accentClass: string;
}) {
  return (
    <div className="flex h-16 items-end gap-1.5 sm:h-[72px]" aria-hidden="true">
      {bars.map((pct, idx) => {
        const isLast = idx === bars.length - 1;
        return (
          <span
            key={idx}
            style={{ height: `${pct}%` }}
            className={cn(
              'w-3 rounded-t-sm transition-all duration-500 sm:w-3.5',
              isLast ? accentClass : mutedClass,
            )}
          />
        );
      })}
    </div>
  );
}

export default function ProfilePage() {
  const { user, updatePhoneNumber } = useAuth();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [copied, setCopied] = useState(false);

  const isSatpol = user?.role === 'SATPOL_PP';

  const reportsQuery = useQuery({
    queryKey: ['profile', 'reports', user?.role, user?.region.id],
    queryFn: () =>
      isSatpol
        ? reportApi.list({ pageSize: 50 })
        : dinasReportApi.list({ pageSize: 50 }),
    enabled: Boolean(user),
    staleTime: 30_000,
  });

  const allReports = reportsQuery.data?.reports ?? [];
  const totalReports = reportsQuery.data?.pagination.totalItems ?? allReports.length;

  const stats = useMemo(() => {
    const resolvedReports = allReports.filter((r) => r.status === 'VALIDATED');
    const handledReports = allReports.filter((r) => r.status !== 'NEED_ACTION');
    const denom = Math.max(allReports.length, 1);
    const handledPct =
      allReports.length > 0 ? (handledReports.length / denom) * 100 : 0;
    const resolvedPct =
      allReports.length > 0 ? (resolvedReports.length / denom) * 100 : 0;

    return {
      total: totalReports,
      resolved: resolvedReports.length,
      handledPct,
      resolvedPct,
      allBars: buildMiniBars(allReports, [50, 100, 68, 34, 62]),
      resolvedBars: buildMiniBars(resolvedReports, [42, 100, 70, 36, 82]),
    };
  }, [allReports, totalReports]);

  const recentReports = useMemo(() => {
    return [...allReports]
      .sort((a, b) => {
        const aTime = new Date(a.validatedAt ?? a.updatedAt ?? a.createdAt).getTime();
        const bTime = new Date(b.validatedAt ?? b.updatedAt ?? b.createdAt).getTime();
        return bTime - aTime;
      })
      .slice(0, 6);
  }, [allReports]);

  const officerCode = useMemo(() => formatOfficerCode(user?.id), [user?.id]);
  const defaultOfficerPhone = useMemo(
    () => generateRealisticDefaultPhone(user?.id, user?.region.code),
    [user?.id, user?.region.code],
  );
  const resolvedPhone = useMemo(() => {
    const raw = IS_BACKEND_ENABLED
      ? (user?.noTelp?.trim() || defaultOfficerPhone)
      : (user?.noTelp?.trim() || readStoredPhone(user?.id) || defaultOfficerPhone);
    return formatFullIndonesianPhone(raw);
  }, [user?.noTelp, user?.id, defaultOfficerPhone]);

  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [phoneLocalDraft, setPhoneLocalDraft] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const initials = useMemo(() => getInitials(user?.fullName), [user?.fullName]);

  useEffect(() => {
    setIsEditingPhone(false);
    setPhoneError(null);
  }, [user?.id]);

  const handleStartEditPhone = () => {
    setPhoneLocalDraft(formatIndonesianLocalPhone(resolvedPhone));
    setPhoneError(null);
    setIsEditingPhone(true);
  };

  const handleCancelEditPhone = () => {
    if (isSavingPhone) return;
    setIsEditingPhone(false);
    setPhoneError(null);
  };

  const handleSavePhone = async (e: FormEvent) => {
    e.preventDefault();
    if (isSavingPhone) return;
    const result = validateIndonesianLocalPhone(phoneLocalDraft);
    if (!result.ok) {
      setPhoneError(result.message);
      return;
    }

    setIsSavingPhone(true);
    setPhoneError(null);
    try {
      const updated = await updatePhoneNumber(result.fullFormatted);
      if (!IS_BACKEND_ENABLED) {
        saveStoredPhone(user?.id, result.fullFormatted);
      }
      setIsEditingPhone(false);
      pushToast({
        variant: 'success',
        title: 'Nomor telepon disimpan',
        description: `Nomor aktif: ${updated.noTelp ?? result.fullFormatted}`,
      });
    } catch (err) {
      setPhoneError(
        err instanceof Error
          ? err.message
          : 'Gagal menyimpan nomor telepon ke server.',
      );
    } finally {
      setIsSavingPhone(false);
    }
  };

  const handleCopyOfficerId = async () => {
    const label = `Officer #${officerCode}`;
    try {
      await navigator.clipboard.writeText(label);
      setCopied(true);
      pushToast({
        variant: 'success',
        title: 'ID petugas disalin',
        description: `${label} berhasil disalin ke clipboard.`,
      });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      pushToast({
        variant: 'info',
        title: label,
        description: 'Salin manual ID petugas Anda.',
      });
    }
  };

  const reportDetailBase = isSatpol ? '/satpol/laporan' : '/dinas/validasi';

  return (
    <div className="mx-auto max-w-6xl px-4 pb-10 pt-4 sm:px-8 lg:py-7">
      {isSatpol ? <SatpolTopHeader title="Profile" /> : <DinasTopHeader title="Profile" />}

      <div className="mt-2 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        {/* Left Card: Officer Identity & Region Details */}
        <section className="animate-patra-enter rounded-3xl border border-slate-100 bg-white p-5 shadow-[0_12px_36px_-12px_rgba(4,63,165,0.14)] sm:p-6 lg:col-span-5 xl:col-span-4">
          {/* Inner Soft Blue Identity Block */}
          <div className="rounded-2xl bg-[#EEF4FB] p-5">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#002870] text-2xl font-extrabold tracking-wide text-white shadow-sm">
              {initials}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <h2 className="text-lg font-extrabold leading-snug text-[#002870]">
                {user?.fullName ?? 'Petugas PATRA'}
              </h2>
              <span className="inline-flex items-center rounded-full border border-emerald-500 bg-emerald-50 px-3 py-0.5 text-[11px] font-semibold text-emerald-700">
                Active
              </span>
            </div>

            <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-[#5278B0]">
              <span className="font-mono">Officer #{officerCode}</span>
              <button
                type="button"
                onClick={() => void handleCopyOfficerId()}
                aria-label="Salin ID petugas"
                title="Salin ID petugas"
                className="inline-flex h-5 w-5 items-center justify-center rounded text-primary/70 transition hover:bg-primary/10 hover:text-primary"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Structured Info Fields */}
          <div className="mt-5 space-y-4">
            <div>
              <p className="text-xs font-bold text-[#002870]">City Area</p>
              <div className="mt-1.5 rounded-lg bg-[#E9F1FD] px-3.5 py-2 text-xs font-medium text-[#043FA5]">
                {user ? `${user.region.city}, ${user.region.province}.` : '-'}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-[#002870]">Role</p>
              <div className="mt-1.5 rounded-lg bg-[#E9F1FD] px-3.5 py-2 text-xs font-medium text-[#043FA5]">
                {isSatpol
                  ? user?.region.satpolAgencyName ?? 'Satpol PP'
                  : user?.region.umkmAgencyName ?? 'Dinas UMKM'}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-[#002870]">Number</p>
                {!isEditingPhone && (
                  <button
                    type="button"
                    onClick={handleStartEditPhone}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-primary/80 transition hover:bg-[#E9F1FD] hover:text-primary"
                    aria-label="Edit nomor telepon"
                  >
                    <Pencil className="h-3 w-3" />
                    <span>Edit</span>
                  </button>
                )}
              </div>

              {isEditingPhone ? (
                <form
                  onSubmit={(e) => void handleSavePhone(e)}
                  className="mt-1.5 space-y-1.5"
                  noValidate
                >
                  <div className="flex items-center gap-1.5">
                    <div className="flex w-full min-w-0 items-center overflow-hidden rounded-lg border border-primary/40 bg-white focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                      <span
                        aria-hidden="true"
                        className="shrink-0 select-none border-r border-primary/15 bg-[#EEF4FD] px-2.5 py-1.5 font-mono text-xs font-bold text-[#002870]"
                      >
                        +62
                      </span>
                      <input
                        type="tel"
                        inputMode="numeric"
                        value={phoneLocalDraft}
                        disabled={isSavingPhone}
                        onChange={(e) => {
                          setPhoneLocalDraft(formatIndonesianLocalPhone(e.target.value));
                          if (phoneError) setPhoneError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') handleCancelEditPhone();
                        }}
                        autoFocus
                        placeholder="896 2956 4648"
                        aria-label="Nomor telepon petugas setelah +62"
                        className="w-full min-w-0 bg-transparent px-2.5 py-1.5 font-mono text-xs font-medium text-[#043FA5] placeholder:text-primary/35 focus:outline-none disabled:opacity-60"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isSavingPhone}
                      aria-label="Simpan nomor telepon"
                      title="Simpan"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white transition hover:bg-primary/90 disabled:opacity-60"
                    >
                      {isSavingPhone ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={isSavingPhone}
                      onClick={handleCancelEditPhone}
                      aria-label="Batal edit nomor telepon"
                      title="Batal"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 disabled:opacity-60"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {phoneError && (
                    <p className="text-[11px] font-medium text-red-600" role="alert">
                      {phoneError}
                    </p>
                  )}
                </form>
              ) : (
                <div className="mt-1.5 flex items-center justify-between gap-2 rounded-lg bg-[#E9F1FD] px-3.5 py-2 font-mono text-xs font-medium text-[#043FA5]">
                  <span className="truncate">{resolvedPhone}</span>
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-bold text-[#002870]">Email</p>
              <div className="mt-1.5 truncate rounded-lg bg-[#E9F1FD] px-3.5 py-2 font-mono text-xs font-medium text-[#043FA5]">
                {user?.email ?? '-'}
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: Performance Overview + Reports List */}
        <div className="space-y-5 lg:col-span-7 xl:col-span-8">
          <section className="animate-patra-enter">
            <h2 className="mb-3.5 text-lg font-extrabold text-[#002870]">
              Performance Overview
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* All Reports KPI Card */}
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-white px-5 py-5 shadow-[0_10px_28px_-12px_rgba(4,63,165,0.14)]">
                <div className="min-w-0">
                  <p className="font-mono text-3xl font-extrabold leading-none text-[#679CE5]">
                    {reportsQuery.isLoading ? '...' : stats.total}
                  </p>
                  <p className="mt-2 text-sm font-medium text-[#5278B0]">All Reports</p>
                  <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#5278B0]">
                    <PieChart className="h-3.5 w-3.5 text-[#002870]" />
                    <span className="font-mono">{stats.handledPct.toFixed(2)}%</span>
                  </p>
                </div>

                <MiniBarChart
                  bars={stats.allBars}
                  mutedClass="bg-[#DCE8F8]"
                  accentClass="bg-[#002870]"
                />
              </div>

              {/* Resolved KPI Card */}
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-white px-5 py-5 shadow-[0_10px_28px_-12px_rgba(4,63,165,0.14)]">
                <div className="min-w-0">
                  <p className="font-mono text-3xl font-extrabold leading-none text-[#16A34A]">
                    {reportsQuery.isLoading ? '...' : stats.resolved}
                  </p>
                  <p className="mt-2 text-sm font-medium text-[#5278B0]">Resolved</p>
                  <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#5278B0]">
                    <PieChart className="h-3.5 w-3.5 text-[#002870]" />
                    <span className="font-mono">{stats.resolvedPct.toFixed(2)}%</span>
                  </p>
                </div>

                <MiniBarChart
                  bars={stats.resolvedBars}
                  mutedClass="bg-[#DCFCE7]"
                  accentClass="bg-[#16A34A]"
                />
              </div>
            </div>
          </section>

          {/* Reports History Card */}
          <section className="animate-patra-enter rounded-3xl border border-slate-100 bg-white p-5 shadow-[0_12px_36px_-12px_rgba(4,63,165,0.14)] sm:p-6">
            <div className="flex items-center justify-between gap-2 pb-3">
              <h3 className="text-base font-bold text-[#002870]">Reports</h3>
              {allReports.length > 0 && (
                <button
                  type="button"
                  onClick={() => navigate(reportDetailBase)}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Lihat Semua ({stats.total})
                </button>
              )}
            </div>

            {reportsQuery.isLoading && (
              <div className="space-y-3 py-2">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-14 animate-pulse rounded-xl bg-slate-100"
                  />
                ))}
              </div>
            )}

            {!reportsQuery.isLoading && recentReports.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-2xl bg-canvas px-4 py-10 text-center">
                <FileText className="h-8 w-8 text-secondary" />
                <p className="mt-2 text-sm font-bold text-primary">
                  Belum ada riwayat laporan di {user?.region.city}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Laporan dari pemantauan CCTV atau tindak lanjut lapangan akan tampil di sini.
                </p>
              </div>
            )}

            {!reportsQuery.isLoading && recentReports.length > 0 && (
              <div className="divide-y divide-[#73A6E9]/45">
                {recentReports.map((rep) => {
                  const targetIso =
                    rep.status === 'VALIDATED'
                      ? rep.validatedAt ?? rep.updatedAt
                      : rep.actionSubmittedAt ?? rep.createdAt;
                  const dateParts = formatReportDateParts(targetIso);
                  const prefix =
                    rep.status === 'VALIDATED'
                      ? 'Resolved'
                      : rep.status === 'PENDING_VALIDATION'
                        ? 'Pending Review'
                        : rep.status === 'NEEDS_REVISION'
                          ? 'Needs Revision'
                          : 'Detected';

                  return (
                    <div
                      key={rep.id}
                      className="flex flex-col gap-3 py-3.5 first:pt-2 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="w-10 shrink-0 text-center">
                          <p className="font-mono text-lg font-extrabold leading-none text-[#002870]">
                            {dateParts.day}
                          </p>
                          <p className="mt-0.5 text-[11px] font-medium text-[#73A6E9]">
                            {dateParts.month}
                          </p>
                        </div>

                        <div className="min-w-0">
                          <p
                            title={rep.address}
                            className="truncate text-xs font-bold text-[#002870] sm:text-sm"
                          >
                            {rep.address}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] font-medium text-[#73A6E9]">
                            {prefix}: {dateParts.fullLine}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          navigate(`${reportDetailBase}/${encodeURIComponent(rep.id)}`)
                        }
                        className="shrink-0 self-end rounded-md bg-[#C8DDF6] px-4 py-1.5 text-xs font-semibold text-[#002870] transition hover:bg-primary hover:text-white sm:self-center"
                      >
                        View Report
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
