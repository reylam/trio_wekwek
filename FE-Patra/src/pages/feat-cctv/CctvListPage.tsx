import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Camera, RefreshCw, Search, Video, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cctvApi } from '@/services/api';
import { SatpolTopHeader } from '@/components/layout/SatpolLayout';
import type { CctvCameraDto } from '@/types';

// Lazy-load visual card thumbnail (STRICT: 0 HLS video requests on grid page)
function CameraPreviewArtwork({ camera }: { camera: CctvCameraDto }) {
  if (camera.thumbnailUrl) {
    return (
      <img
        src={camera.thumbnailUrl}
        alt={camera.name}
        loading="lazy"
        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
      />
    );
  }

  return (
    <div className="relative flex h-full w-full flex-col justify-between bg-gradient-to-br from-[#16233E] via-[#1E3359] to-[#0B132B] p-3 text-white">
      {/* Subtle CCTV grid lines */}
      <svg
        viewBox="0 0 320 180"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-25"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M90 180 L145 25 L175 25 L230 180" stroke="#9EC1EB" strokeWidth="1.5" fill="rgba(115,166,233,0.12)" />
        <line x1="160" y1="30" x2="160" y2="180" stroke="#FFFFFF" strokeDasharray="8 8" strokeWidth="1.5" />
        <path d="M210 75 L305 90 L315 175 L195 175 Z" stroke="#EF4444" strokeDasharray="5 5" strokeWidth="1.5" fill="rgba(239,68,68,0.12)" />
      </svg>

      <div className="relative z-10 flex items-center justify-between gap-2 font-mono text-[10px] text-blue-100/80">
        <span className="truncate">{camera.id.slice(0, 22)}</span>
        <span className="rounded bg-slate-900/70 px-1.5 py-0.5 text-[9px] uppercase text-accent">
          {camera.streamType}
        </span>
      </div>

      <div className="relative z-10 flex items-center justify-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-accent ring-1 ring-white/20 backdrop-blur-sm transition group-hover:scale-110 group-hover:bg-primary group-hover:text-white">
          <Video className="h-5 w-5" />
        </span>
      </div>

      <div className="relative z-10 flex items-center justify-between font-mono text-[10px] text-blue-100/75">
        <span>{camera.district ?? camera.city}</span>
        <span>{camera.roiPolygon ? 'ROI Trotoar' : 'Full-Frame'}</span>
      </div>
    </div>
  );
}

export default function CctvListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const camerasQuery = useQuery({
    queryKey: ['cctv', 'list', user?.region.id],
    queryFn: () => cctvApi.list(),
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  const allCameras = camerasQuery.data?.cameras ?? [];

  const filteredCameras = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allCameras;
    return allCameras.filter(
      (cam) =>
        cam.name.toLowerCase().includes(q) ||
        cam.regionLabel.toLowerCase().includes(q) ||
        (cam.district ?? '').toLowerCase().includes(q) ||
        (cam.facilityCategory ?? '').toLowerCase().includes(q),
    );
  }, [allCameras, searchQuery]);

  const openSearch = () => {
    setSearchOpen(true);
    window.setTimeout(() => searchInputRef.current?.focus(), 40);
  };

  return (
    <div className="mx-auto max-w-7xl px-5 py-7 sm:px-8">
      <SatpolTopHeader />

      {/* Toolbar matching CCTV Monitoring (SATPOL PP).png & - Search.png */}
      <div className="mb-6 flex flex-wrap items-center justify-end gap-3">
        {searchOpen || searchQuery ? (
          <div className="relative flex w-full items-center sm:w-80">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && !searchQuery) setSearchOpen(false);
              }}
              placeholder="Search..."
              className="w-full rounded-full border border-primary/50 bg-[#EEF4FD] py-2 pl-4 pr-10 text-sm text-primary placeholder:text-primary/50 focus:border-primary focus:bg-white focus:outline-none"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                className="absolute right-3 text-primary/60 hover:text-primary"
                aria-label="Hapus pencarian"
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="absolute right-3 text-primary"
                aria-label="Tutup pencarian"
              >
                <Search className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={openSearch}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/55 bg-[#EEF4FD] text-primary transition hover:bg-accent/40"
            aria-label="Cari kamera CCTV"
          >
            <Search className="h-4 w-4" />
          </button>
        )}

        <div className="inline-flex items-center gap-2 rounded-full border border-primary/55 bg-[#EEF4FD] px-4 py-2 text-xs font-semibold text-primary">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          <span>Total Cameras: {allCameras.length}</span>
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
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="mt-4 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary/90"
            >
              Reset Pencarian
            </button>
          )}
        </div>
      )}

      {/* 3-Column Camera Card Grid */}
      {!camerasQuery.isLoading && !camerasQuery.isError && filteredCameras.length > 0 && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredCameras.map((camera) => (
            <article
              key={camera.id}
              onClick={() => navigate(`/satpol/cctv/${encodeURIComponent(camera.id)}`)}
              className="group cursor-pointer overflow-hidden rounded-2xl border border-accent/50 bg-[#E6EFFC] shadow-sm transition hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-md"
            >
              {/* Preview Area (Zero video stream loaded on grid) */}
              <div className="relative aspect-video w-full overflow-hidden bg-video-frame">
                <CameraPreviewArtwork camera={camera} />

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
      )}
    </div>
  );
}
