import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import L from 'leaflet';
import {
  Check,
  Info,
  Loader2,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cctvApi, reportApi, zoneApi } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { formatWibDateTime, REPORT_STATUS_META } from '@/lib/formatters';
import type { GeoLngLat, RestrictedZoneDto } from '@/types';
import { cn } from '@/lib/utils';

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createCctvMarkerIcon(): L.DivIcon {
  return L.divIcon({
    className: 'patra-map-pin',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
    html: `<div style="width:30px;height:30px;border-radius:9999px;background:#043FA5;border:2.5px solid #FFFFFF;box-shadow:0 4px 12px rgba(4,63,165,0.45);display:flex;align-items:center;justify-content:center;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
        <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/>
        <rect x="2" y="6" width="14" height="12" rx="2"/>
      </svg>
    </div>`,
  });
}

function createViolationMarkerIcon(): L.DivIcon {
  return L.divIcon({
    className: 'patra-map-pin',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
    html: `<div style="width:30px;height:30px;border-radius:9999px;background:#B91C1C;border:2.5px solid #FFFFFF;box-shadow:0 4px 12px rgba(185,28,28,0.48);display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-weight:800;font-size:15px;font-family:'Plus Jakarta Sans',sans-serif;">!</div>`,
  });
}

function createDraftVertexIcon(index: number): L.DivIcon {
  return L.divIcon({
    className: 'patra-map-pin',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div style="width:22px;height:22px;border-radius:9999px;background:#DC2626;border:2px solid #FFFFFF;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-size:10px;font-weight:700;">${index + 1}</div>`,
  });
}

export default function RegionalMapPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const camerasLayerRef = useRef<L.LayerGroup | null>(null);
  const zonesLayerRef = useRef<L.LayerGroup | null>(null);
  const violationsLayerRef = useRef<L.LayerGroup | null>(null);
  const draftLayerRef = useRef<L.LayerGroup | null>(null);
  const cameraMarkersRef = useRef<Map<string, L.Marker>>(new Map());

  // Layer toggles (matching Regional Map.png variants)
  const [showCameras, setShowCameras] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [showViolations, setShowViolations] = useState(true);
  const [showLegend, setShowLegend] = useState(false);

  // Search box
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  // Manage Restricted Zone mode (matching Regional Map - Manage Restricted Zone.png)
  const [editMode, setEditMode] = useState(false);
  const [draftPoints, setDraftPoints] = useState<GeoLngLat[]>([]);
  const [zoneName, setZoneName] = useState('');
  const [zoneDescription, setZoneDescription] = useState('');
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);

  const editModeRef = useRef(editMode);
  useEffect(() => {
    editModeRef.current = editMode;
  }, [editMode]);

  const camerasQuery = useQuery({
    queryKey: ['cctv', 'map', user?.region.id],
    queryFn: () => cctvApi.list(),
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  const zonesQuery = useQuery({
    queryKey: ['zones', user?.region.id],
    queryFn: () => zoneApi.list(),
    enabled: Boolean(user),
    staleTime: 30_000,
  });

  const activeReportsQuery = useQuery({
    queryKey: ['reports', 'map-active', user?.region.id],
    queryFn: () =>
      reportApi.list({
        statuses: ['NEED_ACTION', 'NEEDS_REVISION'],
        pageSize: 50,
      }),
    enabled: Boolean(user),
    staleTime: 30_000,
  });

  const cameras = camerasQuery.data?.cameras ?? [];
  const zones = zonesQuery.data ?? [];
  const activeReports = activeReportsQuery.data?.reports ?? [];

  const createZoneMutation = useMutation({
    mutationFn: zoneApi.create,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['zones'] });
      pushToast({
        variant: 'success',
        title: 'Zona terlarang berhasil ditambahkan',
        description: 'Poligon baru langsung aktif pada Peta Wilayah & Portal Publik.',
      });
      setDraftPoints([]);
      setZoneName('');
      setZoneDescription('');
      setEditMode(false);
    },
    onError: (err) => {
      pushToast({
        variant: 'error',
        title: 'Gagal menyimpan zona terlarang',
        description:
          err instanceof Error
            ? err.message
            : 'Pastikan poligon memiliki minimal 3 titik dan tidak saling berpotongan.',
      });
    },
  });

  const updateZoneMutation = useMutation({
    mutationFn: ({ id, name, description }: { id: string; name: string; description: string }) =>
      zoneApi.update(id, { name, description: description || null }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['zones'] });
      pushToast({ variant: 'success', title: 'Zona terlarang berhasil diperbarui' });
      setEditingZoneId(null);
      setZoneName('');
      setZoneDescription('');
    },
    onError: (err) => {
      pushToast({
        variant: 'error',
        title: 'Gagal memperbarui zona',
        description: err instanceof Error ? err.message : undefined,
      });
    },
  });

  const deleteZoneMutation = useMutation({
    mutationFn: zoneApi.remove,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['zones'] });
      pushToast({ variant: 'info', title: 'Zona terlarang dihapus' });
    },
    onError: (err) => {
      pushToast({
        variant: 'error',
        title: 'Gagal menghapus zona',
        description: err instanceof Error ? err.message : undefined,
      });
    },
  });

  // 1. Initialize Leaflet Map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const centerLat = user?.region.centerLat ?? -6.984049;
    const centerLng = user?.region.centerLng ?? 110.409582;
    const zoom = user?.region.defaultZoom ?? 13;

    const map = L.map(mapContainerRef.current, {
      center: [centerLat, centerLng],
      zoom,
      zoomControl: false, // Pakai tombol Cobalt Blue + / - kustom sesuai mockup
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    zonesLayerRef.current = L.layerGroup().addTo(map);
    camerasLayerRef.current = L.layerGroup().addTo(map);
    violationsLayerRef.current = L.layerGroup().addTo(map);
    draftLayerRef.current = L.layerGroup().addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (!editModeRef.current) return;
      const point: GeoLngLat = [
        Number(e.latlng.lng.toFixed(6)),
        Number(e.latlng.lat.toFixed(6)),
      ];
      setDraftPoints((prev) => [...prev, point]);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [user?.region.centerLat, user?.region.centerLng, user?.region.defaultZoom]);

  // Cursor hint during polygon drawing
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;
    container.style.cursor = editMode && !editingZoneId ? 'crosshair' : '';
  }, [editMode, editingZoneId]);

  // 2. Render Restricted Zones layer (GeoJSON [lng, lat] -> Leaflet [lat, lng])
  useEffect(() => {
    const layer = zonesLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!showZones && !editMode) return;

    for (const zone of zones) {
      const latLngs = zone.points.map(([lng, lat]) => [lat, lng] as [number, number]);
      if (latLngs.length < 3) continue;

      const polygon = L.polygon(latLngs, {
        color: '#DC2626',
        weight: 2,
        fillColor: '#EF4444',
        fillOpacity: 0.24,
      });

      polygon.bindPopup(
        `<div style="padding:12px 14px;min-width:210px;">
          <div style="font-size:11px;font-weight:700;color:#B91C1C;text-transform:uppercase;letter-spacing:.03em;">Restricted Zone</div>
          <div style="margin-top:3px;font-size:14px;font-weight:700;color:#0B132B;">${escapeHtml(zone.name)}</div>
          ${
            zone.description
              ? `<p style="margin-top:4px;font-size:12px;color:#475569;line-height:1.45;">${escapeHtml(zone.description)}</p>`
              : ''
          }
        </div>`,
      );
      polygon.addTo(layer);
    }
  }, [zones, showZones, editMode]);

  // 3. Render CCTV Camera Pins layer (hidden in Manage Restricted Zone mode like mockup)
  useEffect(() => {
    const layer = camerasLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    cameraMarkersRef.current.clear();
    if (!showCameras || editMode) return;

    const icon = createCctvMarkerIcon();
    for (const cam of cameras) {
      const marker = L.marker([cam.lat, cam.lng], { icon });
      const popupEl = document.createElement('div');
      popupEl.style.padding = '12px 14px';
      popupEl.style.minWidth = '230px';
      popupEl.innerHTML = `
        <div style="font-size:10px;font-weight:700;color:#043FA5;text-transform:uppercase;letter-spacing:.04em;">Kamera CCTV Publik</div>
        <div style="margin-top:3px;font-size:14px;font-weight:700;color:#0B132B;">${escapeHtml(cam.name)}</div>
        <div style="margin-top:2px;font-size:11px;color:#64748B;">${escapeHtml(cam.district ?? cam.city)}${cam.facilityCategory ? ` • ${escapeHtml(cam.facilityCategory)}` : ''}</div>
        ${
          !cam.coordsExact
            ? `<div style="margin-top:4px;font-size:10px;color:#94A3B8;font-style:italic;">Perkiraan titik lokasi kamera</div>`
            : ''
        }
        <button data-action="open-cctv" style="margin-top:10px;width:100%;padding:7px 12px;border-radius:10px;background:#043FA5;color:#FFFFFF;font-size:12px;font-weight:600;border:none;cursor:pointer;">
          Buka Live CCTV
        </button>
      `;

      const btn = popupEl.querySelector('button[data-action="open-cctv"]');
      btn?.addEventListener('click', () => {
        navigate(`/satpol/cctv/${encodeURIComponent(cam.id)}`);
      });

      marker.bindPopup(popupEl);
      marker.addTo(layer);
      cameraMarkersRef.current.set(cam.id, marker);
    }
  }, [cameras, showCameras, editMode, navigate]);

  // Auto-focus camera if ?cameraId=... is passed from CctvLivePage "View on Map"
  useEffect(() => {
    const focusCamId = searchParams.get('cameraId');
    if (!focusCamId || !mapRef.current) return;
    const cam = cameras.find((c) => c.id === focusCamId);
    if (!cam) return;
    mapRef.current.flyTo([cam.lat, cam.lng], 16, { duration: 0.8 });
    const marker = cameraMarkersRef.current.get(cam.id);
    if (marker) {
      window.setTimeout(() => marker.openPopup(), 450);
    }
  }, [searchParams, cameras]);

  // 4. Render Active Violations Pins layer (NEED_ACTION & NEEDS_REVISION)
  useEffect(() => {
    const layer = violationsLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!showViolations || editMode) return;

    const icon = createViolationMarkerIcon();
    for (const rep of activeReports) {
      // Offset sedikit agar pin tidak menumpuk persis di atas pin CCTV
      const marker = L.marker([rep.lat + 0.00018, rep.lng - 0.00022], { icon });
      const statusMeta = REPORT_STATUS_META[rep.status];
      const popupEl = document.createElement('div');
      popupEl.style.padding = '12px 14px';
      popupEl.style.minWidth = '240px';
      popupEl.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <span style="font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:#B91C1C;">${escapeHtml(rep.reportCode)}</span>
          <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;background:#FEF2F2;color:#B91C1C;border:1px solid #FECACA;">${escapeHtml(statusMeta.shortLabel)}</span>
        </div>
        <div style="margin-top:6px;font-size:13px;font-weight:700;color:#0B132B;line-height:1.35;">${escapeHtml(rep.address)}</div>
        <div style="margin-top:4px;font-size:11px;color:#475569;">${rep.detectedCount} PKL terdeteksi • ${escapeHtml(formatWibDateTime(rep.createdAt))}</div>
        <button data-action="open-report" style="margin-top:10px;width:100%;padding:7px 12px;border-radius:10px;background:#B91C1C;color:#FFFFFF;font-size:12px;font-weight:600;border:none;cursor:pointer;">
          Tindak Lanjuti
        </button>
      `;
      const btn = popupEl.querySelector('button[data-action="open-report"]');
      btn?.addEventListener('click', () => {
        navigate(`/satpol/laporan/${encodeURIComponent(rep.id)}`);
      });

      marker.bindPopup(popupEl);
      marker.addTo(layer);
    }
  }, [activeReports, showViolations, editMode, navigate]);

  // 5. Render Draft Polygon while drawing in Manage Restricted Zone mode
  useEffect(() => {
    const layer = draftLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!editMode || draftPoints.length === 0) return;

    const latLngs = draftPoints.map(([lng, lat]) => [lat, lng] as [number, number]);
    latLngs.forEach((ll, idx) => {
      L.marker(ll, { icon: createDraftVertexIcon(idx) }).addTo(layer);
    });

    if (latLngs.length >= 3) {
      L.polygon(latLngs, {
        color: '#043FA5',
        weight: 2.5,
        dashArray: '6 6',
        fillColor: '#73A6E9',
        fillOpacity: 0.28,
      }).addTo(layer);
    } else if (latLngs.length === 2) {
      L.polyline(latLngs, { color: '#043FA5', weight: 2.5, dashArray: '6 6' }).addTo(layer);
    }
  }, [editMode, draftPoints]);

  // Search suggestions across cameras, zones, and active reports
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const results: Array<{
      id: string;
      type: 'CCTV' | 'ZONE' | 'REPORT';
      title: string;
      subtitle: string;
      lat: number;
      lng: number;
    }> = [];

    for (const c of cameras) {
      if (
        c.name.toLowerCase().includes(q) ||
        c.regionLabel.toLowerCase().includes(q) ||
        (c.district ?? '').toLowerCase().includes(q)
      ) {
        results.push({
          id: `c-${c.id}`,
          type: 'CCTV',
          title: c.name,
          subtitle: c.regionLabel,
          lat: c.lat,
          lng: c.lng,
        });
      }
    }
    for (const z of zones) {
      if (z.name.toLowerCase().includes(q) && z.points.length > 0) {
        const [lng, lat] = z.points[0]!;
        results.push({
          id: `z-${z.id}`,
          type: 'ZONE',
          title: z.name,
          subtitle: 'Restricted Zone',
          lat,
          lng,
        });
      }
    }
    for (const r of activeReports) {
      if (
        r.address.toLowerCase().includes(q) ||
        r.reportCode.toLowerCase().includes(q)
      ) {
        results.push({
          id: `r-${r.id}`,
          type: 'REPORT',
          title: `${r.reportCode} — ${r.address}`,
          subtitle: `${r.detectedCount} PKL aktif`,
          lat: r.lat,
          lng: r.lng,
        });
      }
    }

    return results.slice(0, 6);
  }, [searchQuery, cameras, zones, activeReports]);

  const handleSaveZone = () => {
    if (editingZoneId) {
      if (zoneName.trim().length < 3) {
        pushToast({
          variant: 'warning',
          title: 'Nama zona minimal 3 karakter',
        });
        return;
      }
      updateZoneMutation.mutate({
        id: editingZoneId,
        name: zoneName.trim(),
        description: zoneDescription.trim(),
      });
      return;
    }

    if (zoneName.trim().length < 3) {
      pushToast({
        variant: 'warning',
        title: 'Masukkan nama zona terlarang terlebih dahulu (min. 3 karakter)',
      });
      return;
    }
    if (draftPoints.length < 3) {
      pushToast({
        variant: 'warning',
        title: 'Poligon membutuhkan minimal 3 titik',
        description: 'Klik langsung pada peta untuk menandai sudut-sudut zona terlarang.',
      });
      return;
    }

    createZoneMutation.mutate({
      name: zoneName.trim(),
      description: zoneDescription.trim() || null,
      points: draftPoints,
    });
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setDraftPoints([]);
    setZoneName('');
    setZoneDescription('');
    setEditingZoneId(null);
  };

  const startRenameZone = (zone: RestrictedZoneDto) => {
    setEditingZoneId(zone.id);
    setZoneName(zone.name);
    setZoneDescription(zone.description ?? '');
    setDraftPoints([]);
    if (zone.points.length > 0 && mapRef.current) {
      const [lng, lat] = zone.points[0]!;
      mapRef.current.flyTo([lat, lng], 16, { duration: 0.6 });
    }
  };

  const isSaving = createZoneMutation.isPending || updateZoneMutation.isPending;

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Interactive Leaflet Map Container */}
      <div ref={mapContainerRef} className="h-full w-full z-0" />

      {/* Top Floating Controls — Matches Regional Map.png & Regional Map - Mobile.png */}
      {!editMode ? (
        <div className="pointer-events-none absolute inset-x-0 top-[74px] z-[400] flex justify-center px-3 lg:top-5 lg:px-4">
          <div
            data-tour="satpol-map-controls"
            className="pointer-events-auto flex w-full max-w-5xl flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:rounded-2xl md:bg-[#9EC1EB]/45 md:p-2 md:shadow-lg md:backdrop-blur-md"
          >
            {/* Search Box */}
            <div className="relative w-full md:min-w-[200px] md:flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => window.setTimeout(() => setSearchFocused(false), 180)}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search street or location..."
                className="w-full rounded-xl bg-white py-2.5 pl-10 pr-8 text-xs font-medium text-slate-800 shadow-md placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 md:shadow-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}

              {searchFocused && searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-xl border border-accent/60 bg-white shadow-xl">
                  {searchResults.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        mapRef.current?.flyTo([item.lat, item.lng], 16, { duration: 0.7 });
                        setSearchFocused(false);
                      }}
                      className="flex w-full items-start justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5 text-left text-xs last:border-0 hover:bg-canvas"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-primary">{item.title}</p>
                        <p className="truncate text-[11px] text-slate-500">{item.subtitle}</p>
                      </div>
                      <span className="shrink-0 rounded bg-accent/30 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                        {item.type}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 3 Layer Toggle Checkbox Pills — 1 horizontal row on mobile */}
            <div className="grid w-full grid-cols-3 gap-1.5 md:flex md:w-auto md:items-center md:gap-2">
              {[
                { label: 'CCTV Cameras', checked: showCameras, toggle: () => setShowCameras((v) => !v) },
                { label: 'Restricted Zone', checked: showZones, toggle: () => setShowZones((v) => !v) },
                {
                  label: 'Active Violations',
                  checked: showViolations,
                  toggle: () => setShowViolations((v) => !v),
                },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.toggle}
                  className="inline-flex items-center justify-between gap-1 rounded-xl bg-white px-2.5 py-2 text-[10.5px] font-semibold text-primary shadow-md transition hover:bg-canvas md:justify-start md:gap-2.5 md:px-3.5 md:py-2.5 md:text-xs md:shadow-sm"
                >
                  <span className="truncate">{item.label}</span>
                  <span
                    className={cn(
                      'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded transition-colors md:h-4 md:w-4',
                      item.checked ? 'bg-primary text-white' : 'bg-slate-400 text-white',
                    )}
                  >
                    <Check className="h-2.5 w-2.5 stroke-[3] md:h-3 md:w-3" />
                  </span>
                </button>
              ))}
            </div>

            {/* + Manage Restricted Zone Button (Desktop Top Bar) */}
            <button
              type="button"
              onClick={() => {
                setEditMode(true);
                setShowZones(true);
              }}
              className="hidden items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-primary/90 md:inline-flex"
            >
              <Plus className="h-4 w-4" />
              <span>Manage Restricted Zone</span>
            </button>
          </div>
        </div>
      ) : (
        /* Manage Restricted Zone Edit Mode — Matches Regional Map - Manage Restricted Zone.png */
        <>
          <div className="pointer-events-none absolute inset-x-0 top-[74px] z-[400] flex justify-center px-4 lg:top-5">
            <div className="pointer-events-auto flex items-center gap-3">
              <button
                type="button"
                onClick={handleCancelEdit}
                className="rounded-xl bg-[#73A6E9]/85 px-5 py-2.5 text-xs font-bold text-white shadow-md backdrop-blur-sm transition hover:bg-slate-600"
              >
                Cancel Edit
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveZone}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-primary/90 disabled:opacity-60"
              >
                {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Save Changes</span>
              </button>
            </div>
          </div>

          {/* Floating Zone Editor Drawer */}
          <div className="absolute right-4 top-[128px] z-[400] max-h-[calc(100vh-9rem)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-accent/60 bg-white/95 p-4 shadow-2xl backdrop-blur-md lg:top-20">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h2 className="text-sm font-bold text-primary">
                {editingZoneId ? 'Edit Info Zona' : 'Gambar Zona Terlarang Baru'}
              </h2>
              {editingZoneId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingZoneId(null);
                    setZoneName('');
                    setZoneDescription('');
                  }}
                  className="text-[11px] font-semibold text-secondary hover:text-primary"
                >
                  + Buat Baru
                </button>
              )}
            </div>

            <div className="mt-3 space-y-2.5">
              <div>
                <label className="text-[11px] font-semibold text-slate-600">
                  Nama Zona Terlarang *
                </label>
                <input
                  type="text"
                  value={zoneName}
                  onChange={(e) => setZoneName(e.target.value)}
                  placeholder="cth. Trotoar Jl. Pandanaran"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600">
                  Keterangan (Opsional)
                </label>
                <input
                  type="text"
                  value={zoneDescription}
                  onChange={(e) => setZoneDescription(e.target.value)}
                  placeholder="cth. Jalur pedestrian utama bebas PKL"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-primary focus:outline-none"
                />
              </div>

              {!editingZoneId && (
                <div className="rounded-xl bg-canvas p-3 text-[11px] text-slate-600">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-primary">
                      Titik Poligon: {draftPoints.length} / min. 3
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={draftPoints.length === 0}
                        onClick={() => setDraftPoints((p) => p.slice(0, -1))}
                        className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 shadow-sm hover:text-primary disabled:opacity-40"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Undo
                      </button>
                      <button
                        type="button"
                        disabled={draftPoints.length === 0}
                        onClick={() => setDraftPoints([])}
                        className="rounded-lg bg-white px-2 py-1 text-[10px] font-semibold text-red-600 shadow-sm disabled:opacity-40"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                  <p className="mt-1.5 leading-relaxed">
                    Klik titik-titik sudut area terlarang langsung di atas peta, lalu klik{' '}
                    <strong>Save Changes</strong>.
                  </p>
                </div>
              )}
            </div>

            {/* Existing Zones List */}
            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="text-[11px] font-bold text-slate-500">
                Zona Aktif di {user?.region.city} ({zones.length})
              </p>
              <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto pr-1">
                {zones.map((z) => (
                  <div
                    key={z.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-canvas/70 px-2.5 py-2 text-xs"
                  >
                    <span className="truncate font-semibold text-slate-700">{z.name}</span>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startRenameZone(z)}
                        className="rounded-lg p-1 text-primary hover:bg-accent/30"
                        title="Edit nama zona"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={deleteZoneMutation.isPending}
                        onClick={() => deleteZoneMutation.mutate(z.id)}
                        className="rounded-lg p-1 text-red-600 hover:bg-red-50"
                        title="Hapus zona"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Bottom-Left Map Legend Toggle ('i' Cobalt Blue square matching mockup) */}
      <div className="absolute bottom-5 left-3.5 z-[400] lg:bottom-6 lg:left-6">
        {showLegend && (
          <div className="mb-3 w-64 rounded-2xl border border-accent/60 bg-white/95 p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-bold text-primary">Map Legend</span>
              <button
                type="button"
                onClick={() => setShowLegend(false)}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-3 space-y-2.5 text-xs text-slate-700">
              <div className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                  ●
                </span>
                <span>Kamera CCTV Publik ({cameras.length})</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#B91C1C] text-xs font-extrabold text-white">
                  !
                </span>
                <span>Pelanggaran Aktif ({activeReports.length})</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="h-4 w-6 rounded border-2 border-red-600 bg-red-500/25" />
                <span>Zona Terlarang PKL ({zones.length})</span>
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowLegend((v) => !v)}
          className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white shadow-lg transition hover:bg-primary/90"
          aria-label="Tampilkan legenda peta"
          title="Map Legend"
        >
          <Info className="h-5 w-5" />
        </button>
      </div>

      {/* Bottom-Center Mobile '+ Manage Restricted Zone' CTA (matching Regional Map - Mobile.png) */}
      {!editMode && (
        <div className="absolute bottom-5 left-1/2 z-[400] -translate-x-1/2 md:hidden">
          <button
            type="button"
            onClick={() => {
              setEditMode(true);
              setShowZones(true);
            }}
            className="inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-xl bg-primary px-4 text-xs font-semibold text-white shadow-lg transition hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            <span>Manage Restricted Zone</span>
          </button>
        </div>
      )}

      {/* Bottom-Right Custom Cobalt Blue Zoom Controls (matching Regional Map.png & Mobile) */}
      <div className="absolute bottom-5 right-3.5 z-[400] flex flex-col gap-2 lg:bottom-6 lg:right-6">
        <button
          type="button"
          onClick={() => mapRef.current?.zoomIn()}
          className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white shadow-lg transition hover:bg-primary/90"
          aria-label="Perbesar peta"
        >
          <Plus className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => mapRef.current?.zoomOut()}
          className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white shadow-lg transition hover:bg-primary/90"
          aria-label="Perkecil peta"
        >
          <Minus className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
