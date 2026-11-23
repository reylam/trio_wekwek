import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Compass,
  Loader2,
  Search,
} from 'lucide-react';
import { DinasTopHeader } from '@/components/layout/DinasLayout';
import { useAuth } from '@/context/AuthContext';
import {
  ENFORCEMENT_ACTION_LABELS,
  formatWibDateTime,
  REPORT_STATUS_META,
} from '@/lib/formatters';
import { dinasReportApi } from '@/services/dinasApi';
import type { ReportStatus } from '@/types';
import { cn } from '@/lib/utils';

type ValidationTabKey =
  | 'PENDING_VALIDATION'
  | 'RELOCATION_QUEUE'
  | 'VALIDATED'
  | 'NEEDS_REVISION';

const VALIDATION_TABS: Array<{ key: ValidationTabKey; label: string }> = [
  { key: 'PENDING_VALIDATION', label: 'Menunggu Validasi' },
  { key: 'RELOCATION_QUEUE', label: 'Pengajuan Relokasi' },
  { key: 'VALIDATED', label: 'Tervalidasi' },
  { key: 'NEEDS_REVISION', label: 'Ditolak / Revisi' },
];

export default function ValidationListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<ValidationTabKey>('PENDING_VALIDATION');
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);

  const queryParams = (() => {
    const base = {
      search: appliedSearch || undefined,
      page,
      pageSize: 10,
    };
    if (activeTab === 'RELOCATION_QUEUE') {
      return {
        ...base,
        relocationRequested: true,
        statuses: ['PENDING_VALIDATION', 'VALIDATED'] as ReportStatus[],
      };
    }
    return {
      ...base,
      statuses: [activeTab] as ReportStatus[],
    };
  })();

  const reportsQuery = useQuery({
    queryKey: ['dinas', 'reports', 'list', user?.region.id, activeTab, appliedSearch, page],
    queryFn: () => dinasReportApi.list(queryParams),
    placeholderData: (prev) => prev,
  });

  const reports = reportsQuery.data?.reports ?? [];
  const pagination = reportsQuery.data?.pagination ?? {
    page: 1,
    pageSize: 10,
    totalItems: 0,
    totalPages: 0,
  };

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    setAppliedSearch(searchInput.trim());
  };

  const handleTabChange = (nextTab: ValidationTabKey) => {
    setActiveTab(nextTab);
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <DinasTopHeader />

      <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter status validasi">
            {VALIDATION_TABS.map((tab) => {
              const isSelected = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => handleTabChange(tab.key)}
                  className={cn(
                    'rounded-full px-4 py-2 text-xs font-semibold transition',
                    isSelected
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-canvas text-slate-600 hover:bg-accent/30 hover:text-primary',
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <form onSubmit={handleSearchSubmit} className="flex w-full gap-2 lg:w-80">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchInput(val);
                  if (val === '' && appliedSearch !== '') {
                    setPage(1);
                    setAppliedSearch('');
                  }
                }}
                placeholder="Cari kode laporan / alamat..."
                className="w-full rounded-xl border border-slate-200 bg-canvas/70 py-2 pl-9 pr-3 text-xs text-slate-800 outline-none transition focus:border-primary focus:bg-white"
              />
            </div>
            <button
              type="submit"
              className="rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-white hover:bg-primary/90"
            >
              Cari
            </button>
          </form>
        </div>

        {reportsQuery.isLoading ? (
          <div className="flex min-h-[260px] items-center justify-center gap-3 text-sm font-semibold text-primary">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Memuat daftar laporan validasi...</span>
          </div>
        ) : reportsQuery.isError ? (
          <div className="py-12 text-center">
            <AlertCircle className="mx-auto h-9 w-9 text-red-500" />
            <p className="mt-2 text-sm font-semibold text-slate-800">
              Gagal memuat daftar laporan
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {(reportsQuery.error as Error | null)?.message}
            </p>
          </div>
        ) : reports.length === 0 ? (
          <div className="my-6 rounded-2xl border border-dashed border-slate-200 bg-canvas/60 px-6 py-12 text-center">
            <p className="text-sm font-semibold text-slate-700">
              Tidak ada laporan pada kategori ini
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Pilih tab status lain atau ubah kata kunci pencarian Anda.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="mt-5 hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="py-3 pr-4">Kode & Waktu</th>
                    <th className="py-3 pr-4">Lokasi Ruas Jalan</th>
                    <th className="py-3 pr-4">PKL (AI / Aktual)</th>
                    <th className="py-3 pr-4">Tindakan Satpol PP</th>
                    <th className="py-3 pr-4">Relokasi</th>
                    <th className="py-3 pr-4">Status</th>
                    <th className="py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {reports.map((rep) => {
                    const statusMeta = REPORT_STATUS_META[rep.status];
                    return (
                      <tr
                        key={rep.id}
                        onClick={() => navigate(`/dinas/validasi/${rep.id}`)}
                        className="cursor-pointer transition hover:bg-canvas/70"
                      >
                        <td className="py-3.5 pr-4 align-top">
                          <p className="font-mono font-bold text-primary">{rep.reportCode}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {formatWibDateTime(rep.actionSubmittedAt ?? rep.createdAt)}
                          </p>
                        </td>
                        <td className="max-w-xs py-3.5 pr-4 align-top">
                          <p className="line-clamp-2 font-semibold text-slate-800">
                            {rep.address}
                          </p>
                        </td>
                        <td className="py-3.5 pr-4 align-top font-mono font-semibold text-slate-700">
                          {rep.detectedCount} / {rep.actualPklCount ?? '-'}
                        </td>
                        <td className="py-3.5 pr-4 align-top text-slate-700">
                          {rep.actionType ? ENFORCEMENT_ACTION_LABELS[rep.actionType] : '-'}
                        </td>
                        <td className="py-3.5 pr-4 align-top">
                          {rep.relocationSiteId ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                              <Compass className="h-3 w-3" />
                              Ditetapkan
                            </span>
                          ) : rep.relocationRequested ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                              <Compass className="h-3 w-3" />
                              Diajukan
                            </span>
                          ) : (
                            <span className="text-slate-400">Tidak</span>
                          )}
                        </td>
                        <td className="py-3.5 pr-4 align-top">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
                              statusMeta.badgeClass,
                            )}
                          >
                            {statusMeta.shortLabel}
                          </span>
                        </td>
                        <td className="py-3.5 text-right align-top">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/dinas/validasi/${rep.id}`);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#E9F1FD] px-3 py-1.5 font-semibold text-primary transition hover:bg-primary hover:text-white"
                          >
                            <span>
                              {rep.status === 'PENDING_VALIDATION'
                                ? 'Periksa'
                                : 'Detail'}
                            </span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="mt-4 space-y-3 md:hidden">
              {reports.map((rep) => {
                const statusMeta = REPORT_STATUS_META[rep.status];
                return (
                  <button
                    key={rep.id}
                    type="button"
                    onClick={() => navigate(`/dinas/validasi/${rep.id}`)}
                    className="w-full rounded-2xl border border-slate-200 bg-canvas/50 p-4 text-left transition hover:border-primary"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-primary">
                        {rep.reportCode}
                      </span>
                      <span
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-[10px] font-semibold',
                          statusMeta.badgeClass,
                        )}
                      >
                        {statusMeta.shortLabel}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-800">{rep.address}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span>{formatWibDateTime(rep.actionSubmittedAt ?? rep.createdAt)}</span>
                      {rep.relocationRequested && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 font-semibold text-primary">
                          {rep.relocationSiteId ? 'Relokasi Ditetapkan' : 'Pengajuan Relokasi'}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Pagination */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500">
              <span>
                Total <strong className="text-slate-800">{pagination.totalItems}</strong>{' '}
                laporan
              </span>
              {pagination.totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span>Sebelumnya</span>
                  </button>
                  <span className="font-mono text-xs font-semibold text-slate-700">
                    Hal {pagination.page} / {pagination.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-40"
                  >
                    <span>Berikutnya</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
