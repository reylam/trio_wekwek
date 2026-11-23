import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import L from 'leaflet';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Compass,
  FileBarChart2,
  Loader2,
  MapPin,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { DinasTopHeader } from '@/components/layout/DinasLayout';
import { useAuth } from '@/context/AuthContext';
import { computeHotspotRadius, escapeHtml, formatKpiSla } from '@/lib/dinasHelpers';
import { dinasAnalyticsApi } from '@/services/dinasApi';
import { cn } from '@/lib/utils';

function formatShortDay(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Agu',
    'Sep',
    'Okt',
    'Nov',
    'Des',
  ];
  const m = Number.parseInt(parts[1], 10);
  const d = Number.parseInt(parts[2], 10);
  if (Number.isNaN(m) || Number.isNaN(d)) return isoDate;
  return `${d} ${monthNames[m - 1] ?? parts[1]}`;
}

function createRelocationSitePinIcon(): L.DivIcon {
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

export default function DinasDashboardPage() {
  const { user } = useAuth();
  const [showHotspots, setShowHotspots] = useState(true);
  const [showSites, setShowSites] = useState(true);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const hotspotLayerRef = useRef<L.LayerGroup | null>(null);
  const siteLayerRef = useRef<L.LayerGroup | null>(null);

  const analyticsQuery = useQuery({
    queryKey: ['dinas', 'analytics', user?.region.id],
    queryFn: () => dinasAnalyticsApi.getAnalytics(),
    staleTime: 30_000,
  });

  const data = analyticsQuery.data;

  const topPeakHour = useMemo(() => {
    if (!data?.peakHoursWib.length) return null;
    return data.peakHoursWib.reduce((best, curr) =>
      curr.count > best.count ? curr : best,
    );
  }, [data?.peakHoursWib]);

  // Inisialisasi Peta Penataan & Evaluasi (TANPA PIN CCTV)
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapRef.current) return;

    const map = L.map(container, {
      center: [
        user?.region.centerLat ?? -6.1864,
        user?.region.centerLng ?? 106.834,
      ],
      zoom: user?.region.defaultZoom ?? 13,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const hotspotLayer = L.layerGroup().addTo(map);
    const siteLayer = L.layerGroup().addTo(map);

    mapRef.current = map;
    hotspotLayerRef.current = hotspotLayer;
    siteLayerRef.current = siteLayer;

    return () => {
      map.remove();
      mapRef.current = null;
      hotspotLayerRef.current = null;
      siteLayerRef.current = null;
    };
  }, [user?.region.centerLat, user?.region.centerLng, user?.region.defaultZoom]);

  // Sinkronisasi marker titik pelanggaran valid & lokasi binaan (tanpa pin CCTV)
  useEffect(() => {
    const map = mapRef.current;
    const hotspotLayer = hotspotLayerRef.current;
    const siteLayer = siteLayerRef.current;
    if (!map || !hotspotLayer || !siteLayer || !data) return;

    hotspotLayer.clearLayers();
    siteLayer.clearLayers();

    const bounds: L.LatLngTuple[] = [];

    if (showHotspots) {
      for (const pt of data.planningMap.validatedPoints) {
        const radius = computeHotspotRadius(pt.weight);
        // Lingkaran halo luar untuk efek intensitas kerawanan
        L.circleMarker([pt.lat, pt.lng], {
          radius: radius + 7,
          color: 'transparent',
          fillColor: '#EF4444',
          fillOpacity: 0.16,
          interactive: false,
        }).addTo(hotspotLayer);

        const core = L.circleMarker([pt.lat, pt.lng], {
          radius,
          color: '#FFFFFF',
          weight: 2,
          fillColor: '#DC2626',
          fillOpacity: 0.72,
        }).addTo(hotspotLayer);

        core.bindPopup(
          `<div style="font-family:'Plus Jakarta Sans',sans-serif;min-width:190px;">
            <p style="margin:0;font-size:11px;font-weight:700;color:#DC2626;">TITIK PELANGGARAN VALID</p>
            <p style="margin:4px 0 0;font-size:12px;font-weight:600;color:#0F172A;">${escapeHtml(pt.address)}</p>
            <p style="margin:4px 0 0;font-size:11px;color:#475569;">Bobot intensitas: <strong>${pt.weight}</strong> PKL</p>
          </div>`,
        );
        bounds.push([pt.lat, pt.lng]);
      }
    }

    if (showSites) {
      const siteIcon = createRelocationSitePinIcon();
      for (const site of data.planningMap.relocationSites) {
        const facilitiesHtml = site.facilities
          .slice(0, 4)
          .map(
            (f) =>
              `<span style="display:inline-block;margin:2px 4px 0 0;padding:2px 6px;border-radius:9999px;background:#ECFDF5;color:#047857;font-size:10px;font-weight:600;">${escapeHtml(f)}</span>`,
          )
          .join('');

        const marker = L.marker([site.lat, site.lng], { icon: siteIcon }).addTo(siteLayer);
        marker.bindPopup(
          `<div style="font-family:'Plus Jakarta Sans',sans-serif;min-width:210px;">
            <p style="margin:0;font-size:11px;font-weight:700;color:#059669;">LOKASI BINAAN RESMI</p>
            <p style="margin:4px 0 0;font-size:13px;font-weight:700;color:#043FA5;">${escapeHtml(site.name)}</p>
            <p style="margin:3px 0 6px;font-size:11px;color:#475569;">${escapeHtml(site.address)}</p>
            <div>${facilitiesHtml}</div>
          </div>`,
        );
        bounds.push([site.lat, site.lng]);
      }
    }

    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 14);
    }
  }, [data, showHotspots, showSites]);

  const maxStreetCount = useMemo(() => {
    if (!data?.topHotspotStreets.length) return 1;
    return Math.max(...data.topHotspotStreets.map((s) => s.count), 1);
  }, [data?.topHotspotStreets]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <DinasTopHeader />

      {analyticsQuery.isLoading ? (
        <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-accent/40 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-3 text-sm font-semibold text-primary">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Memuat analitik penataan ruang publik...</span>
          </div>
        </div>
      ) : analyticsQuery.isError || !data ? (
        <div className="rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto h-10 w-10 text-red-500" />
          <h2 className="mt-3 text-lg font-bold text-slate-900">
            Gagal Memuat Dashboard Analitik
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {(analyticsQuery.error as Error | null)?.message ??
              'Terjadi gangguan saat mengambil data dari server.'}
          </p>
          <button
            type="button"
            onClick={() => void analyticsQuery.refetch()}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary/90"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Coba Lagi</span>
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 4 Kartu KPI Strategis */}
          <section
            aria-label="Indikator Kinerja Utama"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Total Laporan Masuk
                </span>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E9F1FD] text-primary">
                  <FileBarChart2 className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 font-mono text-3xl font-extrabold text-slate-900">
                {data.kpi.totalIncomingReports}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Laporan pelanggaran di wilayah {user?.region.city}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Tingkat Validasi
                </span>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 font-mono text-3xl font-extrabold text-emerald-700">
                {data.kpi.validatedPercent}%
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Persentase laporan berstatus Tervalidasi
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Rata-Rata SLA Respons
                </span>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                  <Clock className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 font-mono text-3xl font-extrabold text-slate-900">
                {formatKpiSla(data.kpi.avgResponseSlaMinutes)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Waktu deteksi hingga bukti After terunggah
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Arahan Relokasi
                </span>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E9F1FD] text-primary">
                  <Compass className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 font-mono text-3xl font-extrabold text-primary">
                {data.kpi.totalRelocationDirected}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Penetapan Lokasi Binaan telah diterbitkan
              </p>
            </div>
          </section>

          {/* 2 Grafik Recharts */}
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-2 pb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Tren Pelanggaran 30 Hari Terakhir
                  </h2>
                  <p className="text-xs text-slate-500">
                    Agregasi harian zona waktu Asia/Jakarta (WIB)
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-2.5 py-1 text-[11px] font-semibold text-primary">
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span>30 Hari</span>
                </span>
              </div>

              <div className="h-[260px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data.dailyTrend}
                    margin={{ top: 8, right: 12, left: -18, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="patraTrendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#043FA5" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#9EC1EB" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatShortDay}
                      tick={{ fontSize: 11, fill: '#64748B' }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={22}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: '#64748B' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '12px',
                        borderColor: '#9EC1EB',
                        fontSize: '12px',
                      }}
                      labelFormatter={(label) => `Tanggal ${formatShortDay(String(label))}`}
                      formatter={(val) => [`${val ?? 0} laporan`, 'Jumlah']}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#043FA5"
                      strokeWidth={2.5}
                      fill="url(#patraTrendFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-2 pb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Distribusi Jam Rawan (00–23 WIB)
                  </h2>
                  <p className="text-xs text-slate-500">
                    {topPeakHour && topPeakHour.count > 0
                      ? `Puncak pelanggaran pada pukul ${topPeakHour.label} WIB`
                      : 'Frekuensi deteksi per jam operasional'}
                  </p>
                </div>
                <span className="rounded-full bg-canvas px-2.5 py-1 font-mono text-[11px] font-semibold text-primary">
                  WIB
                </span>
              </div>

              <div className="h-[260px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.peakHoursWib}
                    margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: '#64748B' }}
                      tickLine={false}
                      axisLine={false}
                      interval={2}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: '#64748B' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '12px',
                        borderColor: '#9EC1EB',
                        fontSize: '12px',
                      }}
                      labelFormatter={(label) => `Pukul ${String(label)} WIB`}
                      formatter={(val) => [`${val ?? 0} kejadian`, 'Intensitas']}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {data.peakHoursWib.map((entry) => (
                        <Cell
                          key={entry.hour}
                          fill={
                            topPeakHour &&
                            entry.hour === topPeakHour.hour &&
                            entry.count > 0
                              ? '#043FA5'
                              : '#73A6E9'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* Bottom Section: Top 5 Ruas Jalan & Peta Penataan Lokasi Binaan */}
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Top 5 Ruas Jalan */}
            <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6 lg:col-span-5">
              <div className="flex items-center justify-between gap-2 pb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Top 5 Ruas Jalan Paling Rawan
                  </h2>
                  <p className="text-xs text-slate-500">
                    Prioritas penataan koridor & penyediaan lokasi binaan
                  </p>
                </div>
                <Link
                  to="/dinas/validasi"
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Lihat Laporan
                </Link>
              </div>

              {data.topHotspotStreets.length === 0 ? (
                <div className="flex h-64 items-center justify-center rounded-2xl bg-canvas text-xs text-slate-500">
                  Belum ada data agregasi ruas jalan di kota ini.
                </div>
              ) : (
                <div className="space-y-4">
                  {data.topHotspotStreets.map((street, index) => {
                    const ratio = Math.round((street.count / maxStreetCount) * 100);
                    return (
                      <div
                        key={street.address}
                        className="rounded-2xl border border-slate-100 bg-canvas/60 p-3.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                              {index + 1}
                            </span>
                            <p className="line-clamp-2 text-xs font-semibold text-slate-800">
                              {street.address}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="font-mono text-sm font-bold text-primary">
                              {street.count}
                            </p>
                            <p className="text-[10px] text-emerald-700 font-semibold">
                              {street.validatedCount} valid
                            </p>
                          </div>
                        </div>
                        <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-200/80">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${Math.max(8, ratio)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Peta Penataan & Evaluasi (Titik Pelanggaran Valid + Lokasi Binaan, TANPA CCTV) */}
            <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6 lg:col-span-7">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Peta Penataan & Evaluasi Relokasi
                  </h2>
                  <p className="text-xs text-slate-500">
                    Sebaran pelanggaran tervalidasi disandingkan dengan Lokasi Binaan resmi
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowHotspots((v) => !v)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition',
                      showHotspots
                        ? 'border-red-200 bg-red-50 text-red-700'
                        : 'border-slate-200 bg-white text-slate-400',
                    )}
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-red-600" />
                    <span>Hotspot Valid ({data.planningMap.validatedPoints.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSites((v) => !v)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition',
                      showSites
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-white text-slate-400',
                    )}
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    <span>Lokasi Binaan ({data.planningMap.relocationSites.length})</span>
                  </button>
                </div>
              </div>

              <div
                ref={mapContainerRef}
                className="h-[340px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
