import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  FileText,
  MapPin,
  Search,
  Users,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { reportApi } from '@/services/api';
import { SatpolTopHeader } from '@/components/layout/SatpolLayout';
import { formatWibDateTime, REPORT_STATUS_META } from '@/lib/formatters';
import type { ReportStatus } from '@/types';
import { cn } from '@/lib/utils';

type FilterTab = 'ALL' | ReportStatus;

const STATUS_TABS: Array<{ key: FilterTab; label: string }> = [
  { key: 'ALL', label: 'Semua' },
  { key: 'NEED_ACTION', label: 'Perlu Ditindak' },
  { key: 'NEEDS_REVISION', label: 'Perlu Revisi' },
  { key: 'PENDING_VALIDATION', label: 'Menunggu Validasi Dinas' },
  { key: 'VALIDATED', label: 'Tervalidasi' },
];

export default function ReportsListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [search, setSearch] = useState('');

  const reportsQuery = useQuery({
    queryKey: ['reports', 'list', user?.region.id, activeTab],
    queryFn: () =>
      reportApi.list({
        statuses: activeTab === 'ALL' ? undefined : [activeTab],
        pageSize: 50,
      }),
    enabled: Boolean(user),
    staleTime: 20_000,
  });

  const reports = reportsQuery.data?.reports ?? [];

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reports;
    return reports.filter(
      (r) =>
        r.reportCode.toLowerCase().includes(q) ||
        r.address.toLowerCase().includes(q) ||
        r.cameraId.toLowerCase().includes(q),
    );
  }, [reports, search]);

  return (
    <div className="mx-auto max-w-7xl px-5 py-7 sm:px-8">
      <SatpolTopHeader
        title="Reports & Actions"
        subtitle={`Penindakan & Riwayat Laporan • ${user?.region.city ?? ''}`}
      />

      {/* Filter & Search Bar */}
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'rounded-full border px-4 py-2 text-xs font-semibold transition',
                  active
                    ? 'border-primary bg-primary text-white shadow-sm'
                    : 'border-accent/60 bg-white text-primary hover:bg-canvas',
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full lg:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kode laporan / alamat..."
            className="w-full rounded-full border border-accent/70 bg-white py-2 pl-10 pr-4 text-xs text-slate-800 placeholder:text-slate-400 focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      {/* Loading */}
      {reportsQuery.isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl border border-accent/40 bg-white"
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!reportsQuery.isLoading && filteredReports.length === 0 && (
        <div className="rounded-2xl border border-accent/50 bg-white px-6 py-14 text-center">
          <FileText className="mx-auto h-10 w-10 text-secondary" />
          <p className="mt-3 text-base font-bold text-primary">
            Belum ada laporan pada filter ini
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Laporan baru otomatis masuk saat CCTV mendeteksi PKL menetap atau melalui Capture &amp;
            Report.
          </p>
        </div>
      )}

      {/* Unified Report List (1 Halaman Tunggal — Gabungan Tugas & Riwayat) */}
      <div className="space-y-3.5">
        {filteredReports.map((rep) => {
          const meta = REPORT_STATUS_META[rep.status];
          const needsWork =
            rep.status === 'NEED_ACTION' || rep.status === 'NEEDS_REVISION';

          return (
            <article
              key={rep.id}
              onClick={() => navigate(`/satpol/laporan/${encodeURIComponent(rep.id)}`)}
              className="group cursor-pointer overflow-hidden rounded-2xl border border-accent/50 bg-white p-4 shadow-sm transition hover:border-primary/45 hover:shadow-md"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                {/* Before Snapshot Thumbnail (STRICT: NO FACE BLUR on internal government portal) */}
                <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-video-frame sm:w-44">
                  <img
                    src={rep.beforeImageUrl}
                    alt={`Bukti ${rep.reportCode}`}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute left-2 top-2 rounded bg-slate-900/75 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
                    {rep.source === 'AUTO_AI' ? 'AUTO AI' : 'MANUAL'}
                  </span>
                </div>

                {/* Details */}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-primary">
                      {rep.reportCode}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
                        meta.badgeClass,
                      )}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dotClass)} />
                      {meta.label}
                    </span>
                    {rep.relocationRequested && (
                      <span className="rounded-full bg-accent/35 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                        Pengajuan Relokasi
                      </span>
                    )}
                  </div>

                  <p className="flex items-start gap-1.5 text-sm font-bold text-slate-900">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{rep.address}</span>
                  </p>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-secondary" />
                      {rep.detectedCount} PKL terdeteksi
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                      <Clock className="h-3.5 w-3.5 text-secondary" />
                      {formatWibDateTime(rep.createdAt)}
                    </span>
                  </div>

                  {rep.status === 'NEEDS_REVISION' && rep.revisionReason && (
                    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <p className="line-clamp-2">
                        <strong>Catatan Revisi Dinas:</strong> {rep.revisionReason}
                      </p>
                    </div>
                  )}
                </div>

                {/* Action CTA */}
                <div className="flex shrink-0 items-center justify-end">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold transition',
                      needsWork
                        ? 'bg-primary text-white group-hover:bg-primary/90'
                        : 'bg-[#E9F1FD] text-primary group-hover:bg-primary group-hover:text-white',
                    )}
                  >
                    <span>{needsWork ? 'Tindak Lanjuti' : 'Lihat Detail'}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
