import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  FileText,
  Search,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { reportApi } from '@/services/api';
import { SatpolTopHeader } from '@/components/layout/SatpolLayout';
import { SatpolRadioOfficerSvg } from '@/components/reports/SatpolIllustrations';
import { formatWibDateTime } from '@/lib/formatters';
import {
  buildPaginationItems,
  computeDurationDisplay,
  computeReportCounts,
} from '@/lib/reportHelpers';
import type { ReportStatus, ViolationReportDto } from '@/types';
import { cn } from '@/lib/utils';

type FilterTab = 'ALL' | ReportStatus;

const PAGE_SIZE = 10;

const KPI_CARDS: Array<{
  status: ReportStatus;
  label: string;
  countClass: string;
  labelClass: string;
  barClass: string;
}> = [
  {
    status: 'NEED_ACTION',
    label: 'Active Violations',
    countClass: 'text-[#C80000]',
    labelClass: 'text-[#C80000]',
    barClass: 'bg-[#C80000]',
  },
  {
    status: 'PENDING_VALIDATION',
    label: 'Pending Review',
    countClass: 'text-[#EAB308]',
    labelClass: 'text-[#CA8A04]',
    barClass: 'bg-[#EAB308]',
  },
  {
    status: 'NEEDS_REVISION',
    label: 'Needs Revision',
    countClass: 'text-[#F97316]',
    labelClass: 'text-[#EA580C]',
    barClass: 'bg-[#F97316]',
  },
  {
    status: 'VALIDATED',
    label: 'Resolved',
    countClass: 'text-[#16A34A]',
    labelClass: 'text-[#16A34A]',
    barClass: 'bg-[#16A34A]',
  },
];

const STATUS_BADGE_MAP: Record<
  ReportStatus,
  { label: string; className: string; actionLabel: string }
> = {
  NEED_ACTION: {
    label: 'Active Violation',
    className: 'border-red-300 bg-red-50 text-red-600',
    actionLabel: 'Follow Up',
  },
  PENDING_VALIDATION: {
    label: 'Pending Review',
    className: 'border-yellow-300 bg-yellow-50 text-yellow-700',
    actionLabel: 'View Details',
  },
  NEEDS_REVISION: {
    label: 'Needs Revision',
    className: 'border-orange-300 bg-orange-50 text-orange-600',
    actionLabel: 'Revise Proof',
  },
  VALIDATED: {
    label: 'Resolved',
    className: 'border-emerald-300 bg-emerald-50 text-emerald-700',
    actionLabel: 'View Details',
  },
};

export default function ReportsListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [previewMedia, setPreviewMedia] = useState<ViolationReportDto | null>(null);

  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollState, setScrollState] = useState({
    progress: 0,
    thumbRatio: 0.3,
    canScroll: false,
  });

  // Gunakan pageSize maksimal 50 sesuai listReportsQuerySchema BE-Patra
  const reportsQuery = useQuery({
    queryKey: ['reports', 'list', user?.region.id, 'all-summary'],
    queryFn: () => reportApi.list({ pageSize: 50 }),
    enabled: Boolean(user),
    staleTime: 20_000,
  });

  const allReports = reportsQuery.data?.reports ?? [];
  const counts = useMemo(() => computeReportCounts(allReports), [allReports]);

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allReports.filter((r) => {
      if (activeTab !== 'ALL' && r.status !== activeTab) return false;
      if (!q) return true;
      return (
        r.reportCode.toLowerCase().includes(q) ||
        r.address.toLowerCase().includes(q) ||
        r.cameraId.toLowerCase().includes(q)
      );
    });
  }, [allReports, activeTab, search]);

  const totalPages = Math.max(1, Math.ceil(filteredReports.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedReports = useMemo(
    () => filteredReports.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredReports, safePage],
  );
  const paginationItems = useMemo(
    () => buildPaginationItems(safePage, totalPages),
    [safePage, totalPages],
  );

  const syncScrollIndicator = useCallback(() => {
    const el = tableScrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll <= 2) {
      setScrollState({ progress: 0, thumbRatio: 1, canScroll: false });
      return;
    }
    const thumbRatio = Math.max(0.22, Math.min(0.85, el.clientWidth / el.scrollWidth));
    const progress = Math.max(0, Math.min(1, el.scrollLeft / maxScroll));
    setScrollState({ progress, thumbRatio, canScroll: true });
  }, []);

  useEffect(() => {
    syncScrollIndicator();
    const el = tableScrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(syncScrollIndicator);
    ro.observe(el);
    return () => ro.disconnect();
  }, [syncScrollIndicator, pagedReports.length]);

  const handleToggleStatusFilter = (status: ReportStatus) => {
    setPage(1);
    setActiveTab((prev) => (prev === status ? 'ALL' : status));
  };

  const thumbWidthPct = Math.round(scrollState.thumbRatio * 100);
  const thumbLeftPct = Math.round(
    scrollState.progress * (100 - thumbWidthPct),
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-8 sm:py-7">
      <SatpolTopHeader title="Reports & Actions" />

      {/* Summary KPI Card + Ilustrasi Petugas (Mobile 2x2 + Petugas, Desktop 4x1 + Petugas) */}
      <section className="relative mb-6 mt-5 sm:mt-6">
        <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200/70 bg-white px-4 py-4 pr-[126px] shadow-[0_12px_32px_-12px_rgba(4,63,165,0.14)] sm:px-7 sm:py-5 sm:pr-[148px] lg:mr-24 lg:pr-20">
          <div className="grid grid-cols-2 gap-x-3 gap-y-3 lg:grid-cols-4 lg:gap-6">
            {KPI_CARDS.map((card) => {
              const count = counts[card.status];
              const isSelected = activeTab === card.status;
              return (
                <button
                  key={card.status}
                  type="button"
                  onClick={() => handleToggleStatusFilter(card.status)}
                  className="group relative px-2 py-1 text-left transition hover:opacity-80"
                >
                  <p
                    className={cn(
                      'font-mono text-xl font-extrabold leading-tight sm:text-2xl lg:text-3xl',
                      card.countClass,
                    )}
                  >
                    {reportsQuery.isLoading ? '...' : count}
                  </p>
                  <p
                    className={cn(
                      'mt-0.5 text-[11px] font-bold leading-tight sm:text-xs',
                      card.labelClass,
                    )}
                  >
                    {card.label}
                  </p>
                  <span
                    className={cn(
                      'mt-1.5 block h-0.5 rounded-full transition-all',
                      isSelected ? cn('w-10 opacity-100', card.barClass) : 'w-0 opacity-0',
                    )}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Ilustrasi Petugas HT menempel rapi di dasar kartu (tidak mengambang) */}
        <SatpolRadioOfficerSvg className="pointer-events-none absolute bottom-0 right-0 h-[176px] w-[128px] rounded-br-3xl sm:h-[188px] sm:w-[144px] lg:bottom-0 lg:right-2 lg:h-[150px] lg:w-[132px] lg:rounded-br-none" />
      </section>

      {/* Toolbar Filter Status + Search (Mempertahankan data-tour untuk Walkthrough) */}
      <div
        data-tour="satpol-reports-filters"
        className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('ALL');
              setPage(1);
            }}
            className={cn(
              'rounded-full border px-3 py-1.5 text-[11px] font-semibold transition sm:px-3.5 sm:text-xs',
              activeTab === 'ALL'
                ? 'border-primary bg-primary text-white shadow-sm'
                : 'border-accent/60 bg-white text-primary hover:bg-canvas',
            )}
          >
            Semua ({counts.all})
          </button>
          {KPI_CARDS.map((card) => {
            const active = activeTab === card.status;
            return (
              <button
                key={card.status}
                type="button"
                onClick={() => handleToggleStatusFilter(card.status)}
                className={cn(
                  'rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition sm:px-3 sm:text-xs',
                  active
                    ? 'border-primary bg-primary text-white shadow-sm'
                    : 'border-accent/60 bg-white text-slate-600 hover:border-primary/40 hover:text-primary',
                )}
              >
                {card.label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/60"
            aria-hidden="true"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Cari ID laporan atau lokasi..."
            aria-label="Cari laporan"
            className="h-9 w-full rounded-full border border-primary/35 bg-[#EEF4FD] pl-10 pr-8 text-xs text-primary placeholder:text-primary/50 transition focus:border-primary focus:bg-white focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setPage(1);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-primary/60 hover:text-primary"
              aria-label="Hapus pencarian"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {reportsQuery.isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-xl border border-accent/30 bg-white"
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!reportsQuery.isLoading && pagedReports.length === 0 && (
        <div className="rounded-3xl border border-accent/50 bg-white px-6 py-14 text-center shadow-sm">
          <FileText className="mx-auto h-10 w-10 text-secondary" />
          <p className="mt-3 text-base font-bold text-primary">
            Belum ada laporan pada filter ini
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Laporan baru otomatis masuk saat CCTV mendeteksi PKL menetap atau melalui
            tombol Capture &amp; Report.
          </p>
        </div>
      )}

      {/* Tabel Navy Terpadu (Horizontal Scroll di Mobile + Progress Bar Biru Sesuai Mockup) */}
      {!reportsQuery.isLoading && pagedReports.length > 0 && (
        <>
          <div
            ref={tableScrollRef}
            onScroll={syncScrollIndicator}
            className="overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:[scrollbar-width:auto]"
          >
            <table className="w-full min-w-[780px] border-separate border-spacing-x-1 border-spacing-y-1.5 text-left">
              <thead>
                <tr className="text-xs font-bold text-white">
                  <th className="rounded-md bg-[#002870] px-3 py-2.5">ID</th>
                  <th className="rounded-md bg-[#002870] px-3 py-2.5 text-center">
                    Media
                  </th>
                  <th className="rounded-md bg-[#002870] px-3.5 py-2.5">Location</th>
                  <th className="rounded-md bg-[#002870] px-3.5 py-2.5">
                    Detected Time
                  </th>
                  <th className="rounded-md bg-[#002870] px-3.5 py-2.5">Duration</th>
                  <th className="rounded-md bg-[#002870] px-3.5 py-2.5 text-center">
                    Status
                  </th>
                  <th className="rounded-md bg-[#002870] px-3.5 py-2.5 text-center">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="text-xs">
                {pagedReports.map((rep) => {
                  const statusCfg = STATUS_BADGE_MAP[rep.status];
                  const duration = computeDurationDisplay(rep);
                  return (
                    <tr
                      key={rep.id}
                      onClick={() =>
                        navigate(`/satpol/laporan/${encodeURIComponent(rep.id)}`)
                      }
                      className="cursor-pointer rounded-xl transition hover:bg-[#EEF4FD]/70"
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono font-bold text-primary">
                        {rep.reportCode}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewMedia(rep);
                          }}
                          className="font-semibold text-primary underline underline-offset-2 hover:text-secondary"
                        >
                          Link
                        </button>
                      </td>
                      <td className="max-w-[210px] px-3.5 py-2.5">
                        <p
                          title={rep.address}
                          className="truncate font-semibold text-primary"
                        >
                          {rep.address}
                        </p>
                        {rep.status === 'NEEDS_REVISION' && rep.revisionReason && (
                          <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-amber-700">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            <span className="truncate">{rep.revisionReason}</span>
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 font-medium text-primary/90">
                        {formatWibDateTime(rep.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 font-semibold text-primary">
                        {duration.label}
                      </td>
                      <td className="px-3.5 py-2.5 text-center">
                        <span
                          className={cn(
                            'inline-block min-w-[122px] rounded-full border px-3 py-1 text-[11px] font-semibold',
                            statusCfg.className,
                          )}
                        >
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/satpol/laporan/${encodeURIComponent(rep.id)}`);
                          }}
                          className="min-w-[110px] rounded-md border border-[#9EC1EB] bg-[#DCE8F8] px-3.5 py-1 text-[11px] font-semibold text-primary transition hover:bg-primary hover:text-white"
                        >
                          {statusCfg.actionLabel}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Indikator Scroll Horizontal Biru di Mobile (Sesuai Reports & Actions - Mobile.png) */}
          {scrollState.canScroll && (
            <div className="mt-2.5 px-1 md:hidden" aria-hidden="true">
              <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80">
                <div
                  className="absolute inset-y-0 rounded-full bg-secondary transition-[left] duration-75"
                  style={{
                    width: `${thumbWidthPct}%`,
                    left: `${thumbLeftPct}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Pagination Pill (Tengah di Mobile, Kanan di Desktop sesuai Mockup) */}
          {totalPages > 1 && (
            <div className="mt-5 flex items-center justify-center gap-2 md:justify-end">
              {safePage > 1 && (
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E9F1FD] text-primary transition hover:bg-primary hover:text-white"
                  aria-label="Halaman sebelumnya"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
              )}

              <div className="inline-flex items-center gap-1 rounded-full bg-[#E9F1FD] px-2 py-1">
                {paginationItems.map((item, idx) =>
                  item === 'ellipsis' ? (
                    <span
                      key={`ellipsis-${idx}`}
                      className="px-1.5 text-xs font-semibold text-primary/70"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setPage(item)}
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition',
                        safePage === item
                          ? 'bg-white text-primary shadow-sm'
                          : 'text-primary/75 hover:bg-white/60',
                      )}
                    >
                      {item}
                    </button>
                  ),
                )}
              </div>

              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E9F1FD] text-primary transition hover:bg-primary hover:text-white disabled:opacity-40"
                aria-label="Halaman berikutnya"
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Modal Pratinjau Foto Before dari kolom Media Link (TANPA BLUR WAJAH) */}
      {previewMedia && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-[1px]"
          onClick={() => setPreviewMedia(null)}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <div>
                <p className="font-mono text-xs font-extrabold text-primary">
                  {previewMedia.reportCode} • Bukti Awal (Before)
                </p>
                <p className="text-xs text-slate-500">{previewMedia.address}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewMedia(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                aria-label="Tutup pratinjau foto"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="bg-video-frame">
              <img
                src={previewMedia.beforeImageUrl}
                alt={`Bukti ${previewMedia.reportCode}`}
                className="max-h-[70vh] w-full object-contain"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-xs">
              <span className="font-mono text-slate-500">
                {formatWibDateTime(previewMedia.createdAt)} • {previewMedia.detectedCount}{' '}
                PKL
              </span>
              <button
                type="button"
                onClick={() => {
                  const targetId = previewMedia.id;
                  setPreviewMedia(null);
                  navigate(`/satpol/laporan/${encodeURIComponent(targetId)}`);
                }}
                className="rounded-xl bg-primary px-4 py-2 font-bold text-white hover:bg-primary/90"
              >
                Buka Halaman Detail
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
