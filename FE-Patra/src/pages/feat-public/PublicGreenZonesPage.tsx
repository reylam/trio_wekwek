import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import L from 'leaflet';
import {
  ChevronDown,
  ExternalLink,
  Filter,
  Loader2,
  MapPin,
  RotateCcw,
  Search,
} from 'lucide-react';
import { escapeHtml } from '@/lib/dinasHelpers';
import { buildGoogleMapsRouteUrl } from '@/lib/reportHelpers';
import { publicApi } from '@/services/publicApi';
import { cn } from '@/lib/utils';

const COMMON_FACILITIES = [
  'Listrik',
  'Air Bersih',
  'Toilet',
  'Parkir',
  'Area Teduh',
] as const;

function createGreenZonePin(selected = false): L.DivIcon {
  const size = selected ? 32 : 26;
  const half = size / 2;
  const ring = selected
    ? 'box-shadow:0 0 0 5px rgba(5,150,105,0.25), 0 4px 12px rgba(15,23,42,0.3);'
    : 'box-shadow:0 3px 10px rgba(15,23,42,0.25);';

  return L.divIcon({
    className: 'patra-map-pin',
    iconSize: [size, size],
    iconAnchor: [half, half],
    popupAnchor: [0, -half],
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:#059669;border:2.5px solid #FFFFFF;${ring}display:flex;align-items:center;justify-content:center;">
      <svg width="${selected ? 15 : 12}" height="${selected ? 15 : 12}" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>
    </div>`,
  });
}

export default function PublicGreenZonesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCity = searchParams.get('city') || 'all';

  const [selectedCity, setSelectedCity] = useState<string>(initialCity);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedFacility, setSelectedFacility] = useState<string>('all');
  const [focusedSiteId, setFocusedSiteId] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const sitesLayerRef = useRef<L.LayerGroup | null>(null);
  const markerMapRef = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    const paramCity = searchParams.get('city') || 'all';
    if (paramCity !== selectedCity) {
      setSelectedCity(paramCity);
      setFocusedSiteId(null);
    }
  }, [searchParams, selectedCity]);

  const handleCityChange = (nextCity: string) => {
    setSelectedCity(nextCity);
    setFocusedSiteId(null);
    if (nextCity === 'all') {
      setSearchParams({});
    } else {
      setSearchParams({ city: nextCity });
    }
  };

  const citiesQuery = useQuery({
    queryKey: ['public', 'cities'],
    queryFn: () => publicApi.listCities(),
    staleTime: 10 * 60_000,
  });

  const cityQueryArg = selectedCity === 'all' ? undefined : selectedCity;

  const mapQuery = useQuery({
    queryKey: ['public', 'map', selectedCity],
    queryFn: () => publicApi.getMap(cityQueryArg),
    staleTime: 60_000,
  });

  const cities = citiesQuery.data ?? [];
  const allSites = mapQuery.data?.relocationSites ?? [];

  const availableCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const site of allSites) {
      for (const cat of site.tradeCategories) {
        counts.set(cat, (counts.get(cat) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([name]) => name);
  }, [allSites]);

  const filteredSites = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allSites.filter((site) => {
      if (
        selectedCategory !== 'all' &&
        !site.tradeCategories.includes(selectedCategory)
      ) {
        return false;
      }
      if (
        selectedFacility !== 'all' &&
        !site.facilities.some((f) =>
          f.toLowerCase().includes(selectedFacility.toLowerCase()),
        )
      ) {
        return false;
      }
      if (!q) return true;
      return (
        site.name.toLowerCase().includes(q) ||
        site.address.toLowerCase().includes(q) ||
        site.tradeCategories.some((c) => c.toLowerCase().includes(q)) ||
        site.facilities.some((f) => f.toLowerCase().includes(q))
      );
    });
  }, [allSites, searchQuery, selectedCategory, selectedFacility]);

  const hasActiveFilters =
    selectedCity !== 'all' ||
    searchQuery.trim() !== '' ||
    selectedCategory !== 'all' ||
    selectedFacility !== 'all';

  const resetFilters = () => {
    setSelectedCity('all');
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedFacility('all');
    setFocusedSiteId(null);
    setSearchParams({});
  };

  // Init Leaflet once
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapRef.current) return;

    const map = L.map(container, {
      center: [-6.75, 108.6],
      zoom: 6,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const layer = L.layerGroup().addTo(map);
    mapRef.current = map;
    sitesLayerRef.current = layer;

    return () => {
      map.remove();
      mapRef.current = null;
      sitesLayerRef.current = null;
      markerMapRef.current.clear();
    };
  }, []);

  // Sync filtered green zones onto map
  useEffect(() => {
    const map = mapRef.current;
    const layer = sitesLayerRef.current;
    const mapData = mapQuery.data;
    if (!map || !layer || !mapData) return;

    layer.clearLayers();
    markerMapRef.current.clear();

    const bounds: L.LatLngTuple[] = [];

    for (const site of filteredSites) {
      const isSelected = focusedSiteId === site.id;

      L.circle([site.lat, site.lng], {
        radius: 140,
        color: '#059669',
        weight: isSelected ? 2 : 1.5,
        fillColor: '#10B981',
        fillOpacity: isSelected ? 0.24 : 0.14,
      }).addTo(layer);

      const marker = L.marker([site.lat, site.lng], {
        icon: createGreenZonePin(isSelected),
      }).addTo(layer);

      const gmapsUrl = buildGoogleMapsRouteUrl(site.lat, site.lng);
      const routeLinkHtml = gmapsUrl
        ? `<p style="margin:6px 0 0;"><a href="${escapeHtml(gmapsUrl)}" target="_blank" rel="noopener noreferrer" style="font-size:11px;font-weight:700;color:#043FA5;text-decoration:underline;">Buka Rute di Google Maps &rarr;</a></p>`
        : '';

      marker.bindPopup(
        `<div style="font-family:'Plus Jakarta Sans',sans-serif;min-width:225px;padding:10px 12px;">
          <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:0.05em;color:#059669;">ZONA HIJAU · LOKASI BINAAN UMKM</p>
          <p style="margin:4px 0 0;font-size:13px;font-weight:700;color:#0F172A;">${escapeHtml(site.name)}</p>
          <p style="margin:3px 0 6px;font-size:11px;color:#475569;line-height:1.35;">${escapeHtml(site.address)}</p>
          <p style="margin:0;font-size:11px;color:#0F172A;"><strong>Kategori:</strong> ${escapeHtml(site.tradeCategories.join(', '))}</p>
          <p style="margin:2px 0 0;font-size:11px;color:#0F172A;"><strong>Fasilitas:</strong> ${escapeHtml(site.facilities.join(', '))}</p>
          ${routeLinkHtml}
        </div>`,
      );

      marker.on('click', () => setFocusedSiteId(site.id));
      markerMapRef.current.set(site.id, marker);
      bounds.push([site.lat, site.lng]);
    }

    if (focusedSiteId) {
      const target = markerMapRef.current.get(focusedSiteId);
      if (target) {
        map.flyTo(target.getLatLng(), Math.max(map.getZoom(), 15), {
          duration: 0.55,
        });
        target.openPopup();
        return;
      }
    }

    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [44, 44], maxZoom: 13 });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 15);
    } else {
      map.setView(
        [mapData.region.centerLat, mapData.region.centerLng],
        mapData.region.defaultZoom,
      );
    }
  }, [filteredSites, mapQuery.data, focusedSiteId]);

  return (
    <>
      {/* Page Header */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
                Direktori Zona Hijau ({cities.length || 17} Kota / Kabupaten)
              </p>
              <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
                Lokasi Binaan UMKM Resmi
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Cari selter dan kawasan dagang legal berdasarkan kota, jenis
                dagangan, maupun fasilitas pendukung. Klik rute untuk membuka
                arah menuju lokasi di Google Maps.
              </p>
            </div>

            <Link
              to="/panduan-pkl"
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-[#F8FAFC] px-4 py-2 text-xs font-semibold text-slate-800 transition hover:border-primary/40 hover:text-primary"
            >
              Syarat & Alur Penempatan PKL →
            </Link>
          </div>

          {/* Multi-Facet Filter Bar */}
          <div
            data-tour="public-green-filters"
            className="mt-6 rounded-xl border border-slate-200 bg-[#F8FAFC] p-4"
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
              <div className="md:col-span-4">
                <label
                  htmlFor="gz-city-select"
                  className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500"
                >
                  Wilayah Kota / Kabupaten
                </label>
                <div className="relative">
                  <select
                    id="gz-city-select"
                    value={selectedCity}
                    onChange={(e) => handleCityChange(e.target.value)}
                    className="w-full appearance-none rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-9 text-xs font-semibold text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  >
                    <option value="all">Semua Wilayah ({cities.length} Kota)</option>
                    {cities.map((c) => (
                      <option key={c.id} value={c.city}>
                        {c.city} ({c.province})
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                    aria-hidden="true"
                  />
                </div>
              </div>

              <div className="md:col-span-5">
                <label
                  htmlFor="gz-search"
                  className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500"
                >
                  Cari Nama Selter / Jalan / Kategori
                </label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    id="gz-search"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Contoh: Malioboro, Simpang Lima, Kuliner, Batik..."
                    className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </div>
              </div>

              <div className="md:col-span-3">
                <label
                  htmlFor="gz-facility-select"
                  className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500"
                >
                  Fasilitas Utama
                </label>
                <div className="relative">
                  <select
                    id="gz-facility-select"
                    value={selectedFacility}
                    onChange={(e) => {
                      setSelectedFacility(e.target.value);
                      setFocusedSiteId(null);
                    }}
                    className="w-full appearance-none rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-9 text-xs font-semibold text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  >
                    <option value="all">Semua Fasilitas</option>
                    {COMMON_FACILITIES.map((fac) => (
                      <option key={fac} value={fac}>
                        Tersedia {fac}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                    aria-hidden="true"
                  />
                </div>
              </div>
            </div>

            {/* Category Quick Filter Row */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                  <Filter className="h-3 w-3" />
                  Kategori:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('all');
                    setFocusedSiteId(null);
                  }}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors',
                    selectedCategory === 'all'
                      ? 'border-emerald-700 bg-emerald-700 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                  )}
                >
                  Semua
                </button>
                {availableCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(cat);
                      setFocusedSiteId(null);
                    }}
                    className={cn(
                      'rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors',
                      selectedCategory === cat
                        ? 'border-emerald-700 bg-emerald-700 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset Filter</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Split View: Map + Rich Cards */}
      <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
          {/* Sticky Map Panel */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:sticky lg:top-20 lg:col-span-6">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <p className="text-xs font-bold text-slate-900">
                Peta Sebaran Zona Hijau
              </p>
              <span className="rounded bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-700 tabular-nums">
                {filteredSites.length} dari {allSites.length} lokasi
              </span>
            </div>

            <div className="relative z-0 isolate">
              <div
                ref={mapContainerRef}
                className="h-[380px] w-full bg-slate-100 lg:h-[560px]"
              />
              {mapQuery.isFetching && (
                <div className="pointer-events-none absolute right-3 top-3 z-[400] inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-primary shadow-sm">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Memuat peta...</span>
                </div>
              )}
            </div>
          </div>

          {/* Directory Cards */}
          <div className="space-y-3 lg:col-span-6">
            {mapQuery.isLoading ? (
              <div className="flex min-h-[280px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                <span>Memuat direktori Zona Hijau...</span>
              </div>
            ) : filteredSites.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
                <p className="text-sm font-bold text-slate-900">
                  Tidak ada Zona Hijau yang cocok
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Coba ubah kota, kategori dagangan, atau hapus kata kunci
                  pencarian.
                </p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#033285]"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Tampilkan Semua Lokasi</span>
                  </button>
                )}
              </div>
            ) : (
              filteredSites.map((site) => {
                const isFocused = focusedSiteId === site.id;
                const routeUrl = buildGoogleMapsRouteUrl(site.lat, site.lng);

                return (
                  <article
                    key={site.id}
                    className={cn(
                      'rounded-xl border bg-white p-4 transition-colors sm:p-5',
                      isFocused
                        ? 'border-emerald-600 ring-1 ring-emerald-600/20'
                        : 'border-slate-200 hover:border-slate-300',
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700">
                          <MapPin className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <h2 className="text-sm font-bold text-slate-950">
                            {site.name}
                          </h2>
                          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                            {site.address}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setFocusedSiteId(site.id)}
                          className={cn(
                            'rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition-colors',
                            isFocused
                              ? 'border-emerald-700 bg-emerald-700 text-white'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-500 hover:text-emerald-700',
                          )}
                        >
                          {isFocused ? 'Disorot di Peta' : 'Lihat di Peta'}
                        </button>

                        {routeUrl && (
                          <a
                            href={routeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border border-primary/25 bg-[#EEF4FD] px-2.5 py-1.5 text-[11px] font-semibold text-primary transition hover:bg-primary hover:text-white"
                          >
                            <span>Rute</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="mt-3.5 grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
                      <div>
                        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                          Kategori Dagangan
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {site.tradeCategories.map((cat) => (
                            <span
                              key={cat}
                              className="rounded border border-emerald-200/80 bg-emerald-50/70 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                          Fasilitas Tersedia
                        </p>
                        <p className="mt-1.5 text-xs leading-relaxed text-slate-700">
                          {site.facilities.join(', ')}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      </main>
    </>
  );
}
