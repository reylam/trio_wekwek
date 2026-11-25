import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import L from 'leaflet';
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Building2,
  ChevronDown,
  Loader2,
  Lock,
  MapPin,
  RefreshCw,
  Search,
  Shield,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/apiClient';
import { escapeHtml, formatKpiSla } from '@/lib/dinasHelpers';
import { publicApi } from '@/services/publicApi';
import { cn } from '@/lib/utils';

const DEMO_PORTAL_BUTTONS = [
  {
    demoKey: 'satpol-semarang',
    roleLabel: 'Satpol PP',
    cityLabel: 'Kota Semarang',
    scopeTag: 'Pemantauan & Tindak',
    icon: Shield,
  },
  {
    demoKey: 'dinas-semarang',
    roleLabel: 'Dinas UMKM',
    cityLabel: 'Kota Semarang',
    scopeTag: 'Validasi & Relokasi',
    icon: Building2,
  },
  {
    demoKey: 'satpol-jkt-pusat',
    roleLabel: 'Satpol PP',
    cityLabel: 'Jakarta Pusat',
    scopeTag: 'Pemantauan & Tindak',
    icon: Shield,
  },
  {
    demoKey: 'dinas-jkt-pusat',
    roleLabel: 'Sudin PPKUKM',
    cityLabel: 'Jakarta Pusat',
    scopeTag: 'Validasi & Relokasi',
    icon: Building2,
  },
] as const;

function createPublicRelocationPinIcon(selected = false): L.DivIcon {
  const size = selected ? 32 : 26;
  const half = size / 2;
  const ring = selected
    ? 'box-shadow:0 0 0 5px rgba(5,150,105,0.25), 0 4px 12px rgba(15,23,42,0.3);'
    : 'box-shadow:0 3px 10px rgba(15,23,42,0.28);';

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

export default function PublicHomePage() {
  const { demoLogin } = useAuth();
  const navigate = useNavigate();
  const { pushToast } = useToast();

  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [siteSearch, setSiteSearch] = useState<string>('');
  const [focusedSiteId, setFocusedSiteId] = useState<string | null>(null);
  const [demoLoadingKey, setDemoLoadingKey] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const sitesLayerRef = useRef<L.LayerGroup | null>(null);
  const siteMarkerMapRef = useRef<Map<string, L.Marker>>(new Map());

  const citiesQuery = useQuery({
    queryKey: ['public', 'cities'],
    queryFn: () => publicApi.listCities(),
    staleTime: 10 * 60_000,
  });

  const cityQueryArg = selectedCity === 'all' ? undefined : selectedCity;

  const overviewQuery = useQuery({
    queryKey: ['public', 'overview', selectedCity],
    queryFn: () => publicApi.getOverview(cityQueryArg),
    staleTime: 60_000,
  });

  const mapQuery = useQuery({
    queryKey: ['public', 'map', selectedCity],
    queryFn: () => publicApi.getMap(cityQueryArg),
    staleTime: 60_000,
  });

  const cities = citiesQuery.data ?? [];
  const quickCities = useMemo(() => cities.slice(0, 4), [cities]);
  const relocationSites = mapQuery.data?.relocationSites ?? [];

  const filteredSites = useMemo(() => {
    const q = siteSearch.trim().toLowerCase();
    if (!q) return relocationSites;
    return relocationSites.filter(
      (site) =>
        site.name.toLowerCase().includes(q) ||
        site.address.toLowerCase().includes(q) ||
        site.tradeCategories.some((cat) => cat.toLowerCase().includes(q)) ||
        site.facilities.some((fac) => fac.toLowerCase().includes(q)),
    );
  }, [relocationSites, siteSearch]);

  // Inisialisasi Leaflet Map Sekali
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapRef.current) return;

    const map = L.map(container, {
      center: [-6.75, 108.6],
      zoom: 7,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const sitesLayer = L.layerGroup().addTo(map);

    mapRef.current = map;
    sitesLayerRef.current = sitesLayer;

    return () => {
      map.remove();
      mapRef.current = null;
      sitesLayerRef.current = null;
      siteMarkerMapRef.current.clear();
    };
  }, []);

  // Sinkronisasi Layer Peta Publik (hanya Zona Hijau / Lokasi Binaan Resmi)
  useEffect(() => {
    const map = mapRef.current;
    const sitesLayer = sitesLayerRef.current;
    const mapData = mapQuery.data;
    if (!map || !sitesLayer || !mapData) return;

    sitesLayer.clearLayers();
    siteMarkerMapRef.current.clear();

    const bounds: L.LatLngTuple[] = [];

    for (const site of mapData.relocationSites) {
      const isSelected = focusedSiteId === site.id;

      L.circle([site.lat, site.lng], {
        radius: 140,
        color: '#059669',
        weight: isSelected ? 2 : 1.5,
        fillColor: '#10B981',
        fillOpacity: isSelected ? 0.24 : 0.14,
      }).addTo(sitesLayer);

      const marker = L.marker([site.lat, site.lng], {
        icon: createPublicRelocationPinIcon(isSelected),
      }).addTo(sitesLayer);

      marker.bindPopup(
        `<div style="font-family:'Plus Jakarta Sans',sans-serif;min-width:220px;padding:10px 12px;">
          <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:0.05em;color:#059669;">ZONA HIJAU · LOKASI BINAAN UMKM</p>
          <p style="margin:4px 0 0;font-size:13px;font-weight:700;color:#0F172A;">${escapeHtml(site.name)}</p>
          <p style="margin:3px 0 6px;font-size:11px;color:#475569;line-height:1.35;">${escapeHtml(site.address)}</p>
          <p style="margin:0;font-size:11px;color:#0F172A;"><strong>Kategori:</strong> ${escapeHtml(site.tradeCategories.join(', '))}</p>
          <p style="margin:2px 0 0;font-size:11px;color:#0F172A;"><strong>Fasilitas:</strong> ${escapeHtml(site.facilities.join(', '))}</p>
        </div>`,
      );

      marker.on('click', () => {
        setFocusedSiteId(site.id);
      });

      siteMarkerMapRef.current.set(site.id, marker);
      bounds.push([site.lat, site.lng]);
    }

    if (focusedSiteId) {
      const targetMarker = siteMarkerMapRef.current.get(focusedSiteId);
      if (targetMarker) {
        map.flyTo(targetMarker.getLatLng(), Math.max(map.getZoom(), 15), {
          duration: 0.55,
        });
        targetMarker.openPopup();
        return;
      }
    }

    if (selectedCity !== 'all') {
      map.setView(
        [mapData.region.centerLat, mapData.region.centerLng],
        mapData.region.defaultZoom,
        { animate: true },
      );
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [44, 44], maxZoom: 13 });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 14);
    } else {
      map.setView(
        [mapData.region.centerLat, mapData.region.centerLng],
        mapData.region.defaultZoom,
      );
    }
  }, [mapQuery.data, selectedCity, focusedSiteId]);

  const handleQuickDemo = async (demoKey: string) => {
    setDemoLoadingKey(demoKey);
    try {
      const signedIn = await demoLogin(demoKey);
      navigate(
        signedIn.role === 'SATPOL_PP' ? '/satpol/cctv' : '/dinas/dashboard',
        { replace: true },
      );
    } catch (err) {
      pushToast({
        variant: 'error',
        title: 'Gagal Masuk Mode Demo',
        description:
          err instanceof ApiError
            ? err.message
            : 'Pastikan server BE-Patra aktif jika VITE_USE_BACKEND=true.',
      });
    } finally {
      setDemoLoadingKey(null);
    }
  };

  const kpi = overviewQuery.data?.kpi;
  const resolutionPercent = Math.max(
    0,
    Math.min(100, kpi?.resolutionRatePercent ?? 0),
  );
  const activeRegionLabel = overviewQuery.data?.city ?? 'Semua Kota';
  const greenZonesHref =
    selectedCity === 'all'
      ? '/zona-hijau'
      : `/zona-hijau?city=${encodeURIComponent(selectedCity)}`;

  return (
    <>
      {/* Editorial Masthead Band */}
      <section
        className="border-b border-slate-200 bg-white"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(4, 63, 165, 0.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(4, 63, 165, 0.035) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      >
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
            {/* Editorial Title + Wilayah Filter */}
            <div className="lg:col-span-7">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
                <span className="inline-flex items-center gap-2 text-primary">
                  <span className="h-2 w-2 bg-primary" aria-hidden="true" />
                  Portal Publik PATRA
                </span>
                <span className="text-slate-300">/</span>
                <span>SDG 16</span>
                <span className="text-slate-300">/</span>
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <Lock className="h-3 w-3" />
                  Privasi Warga Terjaga
                </span>
              </div>

              <h1 className="mt-4 max-w-2xl text-[28px] font-extrabold leading-[1.12] tracking-[-0.025em] text-slate-950 sm:text-[38px]">
                Penataan ruang publik dan direktori zona hijau binaan UMKM.
              </h1>

              <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-600">
                Pantau ringkasan kinerja penataan kota dan temukan lokasi selter
                binaan resmi yang disediakan pemerintah daerah untuk berdagang
                secara tertib dan aman.
              </p>

              {/* Dynamic Kabupaten/Kota Filter Bar */}
              <div
                data-tour="public-city-filter"
                className="mt-6 rounded-xl border border-slate-200 bg-[#F8FAFC] p-3.5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1 sm:max-w-[270px]">
                    <label
                      htmlFor="public-city-select"
                      className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500"
                    >
                      Cakupan Wilayah (Kabupaten / Kota)
                    </label>
                    <div className="relative">
                      <select
                        id="public-city-select"
                        value={selectedCity}
                        onChange={(e) => {
                          setSelectedCity(e.target.value);
                          setFocusedSiteId(null);
                        }}
                        className="w-full appearance-none rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-9 text-xs font-semibold text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                      >
                        <option value="all">Semua Kota Pilot & Publik</option>
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

                  <div className="flex flex-wrap items-center gap-1.5 sm:pt-5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCity('all');
                        setFocusedSiteId(null);
                      }}
                      className={cn(
                        'rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors',
                        selectedCity === 'all'
                          ? 'border-primary bg-primary text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900',
                      )}
                    >
                      Semua Kota
                    </button>
                    {quickCities.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedCity(c.city);
                          setFocusedSiteId(null);
                        }}
                        className={cn(
                          'rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors',
                          selectedCity === c.city
                            ? 'border-primary bg-primary text-white'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900',
                        )}
                      >
                        {c.city.replace(/^Kota\s+/i, '')}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Panel Akses Instansi & Demo 1-Klik */}
            <aside
              data-tour="public-demo-panel"
              className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-5"
            >
              <div className="flex items-center justify-between border-b border-slate-200 bg-[#F8FAFC] px-4 py-3">
                <div>
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
                    Akses Portal Instansi
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Uji alur operasional per wilayah dalam satu klik
                  </p>
                </div>
                <Link
                  to="/login"
                  className="shrink-0 text-xs font-semibold text-primary underline decoration-primary/30 underline-offset-4 transition hover:decoration-primary"
                >
                  Login Manual
                </Link>
              </div>

              <div className="grid grid-cols-1 gap-px bg-slate-100 sm:grid-cols-2">
                {DEMO_PORTAL_BUTTONS.map(
                  ({ demoKey, roleLabel, cityLabel, scopeTag, icon: Icon }) => {
                    const busy = demoLoadingKey === demoKey;
                    return (
                      <button
                        key={demoKey}
                        type="button"
                        disabled={demoLoadingKey !== null}
                        onClick={() => void handleQuickDemo(demoKey)}
                        className="group flex items-start justify-between gap-2.5 bg-white px-4 py-3.5 text-left transition-colors hover:bg-[#F2F6FD] disabled:opacity-55"
                      >
                        <div className="flex min-w-0 items-start gap-2.5">
                          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-700 transition-colors group-hover:border-primary/30 group-hover:bg-primary group-hover:text-white">
                            {busy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Icon className="h-3.5 w-3.5" />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-bold text-slate-900 group-hover:text-primary">
                              {roleLabel}
                            </span>
                            <span className="block truncate text-[11px] font-medium text-slate-600">
                              {cityLabel}
                            </span>
                            <span className="mt-0.5 block truncate font-mono text-[10px] text-slate-400">
                              {scopeTag}
                            </span>
                          </span>
                        </div>
                        <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                      </button>
                    );
                  },
                )}
              </div>
            </aside>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
        {/* Ringkasan KPI */}
        <section
          id="ringkasan-kpi"
          data-tour="public-kpi"
          className="scroll-mt-20 space-y-3"
        >
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Indikator Bulan Berjalan (WIB)
              </p>
              <h2 className="mt-0.5 text-lg font-bold tracking-tight text-slate-950">
                Ringkasan Kinerja ({activeRegionLabel})
              </h2>
            </div>

            <p className="text-xs text-slate-500">
              Data teragregasi publik, tanpa foto mentah warga
            </p>
          </div>

          {overviewQuery.isError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-white px-5 py-4">
              <div className="flex items-center gap-2.5 text-xs font-semibold text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Gagal memuat ringkasan KPI publik dari server.</span>
              </div>
              <button
                type="button"
                onClick={() => void overviewQuery.refetch()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#033285]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Muat Ulang</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
              <div className="bg-white p-5">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  01 / Pelanggaran Bulan Ini
                </p>
                <p className="mt-3 font-mono text-3xl font-semibold tracking-tight text-slate-950 tabular-nums">
                  {overviewQuery.isLoading
                    ? '...'
                    : (kpi?.totalViolationsThisMonth ?? 0)}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Insiden trotoar tercatat pada periode berjalan
                </p>
              </div>

              <div className="bg-white p-5">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  02 / Penyelesaian Valid
                </p>
                <div className="mt-3 flex items-baseline gap-2">
                  <p className="font-mono text-3xl font-semibold tracking-tight text-emerald-700 tabular-nums">
                    {overviewQuery.isLoading ? '...' : `${resolutionPercent}%`}
                  </p>
                </div>
                <div
                  className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
                  aria-hidden="true"
                >
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-all duration-500"
                    style={{ width: `${resolutionPercent}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  Diverifikasi silang Satpol PP & Dinas UMKM
                </p>
              </div>

              <div className="bg-white p-5">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  03 / Rata-Rata SLA Respons
                </p>
                <p className="mt-3 font-mono text-3xl font-semibold tracking-tight text-primary tabular-nums">
                  {overviewQuery.isLoading
                    ? '...'
                    : formatKpiSla(kpi?.avgResponseSlaMinutes ?? null)}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Jeda deteksi hingga unggah bukti penindakan
                </p>
              </div>

              <div className="bg-white p-5">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  04 / PKL Diarahkan Relokasi
                </p>
                <p className="mt-3 font-mono text-3xl font-semibold tracking-tight text-slate-950 tabular-nums">
                  {overviewQuery.isLoading
                    ? '...'
                    : (kpi?.totalPklDirectedToRelocation ?? 0)}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Pedagang diarahkan ke Lokasi Binaan resmi
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Peta Zona Hijau (Lokasi Binaan) + Direktori Ringkas */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-stretch">
          <div
            id="peta-transparansi"
            data-tour="public-map"
            className="scroll-mt-20 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-7"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3.5 sm:px-5">
              <div>
                <h2 className="text-sm font-bold text-slate-950">
                  Peta Zona Hijau (Lokasi Binaan UMKM)
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Titik dan area resmi yang disediakan untuk berdagang secara
                  tertib
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                  <span className="h-2 w-2 rounded-full bg-emerald-600" />
                  <span>Zona Hijau</span>
                  <span className="font-mono text-[10px] opacity-80">
                    {relocationSites.length}
                  </span>
                </span>
                <Link
                  to={greenZonesHref}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-primary/40 hover:text-primary"
                >
                  <span>Filter Lengkap</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>

            <div className="relative z-0 isolate flex-1">
              <div
                ref={mapContainerRef}
                className="h-[400px] w-full bg-slate-100 lg:h-[500px]"
              />
              {mapQuery.isFetching && (
                <div className="pointer-events-none absolute right-3 top-3 z-[400] inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-primary shadow-sm">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Memperbarui peta...</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-[#FAFBFD] px-4 py-2.5 text-[11px] text-slate-600 sm:px-5">
              <span className="inline-flex items-center gap-2 font-medium text-emerald-800">
                <span className="h-2.5 w-2.5 rounded-full border border-emerald-700 bg-emerald-500/35" />
                Zona Hijau / Selter Lokasi Binaan Resmi Pemda
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                Klik pin untuk detail fasilitas & kategori
              </span>
            </div>
          </div>

          <div
            id="daftar-binaan"
            data-tour="public-sites-list"
            className="scroll-mt-20 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-5"
          >
            <div className="border-b border-slate-200 px-4 py-3.5 sm:px-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-950">
                    Daftar Lokasi Binaan
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Pilih lokasi untuk melihat titiknya di peta
                  </p>
                </div>
                <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-700 tabular-nums">
                  {filteredSites.length} lokasi
                </span>
              </div>

              <div className="relative mt-3">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={siteSearch}
                  onChange={(e) => setSiteSearch(e.target.value)}
                  placeholder="Cari nama selter, alamat, atau kategori..."
                  className="w-full rounded-lg border border-slate-200 bg-[#F8FAFC] py-2 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/15"
                />
              </div>
            </div>

            {mapQuery.isLoading ? (
              <div className="flex min-h-[320px] flex-1 items-center justify-center gap-2 text-xs font-medium text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                <span>Memuat daftar lokasi binaan...</span>
              </div>
            ) : filteredSites.length === 0 ? (
              <div className="flex min-h-[320px] flex-1 items-center justify-center p-8 text-center text-xs text-slate-500">
                Belum ada Lokasi Binaan yang cocok dengan filter wilayah atau
                kata kunci ini.
              </div>
            ) : (
              <div className="max-h-[480px] flex-1 divide-y divide-slate-100 overflow-y-auto lg:max-h-[505px]">
                {filteredSites.map((site) => {
                  const isFocused = focusedSiteId === site.id;
                  return (
                    <article
                      key={site.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setFocusedSiteId(site.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setFocusedSiteId(site.id);
                        }
                      }}
                      className={cn(
                        'cursor-pointer px-4 py-4 outline-none transition-colors focus-visible:bg-emerald-50/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600/35 sm:px-5',
                        isFocused
                          ? 'bg-emerald-50/70 ring-1 ring-inset ring-emerald-600/25'
                          : 'hover:bg-slate-50/80',
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700">
                          <MapPin className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="text-[13px] font-bold leading-snug text-slate-900">
                            {site.name}
                          </h3>
                          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                            {site.address}
                          </p>
                        </div>
                      </div>

                      {site.tradeCategories.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5 pl-9">
                          {site.tradeCategories.map((cat) => (
                            <span
                              key={cat}
                              className="rounded border border-emerald-200/80 bg-emerald-50/70 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-800"
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                      )}

                      {site.facilities.length > 0 && (
                        <p className="mt-2 pl-9 text-[11px] leading-relaxed text-slate-500">
                          <span className="font-semibold text-slate-700">
                            Fasilitas:
                          </span>{' '}
                          {site.facilities.join(', ')}
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Mekanisme Penataan & Relokasi */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#FAFBFD] px-5 py-3.5">
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Alur Penataan Terpadu
              </p>
              <h2 className="mt-0.5 text-sm font-bold text-slate-950">
                Dari pemantauan trotoar hingga penempatan di Zona Hijau Binaan
              </h2>
            </div>
            <Link
              to="/panduan-pkl"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              <span>Baca Panduan PKL & Syarat Relokasi</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 divide-y divide-slate-200 md:grid-cols-3 md:divide-x md:divide-y-0">
            <div className="p-5">
              <p className="font-mono text-xs font-semibold text-primary">
                01 / Pemantauan Koridor
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                Operator wilayah memantau kepadatan trotoar secara internal
                tanpa mengekspos rekaman CCTV ataupun foto mentah warga ke kanal
                publik.
              </p>
            </div>
            <div className="p-5">
              <p className="font-mono text-xs font-semibold text-primary">
                02 / Pendekatan Persuasif
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                Satpol PP menindaklanjuti secara humanis di lapangan serta
                mendata pedagang yang membutuhkan tempat berjualan resmi.
              </p>
            </div>
            <div className="p-5">
              <p className="font-mono text-xs font-semibold text-emerald-700">
                03 / Relokasi ke Zona Hijau
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                Dinas UMKM mengarahkan PKL ke Lokasi Binaan resmi dengan
                fasilitas usaha yang tertata, legal, dan mudah dijangkau
                pembeli.
              </p>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
