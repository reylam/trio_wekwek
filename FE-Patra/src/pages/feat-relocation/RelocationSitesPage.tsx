import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import L from 'leaflet';
import {
  AlertTriangle,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { DinasTopHeader } from '@/components/layout/DinasLayout';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/apiClient';
import {
  escapeHtml,
  parseCommaTags,
  validateRelocationSiteForm,
} from '@/lib/dinasHelpers';
import { relocationSiteApi } from '@/services/dinasApi';
import type { RelocationSiteDto } from '@/types';

function createRelocationMarkerIcon(highlighted = false): L.DivIcon {
  const bg = highlighted ? '#043FA5' : '#059669';
  return L.divIcon({
    className: 'patra-map-pin',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
    html: `<div style="width:30px;height:30px;border-radius:9999px;background:${bg};border:2.5px solid #FFFFFF;box-shadow:0 4px 12px rgba(4,63,165,0.35);display:flex;align-items:center;justify-content:center;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>
    </div>`,
  });
}

interface SiteFormState {
  name: string;
  address: string;
  lat: string;
  lng: string;
  tradeCategoriesRaw: string;
  facilitiesRaw: string;
}

export default function RelocationSitesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const [search, setSearch] = useState('');
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<RelocationSiteDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RelocationSiteDto | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const defaultLat = user?.region.centerLat ?? -6.1864;
  const defaultLng = user?.region.centerLng ?? 106.834;

  const [formState, setFormState] = useState<SiteFormState>({
    name: '',
    address: '',
    lat: String(defaultLat),
    lng: String(defaultLng),
    tradeCategoriesRaw: 'Kuliner, Minuman',
    facilitiesRaw: 'Listrik, Air Bersih, Toilet',
  });

  // Overview map refs
  const overviewMapContainerRef = useRef<HTMLDivElement | null>(null);
  const overviewMapRef = useRef<L.Map | null>(null);
  const overviewLayerRef = useRef<L.LayerGroup | null>(null);
  const overviewMarkersRef = useRef<Map<string, L.Marker>>(new Map());

  // Click-to-pin picker map refs (inside modal)
  const pickerMapContainerRef = useRef<HTMLDivElement | null>(null);
  const pickerMapRef = useRef<L.Map | null>(null);
  const pickerMarkerRef = useRef<L.Marker | null>(null);

  const sitesQuery = useQuery({
    queryKey: ['dinas', 'relocation-sites', user?.region.id],
    queryFn: () => relocationSiteApi.list(),
  });

  const sites = sitesQuery.data ?? [];

  const filteredSites = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sites;
    return sites.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.address.toLowerCase().includes(q) ||
        s.tradeCategories.some((c) => c.toLowerCase().includes(q)) ||
        s.facilities.some((f) => f.toLowerCase().includes(q)),
    );
  }, [sites, search]);

  // Init overview Leaflet map
  useEffect(() => {
    const container = overviewMapContainerRef.current;
    if (!container || overviewMapRef.current) return;

    const map = L.map(container, {
      center: [defaultLat, defaultLng],
      zoom: user?.region.defaultZoom ?? 13,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const layer = L.layerGroup().addTo(map);
    overviewMapRef.current = map;
    overviewLayerRef.current = layer;

    return () => {
      map.remove();
      overviewMapRef.current = null;
      overviewLayerRef.current = null;
      overviewMarkersRef.current.clear();
    };
  }, [defaultLat, defaultLng, user?.region.defaultZoom]);

  // Sync overview markers
  useEffect(() => {
    const map = overviewMapRef.current;
    const layer = overviewLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    overviewMarkersRef.current.clear();

    const bounds: L.LatLngTuple[] = [];
    const icon = createRelocationMarkerIcon(false);

    for (const site of filteredSites) {
      const marker = L.marker([site.lat, site.lng], { icon }).addTo(layer);
      marker.bindPopup(
        `<div style="font-family:'Plus Jakarta Sans',sans-serif;min-width:210px;">
          <p style="margin:0;font-size:13px;font-weight:700;color:#043FA5;">${escapeHtml(site.name)}</p>
          <p style="margin:4px 0;font-size:11px;color:#475569;">${escapeHtml(site.address)}</p>
          <p style="margin:4px 0 0;font-size:11px;color:#0F172A;"><strong>Kategori:</strong> ${escapeHtml(site.tradeCategories.join(', '))}</p>
          <p style="margin:2px 0 0;font-size:11px;color:#0F172A;"><strong>Fasilitas:</strong> ${escapeHtml(site.facilities.join(', '))}</p>
        </div>`,
      );
      overviewMarkersRef.current.set(site.id, marker);
      bounds.push([site.lat, site.lng]);
    }

    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 14);
    }
  }, [filteredSites]);

  // Init Click-to-Pin Picker Map inside modal
  useEffect(() => {
    if (!formModalOpen) return;
    const container = pickerMapContainerRef.current;
    if (!container) return;

    const initLat = Number.parseFloat(formState.lat) || defaultLat;
    const initLng = Number.parseFloat(formState.lng) || defaultLng;

    const map = L.map(container, {
      center: [initLat, initLng],
      zoom: 14,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker([initLat, initLng], {
      icon: createRelocationMarkerIcon(true),
      draggable: true,
    }).addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      setFormState((prev) => ({
        ...prev,
        lat: pos.lat.toFixed(6),
        lng: pos.lng.toFixed(6),
      }));
    });

    map.on('click', (evt: L.LeafletMouseEvent) => {
      marker.setLatLng(evt.latlng);
      setFormState((prev) => ({
        ...prev,
        lat: evt.latlng.lat.toFixed(6),
        lng: evt.latlng.lng.toFixed(6),
      }));
    });

    pickerMapRef.current = map;
    pickerMarkerRef.current = marker;

    const timer = window.setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      window.clearTimeout(timer);
      map.remove();
      pickerMapRef.current = null;
      pickerMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formModalOpen]);

  // Sync manual lat/lng typing back to picker marker
  useEffect(() => {
    const map = pickerMapRef.current;
    const marker = pickerMarkerRef.current;
    if (!map || !marker || !formModalOpen) return;
    const latNum = Number(formState.lat);
    const lngNum = Number(formState.lng);
    if (
      Number.isFinite(latNum) &&
      Number.isFinite(lngNum) &&
      latNum >= -90 &&
      latNum <= 90 &&
      lngNum >= -180 &&
      lngNum <= 180
    ) {
      marker.setLatLng([latNum, lngNum]);
      map.panTo([latNum, lngNum]);
    }
  }, [formState.lat, formState.lng, formModalOpen]);

  const invalidateSitesAndDashboard = async () => {
    await queryClient.invalidateQueries({ queryKey: ['dinas', 'relocation-sites'] });
    await queryClient.invalidateQueries({ queryKey: ['dinas', 'analytics'] });
    await queryClient.invalidateQueries({ queryKey: ['dinas', 'reports'] });
  };

  const saveMutation = useMutation({
    mutationFn: async (
      payload: ReturnType<typeof validateRelocationSiteForm>['value'],
    ) => {
      if (!payload) throw new Error('Data form tidak valid.');
      if (editingSite) {
        return relocationSiteApi.update(editingSite.id, payload);
      }
      return relocationSiteApi.create(payload);
    },
    onSuccess: async (saved) => {
      setFormModalOpen(false);
      await invalidateSitesAndDashboard();
      pushToast({
        variant: 'success',
        title: editingSite ? 'Lokasi Binaan Diperbarui' : 'Lokasi Binaan Ditambahkan',
        description: saved.name,
      });
    },
    onError: (err) => {
      pushToast({
        variant: 'error',
        title: 'Gagal Menyimpan Lokasi Binaan',
        description:
          err instanceof ApiError
            ? err.message
            : 'Terjadi kesalahan saat menyimpan data lokasi binaan.',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => relocationSiteApi.remove(id),
    onSuccess: async (res) => {
      const targetName = deleteTarget?.name ?? 'Lokasi Binaan';
      setDeleteTarget(null);
      await invalidateSitesAndDashboard();
      pushToast({
        variant: res.archived ? 'info' : 'success',
        title: res.archived
          ? 'Lokasi Binaan Diarsipkan'
          : 'Lokasi Binaan Dihapus Permanen',
        description: res.archived
          ? `${targetName} diarsipkan karena sudah terikat pada Berita Acara tervalidasi.`
          : `${targetName} berhasil dihapus dari daftar aktif.`,
      });
    },
    onError: (err) => {
      pushToast({
        variant: 'error',
        title: 'Gagal Menghapus Lokasi Binaan',
        description:
          err instanceof ApiError
            ? err.message
            : 'Tidak dapat menghapus data lokasi binaan.',
      });
    },
  });

  const openCreateModal = () => {
    setEditingSite(null);
    setFormErrors({});
    setFormState({
      name: '',
      address: '',
      lat: defaultLat.toFixed(6),
      lng: defaultLng.toFixed(6),
      tradeCategoriesRaw: 'Kuliner, Minuman',
      facilitiesRaw: 'Listrik, Air Bersih, Toilet',
    });
    setFormModalOpen(true);
  };

  const openEditModal = (site: RelocationSiteDto) => {
    setEditingSite(site);
    setFormErrors({});
    setFormState({
      name: site.name,
      address: site.address,
      lat: site.lat.toFixed(6),
      lng: site.lng.toFixed(6),
      tradeCategoriesRaw: site.tradeCategories.join(', '),
      facilitiesRaw: site.facilities.join(', '),
    });
    setFormModalOpen(true);
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    const check = validateRelocationSiteForm(formState);
    if (!check.valid || !check.value) {
      setFormErrors(check.errors);
      return;
    }
    setFormErrors({});
    saveMutation.mutate(check.value);
  };

  const focusSiteOnMap = (site: RelocationSiteDto) => {
    const map = overviewMapRef.current;
    const marker = overviewMarkersRef.current.get(site.id);
    if (!map) return;
    map.setView([site.lat, site.lng], 15, { animate: true });
    marker?.openPopup();
  };

  const previewCategories = parseCommaTags(formState.tradeCategoriesRaw);
  const previewFacilities = parseCommaTags(formState.facilitiesRaw);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <DinasTopHeader />

      <div className="space-y-6">
        {/* Peta Sebaran Lokasi Binaan */}
        <section
          data-tour="dinas-sites-map"
          className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Peta Lokasi Binaan Resmi ({user?.region.city})
              </h2>
              <p className="text-xs text-slate-500">
                Klik penanda hijau untuk melihat detail fasilitas dan kategori dagangan
                lokasi binaan.
              </p>
            </div>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              <span>Tambah Lokasi Binaan</span>
            </button>
          </div>

          <div
            ref={overviewMapContainerRef}
            className="h-[300px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
          />
        </section>

        {/* Daftar & Pencarian Lokasi Binaan */}
        <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Direktori Lokasi Binaan Aktif
              </h2>
              <p className="text-xs text-slate-500">
                Menampilkan {filteredSites.length} lokasi binaan tanpa pembatasan kuota lapak
              </p>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama, alamat, atau kategori..."
                className="w-full rounded-xl border border-slate-200 bg-canvas/70 py-2 pl-9 pr-3 text-xs text-slate-800 outline-none focus:border-primary focus:bg-white"
              />
            </div>
          </div>

          {sitesQuery.isLoading ? (
            <div className="flex min-h-[200px] items-center justify-center gap-3 text-sm font-semibold text-primary">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Memuat data lokasi binaan...</span>
            </div>
          ) : filteredSites.length === 0 ? (
            <div className="my-6 rounded-2xl border border-dashed border-slate-200 bg-canvas/60 px-6 py-10 text-center">
              <p className="text-sm font-semibold text-slate-700">
                Belum ada Lokasi Binaan yang cocok
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Tambahkan Lokasi Binaan baru dengan tombol di atas atau ubah pencarian.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredSites.map((site) => (
                <article
                  key={site.id}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-canvas/50 p-4 transition hover:border-primary/40 hover:bg-white"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => focusSiteOnMap(site)}
                        className="text-left text-sm font-bold text-primary hover:underline"
                      >
                        {site.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => focusSiteOnMap(site)}
                        className="rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-50"
                        title="Sorot di peta"
                        aria-label={`Sorot ${site.name} di peta`}
                      >
                        <MapPin className="h-4 w-4" />
                      </button>
                    </div>

                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      {site.address}
                    </p>
                    <p className="mt-1.5 font-mono text-[11px] text-slate-400">
                      {site.lat.toFixed(5)}, {site.lng.toFixed(5)}
                    </p>

                    <div className="mt-3 space-y-2">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          Kategori Dagangan
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {site.tradeCategories.map((cat) => (
                            <span
                              key={cat}
                              className="rounded-full bg-[#E9F1FD] px-2.5 py-0.5 text-[11px] font-semibold text-primary"
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          Fasilitas
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {site.facilities.map((fac) => (
                            <span
                              key={fac}
                              className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700"
                            >
                              {fac}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-200/70 pt-3">
                    <button
                      type="button"
                      onClick={() => openEditModal(site)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-primary hover:text-primary"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(site)}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Hapus</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Modal Tambah / Edit Lokasi Binaan dengan Click-to-Pin */}
      {formModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-[1px]">
          <div className="my-8 w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-lg font-bold text-primary">
                  {editingSite ? 'Edit Lokasi Binaan' : 'Tambah Lokasi Binaan Baru'}
                </h2>
                <p className="text-xs text-slate-500">
                  Klik atau seret pin di peta untuk menetapkan titik koordinat yang akurat.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Tutup form lokasi binaan"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Nama Lokasi Binaan / Selter
                </label>
                <input
                  type="text"
                  value={formState.name}
                  onChange={(e) => setFormState((s) => ({ ...s, name: e.target.value }))}
                  placeholder="Contoh: Selter PKL Taman Menteri Supeno"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-canvas/60 px-3.5 py-2 text-xs text-slate-900 outline-none focus:border-primary focus:bg-white"
                />
                {formErrors.name && (
                  <p className="mt-1 text-[11px] text-red-600">{formErrors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Alamat Lengkap
                </label>
                <input
                  type="text"
                  value={formState.address}
                  onChange={(e) =>
                    setFormState((s) => ({ ...s, address: e.target.value }))
                  }
                  placeholder="Contoh: Jl. Taman Menteri Supeno No. 1, Semarang"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-canvas/60 px-3.5 py-2 text-xs text-slate-900 outline-none focus:border-primary focus:bg-white"
                />
                {formErrors.address && (
                  <p className="mt-1 text-[11px] text-red-600">{formErrors.address}</p>
                )}
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    Pilih Koordinat (Click-to-Pin Peta)
                  </span>
                  <span className="font-mono text-[11px] text-primary">
                    {formState.lat}, {formState.lng}
                  </span>
                </div>
                <div
                  ref={pickerMapContainerRef}
                  className="h-52 w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
                />
                <div className="mt-2.5 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500">
                      Latitude
                    </label>
                    <input
                      type="text"
                      value={formState.lat}
                      onChange={(e) =>
                        setFormState((s) => ({ ...s, lat: e.target.value }))
                      }
                      className="mt-0.5 w-full rounded-xl border border-slate-200 bg-canvas/60 px-3 py-1.5 font-mono text-xs text-slate-900 outline-none focus:border-primary focus:bg-white"
                    />
                    {formErrors.lat && (
                      <p className="mt-1 text-[11px] text-red-600">{formErrors.lat}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500">
                      Longitude
                    </label>
                    <input
                      type="text"
                      value={formState.lng}
                      onChange={(e) =>
                        setFormState((s) => ({ ...s, lng: e.target.value }))
                      }
                      className="mt-0.5 w-full rounded-xl border border-slate-200 bg-canvas/60 px-3 py-1.5 font-mono text-xs text-slate-900 outline-none focus:border-primary focus:bg-white"
                    />
                    {formErrors.lng && (
                      <p className="mt-1 text-[11px] text-red-600">{formErrors.lng}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Kategori Dagangan (pisahkan koma)
                  </label>
                  <input
                    type="text"
                    value={formState.tradeCategoriesRaw}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        tradeCategoriesRaw: e.target.value,
                      }))
                    }
                    placeholder="Kuliner, Minuman, Aksesoris"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-canvas/60 px-3.5 py-2 text-xs text-slate-900 outline-none focus:border-primary focus:bg-white"
                  />
                  {formErrors.tradeCategories && (
                    <p className="mt-1 text-[11px] text-red-600">
                      {formErrors.tradeCategories}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {previewCategories.map((c) => (
                      <span
                        key={c}
                        className="rounded-full bg-[#E9F1FD] px-2 py-0.5 text-[10px] font-semibold text-primary"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Fasilitas Tersedia (pisahkan koma)
                  </label>
                  <input
                    type="text"
                    value={formState.facilitiesRaw}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, facilitiesRaw: e.target.value }))
                    }
                    placeholder="Listrik, Air Bersih, Toilet"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-canvas/60 px-3.5 py-2 text-xs text-slate-900 outline-none focus:border-primary focus:bg-white"
                  />
                  {formErrors.facilities && (
                    <p className="mt-1 text-[11px] text-red-600">
                      {formErrors.facilities}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {previewFacilities.map((f) => (
                      <span
                        key={f}
                        className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setFormModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-bold text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  {saveMutation.isPending && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  <span>{editingSite ? 'Simpan Perubahan' : 'Simpan Lokasi Binaan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus / Arsip */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Hapus Lokasi Binaan?
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Anda akan menghapus <strong>{deleteTarget.name}</strong>. Jika lokasi ini
                  sudah tercantum pada Berita Acara laporan tervalidasi, sistem otomatis
                  mengarsipkannya agar arsip dokumen tetap utuh.
                </p>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                <span>Ya, Hapus / Arsipkan</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
