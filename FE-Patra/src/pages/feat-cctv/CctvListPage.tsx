import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cctvApi } from '@/services/api';
import { SatpolTopHeader } from '@/components/layout/SatpolLayout';
import CameraThumbnail from '@/components/cctv/CameraThumbnail';
import { paginateList } from '@/lib/cameraThumbnailHelpers';
import { buildPaginationItems } from '@/lib/reportHelpers';
import { cn } from '@/lib/utils';

const CAMERAS_PER_PAGE = 12;

export default function CctvListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedDistrict, user?.region.id]);

  const camerasQuery = useQuery({
    queryKey: ['cctv', 'list', user?.region.id],
    queryFn: () => cctvApi.list(),
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  const allCameras = camerasQuery.data?.cameras ?? [];

  const districts = useMemo(() => {
    const set = new Set<string>();
    for (const cam of allCameras) {
      if (cam.district) set.add(cam.district);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [allCameras]);

  const filteredCameras = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allCameras.filter((cam) => {
      if (selectedDistrict && (cam.district ?? '') !== selectedDistrict) {
        return false;
      }
      if (!q) return true;
      return (
        cam.name.toLowerCase().includes(q) ||
        cam.regionLabel.toLowerCase().includes(q) ||
        (cam.district ?? '').toLowerCase().includes(q) ||
        (cam.subdistrict ?? '').toLowerCase().includes(q) ||
        (cam.facilityCategory ?? '').toLowerCase().includes(q)
      );
    });
  }, [allCameras, searchQuery, selectedDistrict]);

  const pageData = useMemo(
    () => paginateList(filteredCameras, currentPage, CAMERAS_PER_PAGE),
    [filteredCameras, currentPage],
  );

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-6 pt-3 sm:px-8 lg:py-7">
      <SatpolTopHeader />

      {/* Toolbar Region-Locked Per Kota/Kabupaten (matching CCTV Monitoring (Satpol PP) - Mobile.png & Desktop) */}
      <div
        data-tour="satpol-cctv-toolbar"
        className="mb-5 flex flex-col gap-2.5 rounded-2xl lg:mb-6 lg:flex-row lg:items-center lg:justify-between"
      >
        <div className="hidden items-center gap-2.5 lg:flex">
          <div className="inline-flex h-9 min-w-0 items-center gap-2 rounded-full border border-primary/25 bg-white px-3.5 text-xs font-semibold text-primary shadow-sm">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-500" />
            <span className="truncate">Wilayah Tugas: {user?.region.city}</span>
          </div>

          <div className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-primary/40 bg-[#EEF4FD] px-3.5 text-xs font-semibold text-primary">
            <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
            <span>
              Total Cameras:{' '}
              {selectedDistrict || searchQuery
                ? `${filteredCameras.length} / ${allCameras.length}`
                : allCameras.length}
            </span>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
          <div className="flex w-full items-center gap-2 sm:flex-1 lg:w-auto lg:flex-none">
            <div className="relative min-w-0 flex-1 lg:w-72 lg:flex-none">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/60"
                aria-hidden="true"
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                aria-label="Cari kamera CCTV"
                className="h-10 w-full rounded-full border border-primary/40 bg-[#EEF4FD] pl-10 pr-8 text-sm text-primary placeholder:text-primary/50 transition focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-primary/60 hover:bg-primary/10 hover:text-primary"
                  aria-label="Hapus pencarian"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-primary/40 bg-[#EEF4FD] px-3 text-[11px] font-semibold text-primary lg:hidden">
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
              <span>
                Total Cameras:{' '}
                {selectedDistrict || searchQuery
                  ? `${filteredCameras.length}/${allCameras.length}`
                  : allCameras.length}
              </span>
            </div>
          </div>

          {districts.length > 1 && (
            <div className="relative w-full sm:w-auto">
              <select
                value={selectedDistrict}
                onChange={(e) => setSelectedDistrict(e.target.value)}
                aria-label="Filter kecamatan"
                className="h-9 w-full appearance-none rounded-full border border-primary/40 bg-[#EEF4FD] pl-4 pr-10 text-xs font-semibold text-primary transition focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/15 sm:h-10 sm:w-auto"
              >
                <option value="">Semua Kecamatan ({districts.length})</option>
                {districts.map((dist) => (
                  <option key={dist} value={dist}>
                    Kec. {dist}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/70"
                aria-hidden="true"
              />
            </div>
          )}
        </div>
      </div>

      {/* Loading State */}
      {camerasQuery.isLoading && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="overflow-hidden rounded-2xl border border-accent/40 bg-white shadow-sm"
            >
              <div className="aspect-video animate-pulse bg-slate-200" />
              <div className="space-y-2 bg-[#E9F1FD] p-3.5">
                <div className="h-4 w-2/3 animate-pulse rounded bg-accent/50" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-accent/35" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {camerasQuery.isError && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50/80 px-6 py-12 text-center">
          <AlertCircle className="h-9 w-9 text-red-600" />
          <p className="mt-3 text-sm font-bold text-red-800">
            Gagal memuat katalog CCTV wilayah Anda
          </p>
          <p className="mt-1 max-w-md text-xs text-red-700">
            {camerasQuery.error instanceof Error
              ? camerasQuery.error.message
              : 'Terjadi kesalahan saat menghubungi server.'}
          </p>
          <button
            type="button"
            onClick={() => void camerasQuery.refetch()}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary/90"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Muat Ulang
          </button>
        </div>
      )}

      {/* Empty Search Result */}
      {!camerasQuery.isLoading && !camerasQuery.isError && filteredCameras.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-accent/50 bg-white px-6 py-14 text-center">
          <Camera className="h-10 w-10 text-secondary" />
          <p className="mt-3 text-base font-bold text-primary">
            Tidak ada kamera yang sesuai
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Coba kata kunci nama jalan, kecamatan, atau kategori fasilitas lain.
          </p>
          {(searchQuery || selectedDistrict) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedDistrict('');
              }}
              className="mt-4 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary/90"
            >
              Reset Filter
            </button>
          )}
        </div>
      )}

      {/* 3-Column Camera Card Grid (12 kamera per halaman agar decoder browser tetap ringan) */}
      {!camerasQuery.isLoading && !camerasQuery.isError && filteredCameras.length > 0 && (
        <>
          <div
            data-tour="satpol-cctv-grid"
            className="grid grid-cols-1 gap-5 rounded-2xl md:grid-cols-2 xl:grid-cols-3"
          >
            {pageData.items.map((camera, idx) => (
            <article
              key={camera.id}
              onClick={() => navigate(`/satpol/cctv/${encodeURIComponent(camera.id)}`)}
              style={{ animationDelay: `${Math.min(idx, 11) * 40}ms` }}
              className="animate-patra-enter group cursor-pointer overflow-hidden rounded-2xl border border-accent/50 bg-[#E6EFFC] shadow-sm transition duration-300 hover:-translate-y-1 hover:border-primary/55 hover:shadow-lg"
            >
              {/* Live Lazy-Loaded Camera Thumbnail */}
              <div className="relative aspect-video w-full overflow-hidden bg-video-frame">
                <CameraThumbnail camera={camera} />

                {camera.hasActiveReport && (
                  <span className="absolute bottom-0 right-0 rounded-tl-xl bg-[#B91C1C] px-3 py-1 text-[11px] font-bold text-white shadow">
                    Active Violation
                  </span>
                )}
              </div>

              {/* Metadata Footer */}
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold text-primary">
                    {camera.name}
                  </h2>
                  <p className="mt-0.5 truncate text-xs text-primary/70">
                    {camera.facilityCategory ??
                      (camera.roiPolygon ? 'Sidewalk Restricted Zone' : 'Public Corridor')}
                    {camera.district ? ` • ${camera.district}` : ''}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/satpol/cctv/${encodeURIComponent(camera.id)}`);
                  }}
                  className="shrink-0 rounded-full bg-[#B9D3F5] px-4 py-1.5 text-xs font-semibold text-primary transition group-hover:bg-primary group-hover:text-white"
                >
                  Inspect
                </button>
              </div>
            </article>
            ))}
          </div>

          {pageData.totalPages > 1 && (
            <div className="mt-6 flex flex-col items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-white px-4 py-3 shadow-sm sm:flex-row">
              <p className="text-xs font-medium text-primary/80">
                Menampilkan{' '}
                <span className="font-bold text-primary">
                  {pageData.startIndex}–{pageData.endIndex}
                </span>{' '}
                dari <span className="font-bold text-primary">{pageData.totalItems}</span> kamera
              </p>

              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <button
                  type="button"
                  disabled={pageData.currentPage <= 1}
                  onClick={() => handlePageChange(pageData.currentPage - 1)}
                  aria-label="Halaman sebelumnya"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/25 bg-[#EEF4FD] text-primary transition hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                {buildPaginationItems(pageData.currentPage, pageData.totalPages).map((item, idx) =>
                  item === 'ellipsis' ? (
                    <span
                      key={`ellipsis-${idx}`}
                      className="px-1.5 text-xs font-semibold text-primary/60"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => handlePageChange(item)}
                      className={cn(
                        'flex h-8 min-w-[2rem] items-center justify-center rounded-full px-2.5 text-xs font-bold transition',
                        pageData.currentPage === item
                          ? 'bg-primary text-white shadow-sm'
                          : 'border border-primary/20 bg-white text-primary hover:bg-[#EEF4FD]',
                      )}
                    >
                      {item}
                    </button>
                  ),
                )}

                <button
                  type="button"
                  disabled={pageData.currentPage >= pageData.totalPages}
                  onClick={() => handlePageChange(pageData.currentPage + 1)}
                  aria-label="Halaman berikutnya"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/25 bg-[#EEF4FD] text-primary transition hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
