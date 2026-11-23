import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import L from 'leaflet';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock,
  Compass,
  EyeOff,
  Loader2,
  LogIn,
  MapPin,
  RefreshCw,
  Scale,
  Shield,
  Sparkles,
} from 'lucide-react';
import { PatraWordmark } from '@/components/ui/PatraLogo';
import { useToast } from '@/components/ui/Toast';
import WalkthroughTriggerButton from '@/components/walkthrough/WalkthroughTriggerButton';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/apiClient';
import { escapeHtml, formatKpiSla } from '@/lib/dinasHelpers';
import { formatWibDateTime, REPORT_STATUS_META } from '@/lib/formatters';
import {
  buildPublicAuditStages,
  toLeafletPolygonLatLngs,
} from '@/lib/publicHelpers';
import { publicApi } from '@/services/publicApi';
import type { ReportStatus } from '@/types';
import { cn } from '@/lib/utils';

const DEMO_PORTAL_BUTTONS = [
  {
    demoKey: 'satpol-semarang',
    roleLabel: 'Satpol PP',
    cityLabel: 'Kota Semarang',
    icon: Shield,
  },
  {
    demoKey: 'dinas-semarang',
    roleLabel: 'Dinas UMKM',
    cityLabel: 'Kota Semarang',
    icon: Building2,
  },
  {
    demoKey: 'satpol-jkt-pusat',
    roleLabel: 'Satpol PP',
    cityLabel: 'Jakarta Pusat',
    icon: Shield,
  },
  {
    demoKey: 'dinas-jkt-pusat',
    roleLabel: 'Sudin PPKUKM',
    cityLabel: 'Jakarta Pusat',
    icon: Building2,
  },
] as const;

const HOTSPOT_STATUS_COLOR: Record<ReportStatus, string> = {
  NEED_ACTION: '#DC2626',
  NEEDS_REVISION: '#D97706',
  PENDING_VALIDATION: '#043FA5',
  VALIDATED: '#059669',
};

function createPublicRelocationPinIcon(): L.DivIcon {
  return L.divIcon({
    className: 'patra-map-pin',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
    html: `<div style="width:28px;height:28px;border-radius:9999px;background:#059669;border:2.5px solid #FFFFFF;box-shadow:0 4px 12px rgba(5,150,105,0.45);display:flex;align-items:center;justify-content:center;">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>
    </div>`,
  });
}

export default function PublicHomePage() {
  const { user, demoLogin } = useAuth();
  const navigate = useNavigate();
  const { pushToast } = useToast();

  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [showZones, setShowZones] = useState(true);
  const [showHotspots, setShowHotspots] = useState(true);
  const [showSites, setShowSites] = useState(true);
  const [demoLoadingKey, setDemoLoadingKey] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const zonesLayerRef = useRef<L.LayerGroup | null>(null);
  const hotspotsLayerRef = useRef<L.LayerGroup | null>(null);
  const sitesLayerRef = useRef<L.LayerGroup | null>(null);

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

  const feedQuery = useQuery({
    queryKey: ['public', 'audit-feed', selectedCity],
    queryFn: () => publicApi.getAuditFeed({ city: cityQueryArg, limit: 20 }),
    staleTime: 60_000,
  });

  const cities = citiesQuery.data ?? [];
  const quickCities = useMemo(() => cities.slice(0, 4), [cities]);

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

    const zonesLayer = L.layerGroup().addTo(map);
    const hotspotsLayer = L.layerGroup().addTo(map);
    const sitesLayer = L.layerGroup().addTo(map);

    mapRef.current = map;
    zonesLayerRef.current = zonesLayer;
    hotspotsLayerRef.current = hotspotsLayer;
    sitesLayerRef.current = sitesLayer;

    return () => {
      map.remove();
      mapRef.current = null;
      zonesLayerRef.current = null;
      hotspotsLayerRef.current = null;
      sitesLayerRef.current = null;
    };
  }, []);

  // Sinkronisasi Layer Peta Transparansi (TANPA PIN CCTV & TANPA URL FOTO MENTAH)
  useEffect(() => {
    const map = mapRef.current;
    const zonesLayer = zonesLayerRef.current;
    const hotspotsLayer = hotspotsLayerRef.current;
    const sitesLayer = sitesLayerRef.current;
    const mapData = mapQuery.data;
    if (!map || !zonesLayer || !hotspotsLayer || !sitesLayer || !mapData) return;

    zonesLayer.clearLayers();
    hotspotsLayer.clearLayers();
    sitesLayer.clearLayers();

    const bounds: L.LatLngTuple[] = [];

    if (showZones) {
      for (const zone of mapData.zones) {
        const latLngs = toLeafletPolygonLatLngs(zone.points);
        if (latLngs.length < 3) continue;
        const polygon = L.polygon(latLngs, {
          color: '#DC2626',
          weight: 2,
          dashArray: '6 4',
          fillColor: '#EF4444',
          fillOpacity: 0.14,
        }).addTo(zonesLayer);

        polygon.bindPopup(
          `<div style="font-family:'Plus Jakarta Sans',sans-serif;min-width:180px;">
            <p style="margin:0;font-size:10px;font-weight:700;color:#DC2626;">ZONA LARANGAN PKL</p>
            <p style="margin:4px 0 0;font-size:12px;font-weight:700;color:#0F172A;">${escapeHtml(zone.name)}</p>
          </div>`,
        );
      }
    }

    if (showHotspots) {
      for (const hs of mapData.hotspots) {
        const color = HOTSPOT_STATUS_COLOR[hs.status] ?? '#043FA5';
        const statusLabel = REPORT_STATUS_META[hs.status]?.shortLabel ?? hs.status;

        const marker = L.circleMarker([hs.lat, hs.lng], {
          radius: Math.min(18, Math.max(8, 6 + hs.detectedCount * 2)),
          color: '#FFFFFF',
          weight: 2,
          fillColor: color,
          fillOpacity: 0.85,
        }).addTo(hotspotsLayer);

        // PRIVASI PUBLIK: Popup hanya berisi kode, alamat, jumlah & status — ZERO URL foto
        marker.bindPopup(
          `<div style="font-family:'Plus Jakarta Sans',sans-serif;min-width:200px;">
            <p style="margin:0;font-family:monospace;font-size:11px;font-weight:700;color:${color};">${escapeHtml(hs.reportCode)} • ${escapeHtml(statusLabel)}</p>
            <p style="margin:4px 0;font-size:12px;font-weight:600;color:#0F172A;">${escapeHtml(hs.address)}</p>
            <p style="margin:0;font-size:11px;color:#475569;">Terdeteksi: <strong>${hs.detectedCount}</strong> PKL • ${escapeHtml(formatWibDateTime(hs.createdAt))}</p>
          </div>`,
        );
        bounds.push([hs.lat, hs.lng]);
      }
    }

    if (showSites) {
      const siteIcon = createPublicRelocationPinIcon();
      for (const site of mapData.relocationSites) {
        const marker = L.marker([site.lat, site.lng], { icon: siteIcon }).addTo(
          sitesLayer,
        );
        marker.bindPopup(
          `<div style="font-family:'Plus Jakarta Sans',sans-serif;min-width:210px;">
            <p style="margin:0;font-size:10px;font-weight:700;color:#059669;">LOKASI BINAAN UMKM RESMI</p>
            <p style="margin:4px 0 0;font-size:13px;font-weight:700;color:#043FA5;">${escapeHtml(site.name)}</p>
            <p style="margin:3px 0 5px;font-size:11px;color:#475569;">${escapeHtml(site.address)}</p>
            <p style="margin:0;font-size:11px;color:#0F172A;"><strong>Kategori:</strong> ${escapeHtml(site.tradeCategories.join(', '))}</p>
            <p style="margin:2px 0 0;font-size:11px;color:#0F172A;"><strong>Fasilitas:</strong> ${escapeHtml(site.facilities.join(', '))}</p>
          </div>`,
        );
        bounds.push([site.lat, site.lng]);
      }
    }

    if (selectedCity !== 'all') {
      map.setView(
        [mapData.region.centerLat, mapData.region.centerLng],
        mapData.region.defaultZoom,
        { animate: true },
      );
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 13 });
    } else {
      map.setView(
        [mapData.region.centerLat, mapData.region.centerLng],
        mapData.region.defaultZoom,
      );
    }
  }, [mapQuery.data, selectedCity, showZones, showHotspots, showSites]);

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
  const auditItems = feedQuery.data?.items ?? [];

  return (
    <div className="min-h-screen bg-canvas text-slate-900">
      {/* Sticky Public Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-accent/40 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6 lg:px-8">
          <Link to="/" className="min-w-0">
            <PatraWordmark subtitle="Portal Transparansi Ruang Publik" />
          </Link>

          <nav
            aria-label="Navigasi Portal Publik"
            className="hidden items-center gap-6 text-xs font-semibold text-slate-600 md:flex"
          >
            <a href="#ringkasan-kpi" className="transition hover:text-primary">
              Ringkasan KPI
            </a>
            <a href="#peta-transparansi" className="transition hover:text-primary">
              Peta Transparansi
            </a>
            <a href="#linimasa-audit" className="transition hover:text-primary">
              Linimasa Akuntabilitas
            </a>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <WalkthroughTriggerButton tourId="public" label="Panduan Tur" />
            {user ? (
              <Link
                to={user.role === 'SATPOL_PP' ? '/satpol/cctv' : '/dinas/dashboard'}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-primary/90"
              >
                <span>Buka Portal ({user.region.city})</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-primary/90"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span>Masuk Portal Instansi</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {/* Hero Banner + Filter Kota + Panel Demo 1-Klik */}
        <section className="overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-[#043FA5] via-[#0B4EC0] to-[#1D67D8] p-6 text-white shadow-lg sm:p-8">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold tracking-wide text-blue-50 backdrop-blur-sm">
                <Scale className="h-3.5 w-3.5 text-[#9EC1EB]" />
                <span>SDG 16 • Smart Governance & Public Transparency</span>
              </div>

              <h1 className="mt-4 text-2xl font-extrabold leading-tight tracking-tight sm:text-4xl">
                Pantauan Transparan Penataan Trotoar & Pemberdayaan PKL
              </h1>
              <p className="mt-3 max-w-2xl text-xs leading-relaxed text-blue-100 sm:text-sm">
                Pantau kinerja penataan ruang publik secara terbuka mulai dari deteksi
                otomatis, tindak persuasif Satpol PP, hingga validasi serta penetapan
                Lokasi Binaan oleh Dinas UMKM—<strong>tanpa menampilkan foto mentah warga</strong>.
              </p>

              {/* Dynamic Kabupaten/Kota Filter */}
              <div
                data-tour="public-city-filter"
                className="mt-6 flex flex-col gap-3 rounded-2xl sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1 sm:max-w-xs">
                  <label
                    htmlFor="public-city-select"
                    className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-blue-100"
                  >
                    Filter Wilayah Kabupaten / Kota
                  </label>
                  <div className="relative">
                    <select
                      id="public-city-select"
                      value={selectedCity}
                      onChange={(e) => setSelectedCity(e.target.value)}
                      className="w-full appearance-none rounded-xl border border-white/30 bg-white py-2.5 pl-3.5 pr-10 text-xs font-bold text-primary shadow-sm outline-none focus:ring-2 focus:ring-[#9EC1EB]"
                    >
                      <option value="all">Semua Kota Pilot & Publik</option>
                      {cities.map((c) => (
                        <option key={c.id} value={c.city}>
                          {c.city} ({c.province})
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/70"
                      aria-hidden="true"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 sm:pt-5">
                  <button
                    type="button"
                    onClick={() => setSelectedCity('all')}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-[11px] font-semibold transition',
                      selectedCity === 'all'
                        ? 'bg-white text-primary shadow-sm'
                        : 'bg-white/15 text-white hover:bg-white/25',
                    )}
                  >
                    Semua Kota
                  </button>
                  {quickCities.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCity(c.city)}
                      className={cn(
                        'rounded-full px-3 py-1.5 text-[11px] font-semibold transition',
                        selectedCity === c.city
                          ? 'bg-white text-primary shadow-sm'
                          : 'bg-white/15 text-white hover:bg-white/25',
                      )}
                    >
                      {c.city}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Akses Cepat & Demo Juri 1-Klik */}
            <div
              data-tour="public-demo-panel"
              className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-md lg:col-span-5 sm:p-5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#9EC1EB]" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-white">
                    Uji Demo 1-Klik Portal Instansi
                  </h2>
                </div>
                <Link
                  to="/login"
                  className="text-[11px] font-semibold text-[#9EC1EB] underline underline-offset-2 hover:text-white"
                >
                  Form Login
                </Link>
              </div>
              <p className="mt-1 text-[11px] text-blue-100">
                Masuk instan sebagai petugas Satpol PP atau Dinas UMKM untuk mencoba alur
                operasional lengkap:
              </p>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {DEMO_PORTAL_BUTTONS.map(
                  ({ demoKey, roleLabel, cityLabel, icon: Icon }) => {
                    const busy = demoLoadingKey === demoKey;
                    return (
                      <button
                        key={demoKey}
                        type="button"
                        disabled={demoLoadingKey !== null}
                        onClick={() => void handleQuickDemo(demoKey)}
                        className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 text-left text-primary shadow-sm transition hover:bg-[#E9F1FD] disabled:opacity-60"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#E9F1FD] text-primary">
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Icon className="h-4 w-4" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-bold">
                            {roleLabel}
                          </span>
                          <span className="block truncate text-[10px] text-slate-500">
                            {cityLabel}
                          </span>
                        </span>
                      </button>
                    );
                  },
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 4 Kartu KPI Transparansi */}
        <section
          id="ringkasan-kpi"
          data-tour="public-kpi"
          className="scroll-mt-20 space-y-3 rounded-2xl"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-extrabold text-primary">
                Ringkasan Kinerja Ruang Publik
              </h2>
              <p className="text-xs text-slate-500">
                Cakupan data:{' '}
                <strong className="text-slate-700">
                  {overviewQuery.data?.city ?? 'Semua Kota'}
                </strong>
              </p>
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
              <EyeOff className="h-3.5 w-3.5" />
              <span>Privasi Aktif: Tanpa Foto Mentah Warga</span>
            </div>
          </div>

          {overviewQuery.isError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-white p-5">
              <div className="flex items-center gap-2.5 text-xs font-semibold text-red-700">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span>Gagal memuat KPI publik dari server.</span>
              </div>
              <button
                type="button"
                onClick={() => void overviewQuery.refetch()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-white"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Muat Ulang</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Pelanggaran Bulan Ini
                </p>
                <p className="mt-2 font-mono text-3xl font-extrabold text-slate-900">
                  {overviewQuery.isLoading ? '...' : (kpi?.totalViolationsThisMonth ?? 0)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Insiden tercatat di bulan berjalan (WIB)
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Tingkat Penyelesaian Valid
                </p>
                <p className="mt-2 font-mono text-3xl font-extrabold text-emerald-700">
                  {overviewQuery.isLoading ? '...' : `${kpi?.resolutionRatePercent ?? 0}%`}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Tervalidasi lintas Satpol PP & Dinas UMKM
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Rata-Rata SLA Penanganan
                </p>
                <p className="mt-2 font-mono text-3xl font-extrabold text-primary">
                  {overviewQuery.isLoading
                    ? '...'
                    : formatKpiSla(kpi?.avgResponseSlaMinutes ?? null)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Waktu deteksi hingga bukti penindakan terkirim
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  PKL Diarahkan Relokasi
                </p>
                <p className="mt-2 font-mono text-3xl font-extrabold text-slate-900">
                  {overviewQuery.isLoading
                    ? '...'
                    : (kpi?.totalPklDirectedToRelocation ?? 0)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Pedagang terbantu menuju Lokasi Binaan resmi
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Peta Transparansi Interaktif + Linimasa Audit Feed */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Peta Transparansi */}
          <div
            id="peta-transparansi"
            data-tour="public-map"
            className="scroll-mt-20 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6 lg:col-span-7"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Peta Transparansi Ruang Publik
                </h2>
                <p className="text-xs text-slate-500">
                  Zona larangan PKL, titik penanganan, dan Lokasi Binaan resmi (tanpa CCTV
                  & foto mentah)
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowZones((v) => !v)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition',
                    showZones
                      ? 'border-red-200 bg-red-50 text-red-700'
                      : 'border-slate-200 bg-white text-slate-400',
                  )}
                >
                  <span className="h-2 w-2 rounded-sm bg-red-500" />
                  <span>Zona ({mapQuery.data?.zones.length ?? 0})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowHotspots((v) => !v)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition',
                    showHotspots
                      ? 'border-primary/30 bg-[#E9F1FD] text-primary'
                      : 'border-slate-200 bg-white text-slate-400',
                  )}
                >
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  <span>Titik ({mapQuery.data?.hotspots.length ?? 0})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowSites((v) => !v)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition',
                    showSites
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-white text-slate-400',
                  )}
                >
                  <MapPin className="h-3 w-3" />
                  <span>Binaan ({mapQuery.data?.relocationSites.length ?? 0})</span>
                </button>
              </div>
            </div>

            <div className="relative">
              <div
                ref={mapContainerRef}
                className="h-[380px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
              />
              {mapQuery.isFetching && (
                <div className="pointer-events-none absolute right-3 top-3 z-[400] inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-[11px] font-semibold text-primary shadow">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Memperbarui peta...</span>
                </div>
              )}
            </div>
          </div>

          {/* Linimasa Akuntabilitas Publik (Audit Feed) */}
          <div
            id="linimasa-audit"
            data-tour="public-audit-feed"
            className="scroll-mt-20 flex flex-col rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6 lg:col-span-5"
          >
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-base font-bold text-slate-900">
                Linimasa Akuntabilitas Publik
              </h2>
              <p className="text-xs text-slate-500">
                Pelacakan proses Deteksi → Tindak → Validasi secara terbuka
              </p>
            </div>

            {feedQuery.isLoading ? (
              <div className="flex flex-1 min-h-[260px] items-center justify-center gap-2 text-xs font-semibold text-primary">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Memuat linimasa akuntabilitas...</span>
              </div>
            ) : auditItems.length === 0 ? (
              <div className="my-6 flex flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-canvas/60 p-6 text-center text-xs text-slate-500">
                Belum ada riwayat penataan untuk filter kota ini.
              </div>
            ) : (
              <div className="mt-4 max-h-[380px] space-y-3 overflow-y-auto pr-1">
                {auditItems.map((item) => {
                  const statusMeta = REPORT_STATUS_META[item.status];
                  const stages = buildPublicAuditStages(item);
                  return (
                    <article
                      key={item.id}
                      className="rounded-2xl border border-slate-200/80 bg-canvas/55 p-3.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-primary">
                            {item.reportCode}
                          </span>
                          <span className="text-[11px] font-medium text-slate-500">
                            • {item.city}
                          </span>
                        </div>
                        <span
                          className={cn(
                            'rounded-full border px-2 py-0.5 text-[10px] font-bold',
                            statusMeta.badgeClass,
                          )}
                        >
                          {statusMeta.shortLabel}
                        </span>
                      </div>

                      <p className="mt-1.5 text-xs font-semibold text-slate-800">
                        {item.address}
                      </p>

                      {/* 3 Tahap SDG 16 */}
                      <div className="mt-3 grid grid-cols-3 gap-1.5">
                        {stages.map((stage) => (
                          <div
                            key={stage.key}
                            className={cn(
                              'rounded-xl border px-2 py-1.5 text-[10px]',
                              stage.state === 'done' &&
                                'border-emerald-200 bg-emerald-50 text-emerald-800',
                              stage.state === 'active' &&
                                'border-primary/30 bg-[#E9F1FD] text-primary',
                              stage.state === 'revision' &&
                                'border-amber-200 bg-amber-50 text-amber-800',
                              stage.state === 'pending' &&
                                'border-slate-200 bg-white text-slate-400',
                            )}
                          >
                            <div className="flex items-center gap-1 font-bold">
                              {stage.state === 'done' ? (
                                <CheckCircle2 className="h-3 w-3 shrink-0" />
                              ) : (
                                <Clock className="h-3 w-3 shrink-0" />
                              )}
                              <span className="truncate">{stage.label}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                        <span className="font-mono">
                          {formatWibDateTime(item.detectedAt)}
                        </span>
                        <div className="flex items-center gap-2">
                          {item.responseSlaMinutes !== null && (
                            <span className="rounded bg-white px-2 py-0.5 font-mono text-[10px] font-semibold text-primary">
                              SLA {formatKpiSla(item.responseSlaMinutes)}
                            </span>
                          )}
                          {item.relocationSiteName && (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              <Compass className="h-3 w-3" />
                              {item.relocationSiteName}
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="mt-10 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-3 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <p>
            <strong className="text-primary">PATRA</strong> — Pantauan Transparan Ruang
            Publik • Techcomfest 2027 (SDG 16: Peace, Justice & Strong Institutions).
          </p>
          <Link to="/login" className="font-semibold text-primary hover:underline">
            Portal Internal Satpol PP & Dinas UMKM →
          </Link>
        </div>
      </footer>
    </div>
  );
}
