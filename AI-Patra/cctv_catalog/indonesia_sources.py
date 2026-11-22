"""Aggregator for verified public, open-access, non-toll CCTV feeds across Indonesia.

Sources (all public municipal/ATCS portals & curated open HLS/FLV streams, zero auth bypass):
  - DKI Jakarta: jakcctv.jakarta.go.id/publik/data (Diskominfotik / Balitower HLS)
  - Kota Semarang: pantausemar.semarangkota.go.id (Dishub Semarang HLS + exact coordinates)
  - Kota Banda Aceh: cctv.bandaacehkota.go.id/api/cameras (Diskominfotik Banda Aceh HLS + Kecamatan/Gampong)
  - Kota Bengkulu: cctv.bengkulukota.go.id (Diskominfo Bengkulu HLS + exact coordinates)
  - Kota Pekanbaru: cctv.pekanbaru.go.id/cam (Diskominfo Pekanbaru HLS)
  - Kota Pekalongan: cctv.pekalongankota.go.id/api/config (Diskominfo Pekalongan HLS + exact coordinates)
  - Kota Surakarta (Solo): ccroom-dishub.surakarta.go.id/api/cctv (Dishub Surakarta FLV + exact coordinates)
  - Kota Mataram: cctv.mataramkota.go.id/cctv (Dishub Mataram HLS + exact coordinates)
  - Multi-city Indonesia (Yogyakarta, Bandung, Cianjur, Magelang, Palembang, Tasikmalaya, Padang):
    curated open HLS GeoJSON (Live-Environment-Streams), filtered to verified open non-403 hosts.

All toll road / jalan tol cameras are strictly excluded.
Administrative hierarchy (Provinsi -> Kota/Kabupaten -> Kecamatan -> Kelurahan/Desa) is populated from
upstream metadata, curated Indonesian street/area mappings, and cached reverse geocoding for exact coords.
"""

from __future__ import annotations

import concurrent.futures
import html as html_lib
import json
import logging
import math
import re
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests

def sanitize_id(value: str) -> str:
    """Create a filesystem-safe camera identifier."""
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "_", value.strip()).strip("_")
    return cleaned[:64] or "cam_unknown"

logger = logging.getLogger(__name__)

USER_AGENT = "PATRA-Public-CCTV-Indonesia/0.2"

# Strict non-toll filter regex (excludes jalan tol, gerbang tol, Jasa Marga, BPJT, etc.)
TOLL_PATTERN = re.compile(
    r"(?:\b(?:tol|toll|jasamarga|bpjt|cikampek|cipularang|jagora(?:wi)?|jorr|trans[\s-]?jawa|trans[\s-]?sumatra)\b"
    r"|gerbang\s*tol|pintu\s*tol|ruas\s*tol|jalan\s*tol|exit\s*tol|gt[\s._-][a-z0-9]+|\bkm[\s._-]?\d+)",
    re.IGNORECASE,
)

# Public HTTP-200 hosts that lack Access-Control-Allow-Origin headers (allowed in local CORS relay)
CORS_RELAY_ALLOWED_HOSTS: set[str] = {
    "atcs-dishub.bandung.go.id",
    "dev.cctv.magelangkota.go.id",
    "api.bandaacehkota.go.id",
}

# Curated open-source GeoJSON source families verified as publicly accessible HTTP 200 HLS streams
# (Excludes 403 Referer-restricted hosts like Salatiga/Denpasar/Wonosobo and dead 404 hosts)
LIVE_ENV_CITY_META: dict[str, dict[str, Any]] = {
    "cctv-jogjakota": {
        "city": "Kota Yogyakarta",
        "province": "DI Yogyakarta",
        "island": "Jawa",
        "lat": -7.7956,
        "lng": 110.3695,
        "attribution": "Diskominfosan Kota Yogyakarta",
    },
    "atcs-bandung": {
        "city": "Kota Bandung",
        "province": "Jawa Barat",
        "island": "Jawa",
        "lat": -6.9175,
        "lng": 107.6191,
        "attribution": "Dishub Kota Bandung (ATCS)",
    },
    "atcs-cianjur": {
        "city": "Kabupaten Cianjur",
        "province": "Jawa Barat",
        "island": "Jawa",
        "lat": -6.8168,
        "lng": 107.1425,
        "attribution": "Dishub Kabupaten Cianjur (ATCS)",
    },
    "cctv-magelang": {
        "city": "Kota Magelang",
        "province": "Jawa Tengah",
        "island": "Jawa",
        "lat": -7.4797,
        "lng": 110.2177,
        "attribution": "Diskominsta Kota Magelang",
    },
    "atcs-palembang": {
        "city": "Kota Palembang",
        "province": "Sumatera Selatan",
        "island": "Sumatera",
        "lat": -2.9761,
        "lng": 104.7754,
        "attribution": "Dishub Kota Palembang (ATCS)",
    },
    "atcs-tasikmalaya": {
        "city": "Kota Tasikmalaya",
        "province": "Jawa Barat",
        "island": "Jawa",
        "lat": -7.3274,
        "lng": 108.2207,
        "attribution": "Dishub Kota Tasikmalaya (ATCS)",
    },
    "cctv-padang": {
        "city": "Kota Padang",
        "province": "Sumatera Barat",
        "island": "Sumatera",
        "lat": -0.9471,
        "lng": 100.4172,
        "attribution": "Diskominfo Kota Padang",
    },
}

LIVE_ENV_GEOJSON_URL = (
    "https://raw.githubusercontent.com/william-ricchiuti/Live-Environment-Streams/main/streams.geojson"
)

# Curated fallback administrative rules (keyword -> (city_override_or_None, kecamatan, kelurahan))
# Used when a camera does not have exact coordinates or upstream district/subdistrict metadata.
JAKARTA_NAME_RULES: list[tuple[str, str, str, str]] = [
    ("pasar tanah abang", "Kota Jakarta Pusat", "Tanah Abang", "Kebon Kacang"),
    ("tanah abang", "Kota Jakarta Pusat", "Tanah Abang", "Kebon Kacang"),
    ("jati baru", "Kota Jakarta Pusat", "Tanah Abang", "Kampung Bali"),
    ("kebon melati", "Kota Jakarta Pusat", "Tanah Abang", "Kebon Melati"),
    ("senayan", "Kota Jakarta Pusat", "Tanah Abang", "Gelora"),
    ("bendungan hilir", "Kota Jakarta Pusat", "Tanah Abang", "Bendungan Hilir"),
    ("gerbang pemuda", "Kota Jakarta Pusat", "Tanah Abang", "Gelora"),
    ("mas mansyur", "Kota Jakarta Pusat", "Tanah Abang", "Karet Tengsin"),
    ("tentara pelajar", "Kota Jakarta Pusat", "Tanah Abang", "Gelora"),
    ("ladokgi", "Kota Jakarta Pusat", "Tanah Abang", "Bendungan Hilir"),
    ("uob plaza", "Kota Jakarta Pusat", "Tanah Abang", "Kebon Melati"),
    ("taman literasi", "Kota Jakarta Selatan", "Kebayoran Baru", "Melawai"),
    ("panglima polim", "Kota Jakarta Selatan", "Kebayoran Baru", "Melawai"),
    ("sultan agung", "Kota Jakarta Selatan", "Setiabudi", "Pasar Manggis"),
    ("thamrin", "Kota Jakarta Pusat", "Menteng", "Gondangdia"),
    ("bundaran hi", "Kota Jakarta Pusat", "Menteng", "Menteng"),
    ("monas", "Kota Jakarta Pusat", "Gambir", "Gambir"),
    ("merdeka", "Kota Jakarta Pusat", "Gambir", "Gambir"),
    ("senen", "Kota Jakarta Pusat", "Senen", "Senen"),
    ("kemayoran", "Kota Jakarta Pusat", "Kemayoran", "Kemayoran"),
    ("harmoni", "Kota Jakarta Pusat", "Gambir", "Petojo Utara"),
    ("s. parman", "Kota Jakarta Barat", "Grogol Petamburan", "Tanjung Duren Utara"),
    ("s parman", "Kota Jakarta Barat", "Grogol Petamburan", "Tanjung Duren Utara"),
    ("slipi", "Kota Jakarta Barat", "Palmerah", "Slipi"),
    ("grogol", "Kota Jakarta Barat", "Grogol Petamburan", "Grogol"),
    ("cengkareng", "Kota Jakarta Barat", "Cengkareng", "Cengkareng Barat"),
    ("kalideres", "Kota Jakarta Barat", "Kalideres", "Kalideres"),
    ("gatot subroto", "Kota Jakarta Selatan", "Setiabudi", "Kuningan Barat"),
    ("sudirman", "Kota Jakarta Selatan", "Kebayoran Baru", "Senayan"),
    ("semanggi", "Kota Jakarta Selatan", "Setiabudi", "Karet Semanggi"),
    ("blok m", "Kota Jakarta Selatan", "Kebayoran Baru", "Melawai"),
    ("tebet", "Kota Jakarta Selatan", "Tebet", "Tebet Timur"),
    ("pancoran", "Kota Jakarta Selatan", "Pancoran", "Pancoran"),
    ("pasar minggu", "Kota Jakarta Selatan", "Pasar Minggu", "Pasar Minggu"),
    ("kuningan", "Kota Jakarta Selatan", "Setiabudi", "Kuningan Timur"),
    ("mampang", "Kota Jakarta Selatan", "Mampang Prapatan", "Mampang Prapatan"),
    ("kemang", "Kota Jakarta Selatan", "Mampang Prapatan", "Bangka"),
    ("fatmawati", "Kota Jakarta Selatan", "Cilandak", "Cilandak Barat"),
    ("jatinegara", "Kota Jakarta Timur", "Jatinegara", "Bali Mester"),
    ("matraman", "Kota Jakarta Timur", "Matraman", "Palmeriam"),
    ("cawang", "Kota Jakarta Timur", "Kramat Jati", "Cawang"),
    ("pulogadung", "Kota Jakarta Timur", "Pulo Gadung", "Pulo Gadung"),
    ("cakung", "Kota Jakarta Timur", "Cakung", "Cakung Barat"),
    ("kampung melayu", "Kota Jakarta Timur", "Jatinegara", "Kampung Melayu"),
    ("kelapa gading", "Kota Jakarta Utara", "Kelapa Gading", "Kelapa Gading Timur"),
    ("sunter", "Kota Jakarta Utara", "Tanjung Priok", "Sunter Agung"),
    ("priok", "Kota Jakarta Utara", "Tanjung Priok", "Tanjung Priok"),
    ("pluit", "Kota Jakarta Utara", "Penjaringan", "Pluit"),
    ("ancol", "Kota Jakarta Utara", "Pademangan", "Ancol"),
]

CITY_KEYWORD_ADMIN_RULES: dict[str, list[tuple[str, str, str]]] = {
    "Kota Bandung": [
        ("batununggal", "Batununggal", "Batununggal"),
        ("buah batu", "Buahbatu", "Cijagra"),
        ("buahbatu", "Buahbatu", "Cijagra"),
        ("cibeureum", "Andir", "Campaka"),
        ("cicaheum", "Kiaracondong", "Babakan Surabaya"),
        ("pasteur", "Sukajadi", "Pasteur"),
        ("paskal", "Andir", "Kebon Jeruk"),
        ("samsat", "Kiaracondong", "Babakan Sari"),
        ("pahlawan", "Cibeunying Kaler", "Cihaur Geulis"),
        ("moh toha", "Regol", "Ciseureuh"),
        ("moh. toha", "Regol", "Ciseureuh"),
        ("kopo", "Bojongloa Kaler", "Kopo"),
        ("inhoptank", "Babakan Ciparay", "Babakan"),
        ("dago", "Coblong", "Dago"),
        ("braga", "Sumur Bandung", "Braga"),
        ("asia afrika", "Regol", "Balonggede"),
        ("alun", "Regol", "Balonggede"),
        ("cibaduyut", "Bojongloa Kidul", "Cibaduyut"),
        ("soekarno hatta", "Buahbatu", "Sekejati"),
        ("antapani", "Antapani", "Antapani Tengah"),
        ("arcamanik", "Arcamanik", "Cisaranten Kulon"),
        ("cibiru", "Cibiru", "Cipadung"),
        ("gedebage", "Gedebage", "Cisaranten Kidul"),
        ("ujungberung", "Ujung Berung", "Pasir Endah"),
        ("setiabudi", "Sukasari", "Isola"),
        ("sukajadi", "Sukajadi", "Sukabungah"),
        ("cicendo", "Cicendo", "Pasir Kaliki"),
        ("suci", "Cibeunying Kidul", "Sukapada"),
        ("laswi", "Batununggal", "Kacapiring"),
        ("sunda", "Sumur Bandung", "Merdeka"),
        ("merdeka", "Sumur Bandung", "Babakan Ciamis"),
        ("cihampelas", "Coblong", "Cipaganti"),
    ],
    "Kota Magelang": [
        ("alun", "Magelang Tengah", "Kemirirejo"),
        ("aloon", "Magelang Tengah", "Kemirirejo"),
        ("cacaban", "Magelang Tengah", "Cacaban"),
        ("kebonpolo", "Magelang Utara", "Potrobangsan"),
        ("wates", "Magelang Utara", "Wates"),
        ("tugu", "Magelang Utara", "Kramat Selatan"),
        ("kramat", "Magelang Utara", "Kramat Utara"),
        ("potrobangsan", "Magelang Utara", "Potrobangsan"),
        ("kedungsari", "Magelang Utara", "Kedungsari"),
        ("cpm", "Magelang Tengah", "Panjang"),
        ("diknas", "Magelang Tengah", "Cacaban"),
        ("dinsos", "Magelang Tengah", "Gelangan"),
        ("bni", "Magelang Tengah", "Kemirirejo"),
        ("psc", "Magelang Tengah", "Kemirirejo"),
        ("rejo", "Magelang Selatan", "Rejowinangun Utara"),
        ("tidar", "Magelang Selatan", "Tidar Utara"),
        ("jurangombo", "Magelang Selatan", "Jurangombo Utara"),
        ("magersari", "Magelang Selatan", "Magersari"),
        ("pasar rejowinangun", "Magelang Tengah", "Rejowinangun Utara"),
        ("gotong royong", "Magelang Selatan", "Magersari"),
        ("artos", "Magelang Selatan", "Magersari"),
        ("pakelan", "Magelang Selatan", "Tidar Selatan"),
    ],
    "Kota Pekanbaru": [
        ("sudirman", "Pekanbaru Kota", "Simpang Empat"),
        ("gajah mada", "Pekanbaru Kota", "Sumahilang"),
        ("diponegoro", "Sail", "Cinta Raja"),
        ("pattimura", "Sail", "Cinta Raja"),
        ("hangtuah", "Sail", "Suka Mulia"),
        ("hang tuah", "Sail", "Suka Mulia"),
        ("arifin ahmad", "Marpoyan Damai", "Sidomulyo Timur"),
        ("soekarno hatta", "Marpoyan Damai", "Sidomulyo Barat"),
        ("soebrantas", "Binawidya", "Simpang Baru"),
        ("hr. soebrantas", "Binawidya", "Simpang Baru"),
        ("panam", "Tuah Madani", "Tuah Karya"),
        ("riau", "Payung Sekaki", "Tampan"),
        ("tuanku tambusai", "Sukajadi", "Kampung Melayu"),
        ("nangka", "Sukajadi", "Jadirejo"),
        ("imam munandar", "Bukit Raya", "Tangkerang Selatan"),
        ("harapan raya", "Bukit Raya", "Tangkerang Utara"),
        ("ahmad yani", "Sukajadi", "Pulau Karam"),
        ("rumbai", "Rumbai", "Meranti Pandak"),
        ("yossudarso", "Rumbai", "Sri Meranti"),
        ("yos sudarso", "Rumbai", "Sri Meranti"),
        ("tenayan", "Tenayan Raya", "Kulim"),
        ("kaharuddin", "Bukit Raya", "Simpang Tiga"),
        ("nasution", "Marpoyan Damai", "Maharatu"),
        ("sm amin", "Binawidya", "Simpang Baru"),
        ("arengka", "Payung Sekaki", "Labuh Baru Barat"),
        ("durian", "Sukajadi", "Kampung Tengah"),
        ("melayu", "Sukajadi", "Kampung Melayu"),
        ("pasar bawah", "Senapelan", "Kampung Bandar"),
        ("senapelan", "Senapelan", "Kampung Dalam"),
        ("lima puluh", "Lima Puluh", "Rintis"),
        ("tanjung datuk", "Lima Puluh", "Pesisir"),
    ],
    "Kabupaten Cianjur": [
        ("alun-alun", "Cianjur", "Pamoyanan"),
        ("alun alun", "Cianjur", "Pamoyanan"),
        ("ciloto", "Cipanas", "Ciloto"),
        ("cipanas", "Cipanas", "Cipanas"),
        ("puncak", "Cipanas", "Ciloto"),
        ("gentur", "Cianjur", "Bojongherang"),
        ("muwardi", "Cianjur", "Bojongherang"),
        ("ciranjang", "Ciranjang", "Ciranjang"),
        ("karangtengah", "Karangtengah", "Sabandar"),
        ("warungkondang", "Warungkondang", "Jambudipa"),
        ("cugenang", "Cugenang", "Cijedil"),
        ("pacete", "Pacet", "Cipendawa"),
        ("pacet", "Pacet", "Cipendawa"),
        ("sukanagara", "Sukanagara", "Sukanagara"),
        ("cibeber", "Cibeber", "Cipetir"),
        ("mande", "Mande", "Murnisari"),
        ("sukaluyu", "Sukaluyu", "Hegarmanah"),
        ("bojongpicung", "Bojongpicung", "Bojongpicung"),
    ],
}

PROVINCE_NORMALIZE: dict[str, str] = {
    "daerah istimewa yogyakarta": "DI Yogyakarta",
    "yogyakarta": "DI Yogyakarta",
    "dki jakarta": "DKI Jakarta",
    "jakarta": "DKI Jakarta",
    "daerah khusus ibukota jakarta": "DKI Jakarta",
    "nanggroe aceh darussalam": "Aceh",
}


# Strip agency / city-camera owner prefixes before classifying public facilities so a plain road
# camera operated by DISHUB/POLDA/SATPOL PP is not misclassified as a government office.
CAMERA_OWNER_PREFIX_RE = re.compile(
    r"^(?:"
    r"(?:jkp|jkb|jks|jkt|jku)\s+(?:satpol\s*pp|satpolpp|dishub|polda|polri|dbm)\s+|"
    r"atcs\s+solo\s*[—–-]\s*|"
    r"(?:yogyakarta|magelang|palembang|padang|bandung|cianjur|tasikmalaya)\s+cctv\s*[-—–]\s*|"
    r"cctv\s+|atcs\s+"
    r")+",
    re.IGNORECASE,
)

PUBLIC_FACILITY_RULES: list[tuple[str, re.Pattern[str]]] = [
    (
        "Pasar & Pusat Belanja",
        re.compile(
            r"\b(?:pasar|ps\.|beringharjo|metro\s*johar|grosir\s*setono|pgs|klewer|"
            r"mall|plaza|gardena|ramayana|matahari|paragon|galeria|mirota|gramedia|"
            r"depan\s+lw|depan\s+ska|toko\s+\w+|superindo|transmart)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "Taman & Ruang Terbuka",
        re.compile(
            r"\b(?:alun[\s-]?alun|aloon[\s-]?aloon|taman|rthp?|edu\s*park|hutan\s*kota|"
            r"bustanussalatin|b\s+salatin|putroe\s*phang|kambang\s*iwak|punti\s*kayu|"
            r"malioboro|nol\s*km|titik\s*nol|simpang\s*lima|tugumuda|tugu\s*muda|tugu|"
            r"patung\s*diponegoro|lapangan|panggung|sriwedari|thr|senayan|pelican\s*udayana)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "Transportasi Publik",
        re.compile(
            r"\b(?:stasiun|station|balapan|terminal|tirtonadi|pelabuhan|dermaga|"
            r"ulee\s*lheue|bandara|airport|halte|shelter|jpo)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "Ibadah, Wisata & Olahraga",
        re.compile(
            r"\b(?:masjid|mesjid|gereja|pura|vihara|klenteng|mushola|sam\s*poo\s*kong|"
            r"benteng\s*kuto\s*besak|keraton|kraton|museum|candi|loji\s*gandrung|"
            r"rumah\s*singgah\s*tuan\s*kadi|jurug|wisata|pantai|stadion|lhong\s*raya|"
            r"mandala\s*krida|gor|jembatan\s*ampera)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "Pendidikan & Kesehatan",
        re.compile(
            r"\b(?:sekolah|sdn|smpn|sman|smkn|sma|smp|smk|bpk\s*penabur|ursulin|taman\s*siswa|"
            r"kampus|universitas|univ|poltek|uns|ukdw|ust|usm|ugm|unnes|undip|uii|uty|akpol|"
            r"rumah\s*sakit|rsud|rshs|rsu|rs\.?\s+\w+|kariadi|hermina|charitas|pku\s*muh|"
            r"puskesmas|pusk\.?|klinik|psc|dinkes)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "Kantor & Layanan Publik",
        re.compile(
            r"\b(?:balaikota|balai\s*kota|dprd|gubernur|walikota|bupati|pendopo|"
            r"kemantren|kecamatan|kelurahan|kel\.?\s+\w+|mpp|disdukcapil|bapenda|"
            r"samsat|bea\s*cukai|bmkg|kominfo|diknas|disdik|dinsos|taspen|pajak|"
            r"pengadilan|bank|bi|bri|bni|bpd|bpbd|pdam|blk|polsek|kodim|mako\s*brimob|"
            r"satpol|pkk|dispar|kepatihan|pupr|dishub|polda)\b",
            re.IGNORECASE,
        ),
    ),
]


def classify_public_facility(name: str) -> str:
    """Return Indonesian public facility category if the camera covers a public facility, else ''."""
    cleaned = CAMERA_OWNER_PREFIX_RE.sub("", (name or "").strip())
    # Normalize underscores so Malioboro_Pasar_Beringharjo matches word boundaries cleanly
    normalized = re.sub(r"[_/]+", " ", cleaned)
    for category, pattern in PUBLIC_FACILITY_RULES:
        if pattern.search(normalized):
            return category
    return ""


@dataclass
class PublicCamera:
    """Normalized public Indonesian non-toll CCTV camera with administrative hierarchy."""

    id: str
    name: str
    city: str
    province: str
    island: str
    region: str
    stream_url: str
    stream_type: str
    lat: float | None
    lng: float | None
    coords_exact: bool
    needs_cors_proxy: bool
    attribution: str
    source_portal: str
    district: str = ""  # Kecamatan
    subdistrict: str = ""  # Kelurahan / Desa / Gampong
    facility_category: str = ""  # Kategori Fasilitas Publik

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def is_toll_camera(*fields: str) -> bool:
    """Return True if any camera text field indicates a toll road / jalan tol."""
    joined = " ".join(f for f in fields if f)
    return bool(TOLL_PATTERN.search(joined))


def _needs_cors_proxy(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return host in CORS_RELAY_ALLOWED_HOSTS


def _clean_admin_name(value: str, prefixes: tuple[str, ...]) -> str:
    text = re.sub(r"\s+", " ", (value or "").strip())
    if not text:
        return ""
    for pref in prefixes:
        updated = re.sub(rf"^{pref}\.?\s+", "", text, flags=re.IGNORECASE).strip()
        if updated != text:
            text = updated
            break
    if text.lower() in ("unknown", "n/a", "-", "null", "none"):
        return ""
    return text


def clean_district(value: str) -> str:
    return _clean_admin_name(value, ("kecamatan", "kec", "distrik", "kapanewon", "kemantren"))


def clean_subdistrict(value: str) -> str:
    return _clean_admin_name(value, ("kelurahan", "kel", "desa", "gampong", "kalurahan"))


def _deterministic_jitter(base_lat: float, base_lng: float, index: int, radius: float = 0.018) -> tuple[float, float]:
    """Spread cameras without exact coordinates evenly around city center for clean map display."""
    angle = index * 2.399963229728653  # Golden angle
    dist = radius * math.sqrt((index + 1) / 60.0)
    return (
        round(base_lat + dist * math.sin(angle), 6),
        round(base_lng + dist * math.cos(angle), 6),
    )


def _infer_jakarta_admin(name: str, stream_url: str = "") -> tuple[str, str, str]:
    """Infer Jakarta sub-city (Kota Administrasi), Kecamatan, and Kelurahan from camera title/URL."""
    hay = f"{name} {stream_url}".lower()
    for kw, city, kec, kel in JAKARTA_NAME_RULES:
        if kw in hay:
            return city, kec, kel

    # Prefix clues from JakCCTV/Satpol PP/Dishub naming conventions
    upper = f"{name} {stream_url}".upper()
    if re.search(r"\bJKP\b|JAKARTA\s*PUSAT|JAKPUS", upper):
        return "Kota Jakarta Pusat", "", ""
    if re.search(r"\bJKB\b|JAKARTA\s*BARAT|JAKBAR", upper):
        return "Kota Jakarta Barat", "", ""
    if re.search(r"\bJKS\b|JAKARTA\s*SELATAN|JAKSEL", upper):
        return "Kota Jakarta Selatan", "", ""
    if re.search(r"\bJKT\b|JAKARTA\s*TIMUR|JAKTIM", upper):
        return "Kota Jakarta Timur", "", ""
    if re.search(r"\bJKU\b|JAKARTA\s*UTARA|JAKUT", upper):
        return "Kota Jakarta Utara", "", ""
    return "Kota Jakarta Pusat", "", ""


JAKARTA_LANDMARK_COORDS: list[tuple[str, float, float]] = [
    ("uob plaza", -6.20051, 106.82291),
    ("pasar tanah abang", -6.18862, 106.81478),
    ("tanah abang", -6.18690, 106.81360),
    ("jati baru", -6.18350, 106.81240),
    ("kebon melati", -6.19750, 106.81780),
    ("mas mansyur", -6.20410, 106.81650),
    ("bendungan hilir", -6.21280, 106.81220),
    ("ladokgi", -6.21160, 106.80910),
    ("gerbang pemuda", -6.21650, 106.80180),
    ("senayan", -6.22410, 106.80120),
    ("tentara pelajar", -6.20890, 106.79720),
    ("bundaran hi", -6.19500, 106.82300),
    ("thamrin", -6.18800, 106.82310),
    ("monas", -6.17539, 106.82715),
    ("merdeka", -6.17540, 106.82720),
    ("gambir", -6.17665, 106.83058),
    ("harmoni", -6.16740, 106.82040),
    ("senen", -6.17660, 106.84140),
    ("kemayoran", -6.16240, 106.85480),
    ("taman literasi", -6.24420, 106.79800),
    ("panglima polim", -6.24780, 106.79790),
    ("blok m", -6.24410, 106.79950),
    ("sultan agung", -6.20940, 106.83980),
    ("gatot subroto", -6.23050, 106.82260),
    ("sudirman", -6.21790, 106.81500),
    ("semanggi", -6.22150, 106.81360),
    ("tebet", -6.22970, 106.85480),
    ("pancoran", -6.24280, 106.84390),
    ("pasar minggu", -6.28450, 106.84420),
    ("kuningan", -6.22950, 106.83180),
    ("mampang", -6.24850, 106.82660),
    ("kemang", -6.26070, 106.81330),
    ("fatmawati", -6.28960, 106.79740),
    ("s. parman", -6.17780, 106.79240),
    ("s parman", -6.17780, 106.79240),
    ("slipi", -6.19760, 106.79820),
    ("grogol", -6.16690, 106.78900),
    ("cengkareng", -6.14890, 106.73470),
    ("kalideres", -6.15200, 106.70640),
    ("jatinegara", -6.21530, 106.87050),
    ("matraman", -6.20160, 106.85880),
    ("cawang", -6.24560, 106.87120),
    ("pulogadung", -6.19310, 106.90040),
    ("cakung", -6.18560, 106.94280),
    ("kampung melayu", -6.22430, 106.86690),
    ("kelapa gading", -6.15850, 106.90560),
    ("sunter", -6.14870, 106.86730),
    ("priok", -6.12040, 106.88190),
    ("pluit", -6.11890, 106.79120),
    ("ancol", -6.12560, 106.84270),
]

JAKARTA_CITY_CENTERS: dict[str, tuple[float, float]] = {
    "Kota Jakarta Pusat": (-6.186486, 106.834091),
    "Kota Jakarta Selatan": (-6.261493, 106.810600),
    "Kota Jakarta Barat": (-6.168329, 106.758849),
    "Kota Jakarta Timur": (-6.225014, 106.900447),
    "Kota Jakarta Utara": (-6.138414, 106.863956),
}


def _anchor_jakarta_coords(name: str, stream_url: str, city: str, index: int) -> tuple[float, float]:
    """Place Jakarta cameras at their actual landmark or sub-city coordinates with slight anti-overlap spread."""
    hay = f"{name} {stream_url}".lower()
    for kw, base_lat, base_lng in JAKARTA_LANDMARK_COORDS:
        if kw in hay:
            return _deterministic_jitter(base_lat, base_lng, index, radius=0.0025)
    base_lat, base_lng = JAKARTA_CITY_CENTERS.get(city, (-6.186486, 106.834091))
    return _deterministic_jitter(base_lat, base_lng, index, radius=0.014)


def _resolve_admin_from_name(cam: PublicCamera) -> None:
    """Populate missing district/subdistrict using curated city-specific street/area rules."""
    if cam.province == "DKI Jakarta":
        j_city, j_kec, j_kel = _infer_jakarta_admin(cam.name, cam.stream_url)
        if not cam.city or cam.city == "Jakarta":
            cam.city = j_city
        if not cam.district and j_kec:
            cam.district = j_kec
        if not cam.subdistrict and j_kel:
            cam.subdistrict = j_kel
        return

    if cam.district and cam.subdistrict:
        return

    rules = CITY_KEYWORD_ADMIN_RULES.get(cam.city)
    if not rules:
        return
    hay = f"{cam.name} {cam.stream_url}".lower()
    for kw, kec, kel in rules:
        if kw in hay:
            if not cam.district:
                cam.district = kec
            if not cam.subdistrict:
                cam.subdistrict = kel
            return


def _reverse_geocode_arcgis(lat: float, lng: float, timeout: int = 10) -> tuple[str, str]:
    """Query ArcGIS public World ReverseGeocode for Indonesian Kecamatan & Kelurahan/Desa."""
    for attempt in range(2):
        try:
            r = requests.get(
                "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode",
                params={"f": "json", "location": f"{lng},{lat}", "langCode": "ID"},
                timeout=timeout,
                headers={"User-Agent": USER_AGENT},
            )
            if r.status_code != 200:
                if attempt == 0:
                    time.sleep(0.4)
                    continue
                return "", ""
            addr = (r.json() or {}).get("address") or {}
            if str(addr.get("CountryCode") or "").upper() not in ("IDN", "ID", ""):
                return "", ""

            # For Indonesia, ArcGIS maps Kecamatan to `District` or `City`, and Kelurahan/Desa to `Neighborhood`.
            subregion = str(addr.get("Subregion") or "").strip()
            raw_kec = str(addr.get("District") or "").strip()
            city_field = str(addr.get("City") or "").strip()
            if not raw_kec and city_field and city_field.lower() != subregion.lower():
                raw_kec = city_field
            raw_kel = str(addr.get("Neighborhood") or "").strip()

            kec = clean_district(raw_kec)
            kel = clean_subdistrict(raw_kel)

            # Guard against generic city name leaking into district
            if kec and subregion and kec.lower() == clean_district(subregion).lower() and not addr.get("District"):
                kec = ""
            return kec, kel
        except Exception:
            if attempt == 0:
                time.sleep(0.4)
                continue
            return "", ""
    return "", ""


def enrich_admin_hierarchy(
    cameras: list[PublicCamera],
    geocode_cache_path: Path | None = None,
    enable_remote_geocode: bool = True,
) -> None:
    """Enrich all cameras with Kecamatan (`district`) and Kelurahan/Desa (`subdistrict`)."""
    # Step 1: Normalize upstream values + apply fast deterministic name rules
    for cam in cameras:
        cam.district = clean_district(cam.district)
        cam.subdistrict = clean_subdistrict(cam.subdistrict)
        _resolve_admin_from_name(cam)

    # Step 2: Load persistent reverse-geocode cache
    cache: dict[str, list[str]] = {}
    if geocode_cache_path and geocode_cache_path.exists():
        try:
            with geocode_cache_path.open("r", encoding="utf-8") as f:
                loaded = json.load(f)
                if isinstance(loaded, dict):
                    cache = loaded
        except Exception as exc:
            logger.warning("Failed reading geocode cache %s: %s", geocode_cache_path, exc)

    # Identify unique exact-coordinate buckets (~110m precision) missing district or subdistrict
    missing_keys: dict[str, tuple[float, float]] = {}
    for cam in cameras:
        if not cam.coords_exact or cam.lat is None or cam.lng is None:
            continue
        if cam.district and cam.subdistrict:
            continue
        key = f"{cam.lat:.3f},{cam.lng:.3f}"
        cached_val = cache.get(key)
        if cached_val and (cached_val[0] or cached_val[1]):
            kec, kel = cached_val[0], cached_val[1]
            if not cam.district and kec:
                cam.district = kec
            if not cam.subdistrict and kel:
                cam.subdistrict = kel
        elif enable_remote_geocode:
            missing_keys.setdefault(key, (cam.lat, cam.lng))

    # Step 3: Batch reverse-geocode only uncached exact coordinates
    cache_dirty = False
    if missing_keys and enable_remote_geocode:
        logger.info("Reverse-geocoding %d unique exact CCTV coordinate clusters for Kecamatan/Kelurahan...", len(missing_keys))

        def _worker(item: tuple[str, tuple[float, float]]) -> tuple[str, str, str]:
            k, (la, lo) = item
            kec, kel = _reverse_geocode_arcgis(la, lo)
            return k, kec, kel

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            for k, kec, kel in pool.map(_worker, missing_keys.items()):
                if kec or kel:
                    cache[k] = [kec, kel]
                    cache_dirty = True

        # Apply newly fetched results
        for cam in cameras:
            if not cam.coords_exact or cam.lat is None or cam.lng is None:
                continue
            key = f"{cam.lat:.3f},{cam.lng:.3f}"
            if key in cache:
                kec, kel = cache[key][0], cache[key][1]
                if not cam.district and kec:
                    cam.district = kec
                if not cam.subdistrict and kel:
                    cam.subdistrict = kel

    if cache_dirty and geocode_cache_path:
        try:
            geocode_cache_path.parent.mkdir(parents=True, exist_ok=True)
            with geocode_cache_path.open("w", encoding="utf-8") as f:
                json.dump(cache, f, indent=2, ensure_ascii=False)
        except Exception as exc:
            logger.warning("Failed writing geocode cache %s: %s", geocode_cache_path, exc)

    # Step 4: Refresh friendly `region` string with admin hierarchy
    for cam in cameras:
        parts = [p for p in (cam.subdistrict, cam.district, cam.city, cam.province) if p]
        cam.region = ", ".join(parts)


# =====================================================================
# PUBLIC OFFICIAL INDONESIAN CCTV FETCHERS
# =====================================================================


def fetch_jakarta_cameras(timeout: int = 12) -> tuple[list[PublicCamera], int]:
    """Fetch all public DKI Jakarta non-toll cameras from jakcctv.jakarta.go.id/publik/data."""
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})

    first = session.get("https://jakcctv.jakarta.go.id/publik/data?q=&page=1", timeout=timeout)
    first.raise_for_status()
    first_json = first.json()
    total = int(first_json.get("total", 0))
    pages_found = re.findall(r'data-page="(\d+)"', first_json.get("pagination", ""))
    max_page = max([int(p) for p in pages_found if int(p) > 0] or [1])
    max_page = min(max_page, 25)

    card_chunks = [first_json.get("cards", "")]
    if max_page > 1:
        def _get_page(p: int) -> str:
            r = session.get(f"https://jakcctv.jakarta.go.id/publik/data?q=&page={p}", timeout=timeout)
            r.raise_for_status()
            return r.json().get("cards", "")

        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            for chunk in pool.map(_get_page, range(2, max_page + 1)):
                card_chunks.append(chunk)

    card_pattern = re.compile(
        r'<div class="card">.*?<iframe[^>]+src="(https?://[^"]+)"[^>]*>.*?'
        r'<div class="title">(.*?)</div>.*?'
        r'(?:<span class="badge">(.*?)</span>)?.*?</div>\s*</div>',
        re.S,
    )

    cameras: list[PublicCamera] = []
    excluded_tol = 0
    seen_urls: set[str] = set()

    for m in card_pattern.finditer("\n".join(card_chunks)):
        embed_url = html_lib.unescape(m.group(1).strip())
        title = html_lib.unescape(re.sub(r"\s+", " ", m.group(2)).strip())
        badge = html_lib.unescape((m.group(3) or "").strip())
        full_name = f"{title} ({badge})" if badge and badge not in title else title

        stream_url = embed_url.replace("/embed.html", "/index.m3u8")
        cam_unit = re.search(r"(CCTV[-_]\d+)", stream_url, re.I)
        if cam_unit and cam_unit.group(1).upper() not in full_name.upper():
            full_name = f"{full_name} ({cam_unit.group(1).upper()})"
        if stream_url in seen_urls:
            continue
        seen_urls.add(stream_url)

        if is_toll_camera(full_name, stream_url):
            excluded_tol += 1
            continue

        j_city, j_kec, j_kel = _infer_jakarta_admin(full_name, stream_url)
        lat, lng = _anchor_jakarta_coords(full_name, stream_url, j_city, len(cameras))
        cameras.append(
            PublicCamera(
                id=sanitize_id(f"jkt_{len(cameras)+1:03d}_{title[:28]}"),
                name=full_name,
                city=j_city,
                province="DKI Jakarta",
                island="Jawa",
                region=f"{j_city}, DKI Jakarta",
                district=j_kec,
                subdistrict=j_kel,
                stream_url=stream_url,
                stream_type="hls",
                lat=lat,
                lng=lng,
                coords_exact=False,
                needs_cors_proxy=False,
                attribution="Diskominfotik DKI Jakarta (JakCCTV)",
                source_portal="https://jakcctv.jakarta.go.id/publik",
            )
        )

    logger.info("Jakarta: loaded %d non-toll cameras (total=%d, excluded_tol=%d)", len(cameras), total, excluded_tol)
    return cameras, excluded_tol


def fetch_semarang_cameras(timeout: int = 15) -> tuple[list[PublicCamera], int]:
    """Fetch public Kota Semarang non-toll cameras from pantausemar.semarangkota.go.id."""
    resp = requests.get(
        "https://pantausemar.semarangkota.go.id/",
        timeout=timeout,
        headers={"User-Agent": USER_AGENT},
    )
    resp.raise_for_status()
    m = re.search(r"var\s+cctvs\s*=\s*(\[.*?\]);", resp.text, re.S)
    if not m:
        logger.warning("Semarang: could not locate `var cctvs = [...]`")
        return [], 0

    raw_items = json.loads(m.group(1))
    cameras: list[PublicCamera] = []
    excluded_tol = 0
    seen_urls: set[str] = set()

    for item in raw_items:
        owner = str(item.get("owner_name") or "").strip()
        lat = float(item["lat"]) if item.get("lat") not in (None, "") else -6.9932
        lng = float(item["lng"]) if item.get("lng") not in (None, "") else 110.4203
        links = item.get("links") or []
        for link in links:
            url = str(link.get("url") or "").strip()
            if not url or ".m3u8" not in url.lower() or url in seen_urls:
                continue
            name = str(link.get("name") or owner or f"Semarang {link.get('id', '')}").strip()
            agency = str(link.get("owner_name") or "Dishub Kota Semarang").strip()
            if is_toll_camera(name, owner, agency, url):
                excluded_tol += 1
                continue
            seen_urls.add(url)
            cameras.append(
                PublicCamera(
                    id=sanitize_id(f"smg_{link.get('id', len(cameras)+1)}_{name[:28]}"),
                    name=name,
                    city="Kota Semarang",
                    province="Jawa Tengah",
                    island="Jawa",
                    region="Kota Semarang, Jawa Tengah",
                    stream_url=url,
                    stream_type="hls",
                    lat=lat,
                    lng=lng,
                    coords_exact=True,
                    needs_cors_proxy=_needs_cors_proxy(url),
                    attribution=agency,
                    source_portal="https://pantausemar.semarangkota.go.id/",
                )
            )

    logger.info("Semarang: loaded %d non-toll cameras (excluded_tol=%d)", len(cameras), excluded_tol)
    return cameras, excluded_tol


def fetch_banda_aceh_cameras(timeout: int = 15) -> tuple[list[PublicCamera], int]:
    """Fetch public Kota Banda Aceh CCTV cameras (with Kecamatan & Gampong) from Diskominfotik Banda Aceh."""
    resp = requests.get(
        "https://cctv.bandaacehkota.go.id/api/cameras",
        timeout=timeout,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    resp.raise_for_status()
    items = (resp.json() or {}).get("data") or []

    cameras: list[PublicCamera] = []
    excluded_tol = 0
    seen_urls: set[str] = set()

    for item in items:
        if item.get("is_active") is False:
            continue
        raw_url = str(item.get("url") or "").strip()
        m_uuid = re.search(r"/cctv/([0-9a-fA-F-]{16,})\.html", raw_url)
        if not m_uuid:
            continue
        stream_url = f"https://api.bandaacehkota.go.id/cctv/memfs/{m_uuid.group(1)}.m3u8"
        if stream_url in seen_urls:
            continue

        name = str(item.get("name") or f"Banda Aceh {item.get('id', '')}").strip()
        address = str(item.get("address") or "").strip()
        raw_region = str(item.get("region") or "").strip()
        pengelola = str(item.get("pengelola") or "Diskominfotik Kota Banda Aceh").strip()

        if is_toll_camera(name, address, raw_region, stream_url):
            excluded_tol += 1
            continue
        seen_urls.add(stream_url)

        # Parse "Kecamatan Baiturrahman - Kampung Baru"
        kec, kel = "", ""
        if " - " in raw_region:
            left, right = raw_region.split(" - ", 1)
            kec = clean_district(left)
            kel = clean_subdistrict(right)
        elif raw_region:
            kec = clean_district(raw_region)

        try:
            lat = float(item["latitude"])
            lng = float(item["longitude"])
            exact = True
        except (TypeError, ValueError, KeyError):
            lat, lng = _deterministic_jitter(5.5483, 95.3238, len(cameras), radius=0.015)
            exact = False

        display_name = f"{name} — {address}" if address and address.lower() not in name.lower() else name
        cameras.append(
            PublicCamera(
                id=sanitize_id(f"bna_{item.get('id', len(cameras)+1)}_{name[:28]}"),
                name=display_name,
                city="Kota Banda Aceh",
                province="Aceh",
                island="Sumatera",
                region=f"Kota Banda Aceh, Aceh",
                district=kec,
                subdistrict=kel,
                stream_url=stream_url,
                stream_type="hls",
                lat=lat,
                lng=lng,
                coords_exact=exact,
                needs_cors_proxy=_needs_cors_proxy(stream_url),
                attribution=pengelola,
                source_portal="https://cctv.bandaacehkota.go.id/",
            )
        )

    logger.info("Banda Aceh: loaded %d non-toll cameras (excluded_tol=%d)", len(cameras), excluded_tol)
    return cameras, excluded_tol


def fetch_bengkulu_cameras(timeout: int = 15) -> tuple[list[PublicCamera], int]:
    """Fetch public Kota Bengkulu CCTV cameras from cctv.bengkulukota.go.id."""
    resp = requests.get(
        "https://cctv.bengkulukota.go.id/",
        timeout=timeout,
        headers={"User-Agent": USER_AGENT},
    )
    resp.raise_for_status()
    m = re.search(r"const\s+cameras\s*=\s*(\[.*?\]);", resp.text, re.S)
    if not m:
        logger.warning("Bengkulu: could not locate `const cameras = [...]`")
        return [], 0

    raw_items = json.loads(m.group(1))
    cameras: list[PublicCamera] = []
    excluded_tol = 0
    seen_urls: set[str] = set()

    for item in raw_items:
        if str(item.get("status", "online")).lower() in ("offline", "down", "inactive"):
            continue
        url = str(item.get("hls") or "").strip()
        if not url or ".m3u8" not in url.lower() or url in seen_urls:
            continue
        name = str(item.get("name") or f"Bengkulu {item.get('id', '')}").strip()
        if is_toll_camera(name, url):
            excluded_tol += 1
            continue
        seen_urls.add(url)

        try:
            lat = float(item["lat"])
            lng = float(item["lng"])
            exact = True
        except (TypeError, ValueError, KeyError):
            lat, lng = _deterministic_jitter(-3.7928, 102.2608, len(cameras), radius=0.015)
            exact = False

        cameras.append(
            PublicCamera(
                id=sanitize_id(f"bkl_{item.get('id', len(cameras)+1)}_{name[:28]}"),
                name=name,
                city="Kota Bengkulu",
                province="Bengkulu",
                island="Sumatera",
                region="Kota Bengkulu, Bengkulu",
                stream_url=url,
                stream_type="hls",
                lat=lat,
                lng=lng,
                coords_exact=exact,
                needs_cors_proxy=_needs_cors_proxy(url),
                attribution="Diskominfo Kota Bengkulu",
                source_portal="https://cctv.bengkulukota.go.id/",
            )
        )

    logger.info("Bengkulu: loaded %d non-toll cameras (excluded_tol=%d)", len(cameras), excluded_tol)
    return cameras, excluded_tol


def fetch_pekanbaru_cameras(timeout: int = 15) -> tuple[list[PublicCamera], int]:
    """Fetch public Kota Pekanbaru CCTV HLS cameras from cctv.pekanbaru.go.id/cam."""
    resp = requests.get(
        "https://cctv.pekanbaru.go.id/cam",
        timeout=timeout,
        headers={"User-Agent": USER_AGENT},
    )
    resp.raise_for_status()

    card_pattern = re.compile(
        r'class="cam-card"[^>]*data-cam-id="([^"]+)"[^>]*data-name="([^"]+)"[^>]*data-manifest="([^"]+)"',
        re.S,
    )
    cameras: list[PublicCamera] = []
    excluded_tol = 0
    seen_urls: set[str] = set()

    for m in card_pattern.finditer(resp.text):
        cam_num = m.group(1).strip()
        name = html_lib.unescape(re.sub(r"\s+", " ", m.group(2)).strip())
        url = html_lib.unescape(m.group(3).strip())
        if not url or ".m3u8" not in url.lower() or url in seen_urls:
            continue
        if is_toll_camera(name, url):
            excluded_tol += 1
            continue
        seen_urls.add(url)

        lat, lng = _deterministic_jitter(0.5071, 101.4478, len(cameras), radius=0.022)
        cameras.append(
            PublicCamera(
                id=sanitize_id(f"pku_{cam_num}_{name[:28]}"),
                name=name,
                city="Kota Pekanbaru",
                province="Riau",
                island="Sumatera",
                region="Kota Pekanbaru, Riau",
                stream_url=url,
                stream_type="hls",
                lat=lat,
                lng=lng,
                coords_exact=False,
                needs_cors_proxy=_needs_cors_proxy(url),
                attribution="Diskominfo Kota Pekanbaru",
                source_portal="https://cctv.pekanbaru.go.id/cam",
            )
        )

    logger.info("Pekanbaru: loaded %d non-toll cameras (excluded_tol=%d)", len(cameras), excluded_tol)
    return cameras, excluded_tol


def fetch_pekalongan_cameras(timeout: int = 15) -> tuple[list[PublicCamera], int]:
    """Fetch public Kota Pekalongan CCTV cameras from cctv.pekalongankota.go.id/api/config."""
    resp = requests.get(
        "https://cctv.pekalongankota.go.id/api/config",
        timeout=timeout,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    resp.raise_for_status()
    streams = (resp.json() or {}).get("streams") or {}

    cameras: list[PublicCamera] = []
    excluded_tol = 0
    seen_urls: set[str] = set()

    for sid, info in streams.items():
        channels = (info or {}).get("channels") or {}
        for ch_id, ch in channels.items():
            if not isinstance(ch, dict):
                continue
            if ch.get("public") in (0, False, "0"):
                continue
            name = str(ch.get("name") or f"Pekalongan {sid[:8]}").strip()
            url = f"https://cctv.pekalongankota.go.id/stream/{sid}/channel/{ch_id}/hls/live/index.m3u8"
            if url in seen_urls:
                continue
            if is_toll_camera(name, url):
                excluded_tol += 1
                continue
            seen_urls.add(url)

            try:
                lat = float(ch["latitude"])
                lng = float(ch["longitude"])
                exact = True
            except (TypeError, ValueError, KeyError):
                lat, lng = _deterministic_jitter(-6.8898, 109.6746, len(cameras), radius=0.015)
                exact = False

            cameras.append(
                PublicCamera(
                    id=sanitize_id(f"pkl_{len(cameras)+1:03d}_{name[:28]}"),
                    name=name,
                    city="Kota Pekalongan",
                    province="Jawa Tengah",
                    island="Jawa",
                    region="Kota Pekalongan, Jawa Tengah",
                    stream_url=url,
                    stream_type="hls",
                    lat=lat,
                    lng=lng,
                    coords_exact=exact,
                    needs_cors_proxy=_needs_cors_proxy(url),
                    attribution="Diskominfo & Dishub Kota Pekalongan",
                    source_portal="https://cctv.pekalongankota.go.id/",
                )
            )

    logger.info("Pekalongan: loaded %d non-toll cameras (excluded_tol=%d)", len(cameras), excluded_tol)
    return cameras, excluded_tol


def fetch_surakarta_cameras(timeout: int = 15) -> tuple[list[PublicCamera], int]:
    """Fetch public Kota Surakarta (Solo) ATCS cameras from ccroom-dishub.surakarta.go.id/api/cctv."""
    resp = requests.get(
        "https://ccroom-dishub.surakarta.go.id/api/cctv",
        timeout=timeout,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    resp.raise_for_status()
    items = (resp.json() or {}).get("data") or []

    cameras: list[PublicCamera] = []
    excluded_tol = 0
    seen_urls: set[str] = set()

    for item in items:
        url = str(item.get("stream_url") or "").strip()
        if not url or url in seen_urls:
            continue
        name = str(item.get("nama") or item.get("name") or f"Solo {item.get('id', '')}").strip()
        if is_toll_camera(name, url):
            excluded_tol += 1
            continue
        seen_urls.add(url)

        try:
            lat = float(item["latitude"])
            lng = float(item["longitude"])
            exact = True
        except (TypeError, ValueError, KeyError):
            lat, lng = _deterministic_jitter(-7.5755, 110.8243, len(cameras), radius=0.015)
            exact = False

        stream_type = "flv" if url.lower().endswith(".flv") else "hls"
        cameras.append(
            PublicCamera(
                id=sanitize_id(f"slo_{item.get('id', len(cameras)+1)}_{name[:28]}"),
                name=f"ATCS Solo — {name}",
                city="Kota Surakarta",
                province="Jawa Tengah",
                island="Jawa",
                region="Kota Surakarta, Jawa Tengah",
                stream_url=url,
                stream_type=stream_type,
                lat=lat,
                lng=lng,
                coords_exact=exact,
                needs_cors_proxy=False,
                attribution="Dishub Kota Surakarta (CCRoom Solo)",
                source_portal="https://ccroom-dishub.surakarta.go.id/",
            )
        )

    logger.info("Surakarta: loaded %d non-toll cameras (excluded_tol=%d)", len(cameras), excluded_tol)
    return cameras, excluded_tol


def fetch_mataram_cameras(timeout: int = 15) -> tuple[list[PublicCamera], int]:
    """Fetch public Kota Mataram (NTB) CCTV cameras from cctv.mataramkota.go.id/cctv."""
    resp = requests.get(
        "https://cctv.mataramkota.go.id/cctv",
        timeout=timeout,
        headers={"User-Agent": USER_AGENT},
    )
    resp.raise_for_status()
    chunks = list(dict.fromkeys(re.findall(r"/_next/static/chunks/[^\"'\\]+\.js", resp.text)))

    bundle_text = resp.text
    for ch in chunks:
        try:
            jr = requests.get(f"https://cctv.mataramkota.go.id{ch}", timeout=8, headers={"User-Agent": USER_AGENT})
            if "relay-cctv.mataramkota.go.id" in jr.text:
                bundle_text = jr.text
                break
        except Exception:
            continue

    obj_pattern = re.compile(
        r'nama:"([^"]+)",[^;]{0,80}?lat:(-?\d+\.\d+),lng:(\d+\.\d+),.{0,260}?iframeUrl:"(https://relay-cctv\.mataramkota\.go\.id/[^"]+)"'
    )
    cameras: list[PublicCamera] = []
    excluded_tol = 0
    seen_urls: set[str] = set()

    for m in obj_pattern.finditer(bundle_text):
        name = m.group(1).strip()
        lat = float(m.group(2))
        lng = float(m.group(3))
        base_relay = m.group(4).rstrip("/")
        stream_url = f"{base_relay}/index.m3u8"
        if stream_url in seen_urls:
            continue
        if is_toll_camera(name, stream_url):
            excluded_tol += 1
            continue
        seen_urls.add(stream_url)

        cameras.append(
            PublicCamera(
                id=sanitize_id(f"mtr_{len(cameras)+1:03d}_{name[:28]}"),
                name=name,
                city="Kota Mataram",
                province="Nusa Tenggara Barat",
                island="Bali & Nusa Tenggara",
                region="Kota Mataram, Nusa Tenggara Barat",
                stream_url=stream_url,
                stream_type="hls",
                lat=lat,
                lng=lng,
                coords_exact=True,
                needs_cors_proxy=False,
                attribution="Dishub Kota Mataram",
                source_portal="https://cctv.mataramkota.go.id/cctv",
            )
        )

    logger.info("Mataram: loaded %d non-toll cameras (excluded_tol=%d)", len(cameras), excluded_tol)
    return cameras, excluded_tol


def fetch_live_env_indonesia_cameras(timeout: int = 25) -> tuple[list[PublicCamera], int]:
    """Fetch curated open Indonesian municipal HLS streams from Live-Environment-Streams GeoJSON."""
    resp = requests.get(LIVE_ENV_GEOJSON_URL, timeout=timeout, headers={"User-Agent": USER_AGENT})
    resp.raise_for_status()
    geo = resp.json()

    cameras: list[PublicCamera] = []
    excluded_tol = 0
    seen_urls: set[str] = set()
    city_counters: dict[str, int] = {}

    for feat in geo.get("features", []):
        props = feat.get("properties") or {}
        if props.get("country_code") != "ID":
            continue

        family = str(props.get("source_family") or "").strip()
        meta = LIVE_ENV_CITY_META.get(family)
        if meta is None:
            continue

        url = str(props.get("url") or "").strip()
        if not url or url in seen_urls:
            continue

        raw_name = str(props.get("name") or "").strip()
        clean_name = raw_name.split("—", 1)[1].strip() if "—" in raw_name else raw_name
        attribution = str(props.get("attribution") or meta["attribution"]).strip()

        if is_toll_camera(raw_name, clean_name, attribution, url):
            excluded_tol += 1
            continue

        seen_urls.add(url)
        coords = (feat.get("geometry") or {}).get("coordinates") or []
        coords_exact = str(props.get("coordinates_quality") or "").lower() not in ("city", "approx", "approximate")
        idx = city_counters.get(meta["city"], 0)
        city_counters[meta["city"]] = idx + 1

        if len(coords) >= 2 and coords_exact:
            lng, lat = float(coords[0]), float(coords[1])
        else:
            base_lng = float(coords[0]) if len(coords) >= 2 else float(meta["lng"])
            base_lat = float(coords[1]) if len(coords) >= 2 else float(meta["lat"])
            lat, lng = _deterministic_jitter(base_lat, base_lng, idx, radius=0.015)
            coords_exact = False

        city_slug = re.sub(r"^(kota|kabupaten)\s+", "", meta["city"], flags=re.I)[:4].lower()
        cameras.append(
            PublicCamera(
                id=sanitize_id(f"{city_slug}_{idx+1:03d}_{clean_name[:28]}"),
                name=clean_name,
                city=meta["city"],
                province=meta["province"],
                island=meta["island"],
                region=f"{meta['city']}, {meta['province']}",
                stream_url=url,
                stream_type="hls",
                lat=lat,
                lng=lng,
                coords_exact=coords_exact,
                needs_cors_proxy=_needs_cors_proxy(url),
                attribution=attribution,
                source_portal="https://github.com/william-ricchiuti/Live-Environment-Streams",
            )
        )

    logger.info("LiveEnv Indonesia: loaded %d non-toll cameras (excluded_tol=%d)", len(cameras), excluded_tol)
    return cameras, excluded_tol


def aggregate_indonesia_cameras(
    cache_path: Path | None = None,
    ttl_sec: int = 1800,
    force_refresh: bool = False,
    enable_remote_geocode: bool = True,
    public_facilities_only: bool = True,
) -> dict[str, Any]:
    """Fetch, merge, deduplicate, filter public facilities, enrich with Provinsi/Kota/Kecamatan/Kelurahan, and cache."""
    if cache_path and cache_path.exists() and not force_refresh:
        age = time.time() - cache_path.stat().st_mtime
        if age < ttl_sec:
            with cache_path.open("r", encoding="utf-8") as f:
                cached = json.load(f)
                if (
                    "districts" in cached
                    and "facility_categories" in cached
                    and cached.get("public_facilities_only") == public_facilities_only
                ):
                    return cached

    all_cameras: list[PublicCamera] = []
    total_excluded_tol = 0
    source_status: dict[str, dict[str, Any]] = {}

    fetchers = [
        ("DKI Jakarta (JakCCTV)", fetch_jakarta_cameras),
        ("Kota Semarang (PantauSemar)", fetch_semarang_cameras),
        ("Kota Banda Aceh (Diskominfotik)", fetch_banda_aceh_cameras),
        ("Kota Bengkulu (Diskominfo)", fetch_bengkulu_cameras),
        ("Kota Pekanbaru (Diskominfo)", fetch_pekanbaru_cameras),
        ("Kota Pekalongan (Diskominfo)", fetch_pekalongan_cameras),
        ("Kota Surakarta / Solo (Dishub)", fetch_surakarta_cameras),
        ("Kota Mataram (Dishub NTB)", fetch_mataram_cameras),
        ("Indonesia Multi-Kota (ATCS Publik)", fetch_live_env_indonesia_cameras),
    ]

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        fut_map = {pool.submit(fn): label for label, fn in fetchers}
        for fut in concurrent.futures.as_completed(fut_map):
            label = fut_map[fut]
            try:
                cams, exc_tol = fut.result()
                all_cameras.extend(cams)
                total_excluded_tol += exc_tol
                source_status[label] = {"ok": True, "count": len(cams), "excluded_tol": exc_tol}
            except Exception as exc:
                logger.warning("Failed fetching %s: %s", label, exc)
                source_status[label] = {"ok": False, "error": str(exc), "count": 0}

    # Final deduplication by stream URL, facility classification & deterministic ordering
    deduped: list[PublicCamera] = []
    seen: set[str] = set()
    excluded_traffic_count = 0
    for cam in sorted(all_cameras, key=lambda c: (c.province.lower(), c.city.lower(), c.name.lower())):
        if cam.stream_url in seen:
            continue
        seen.add(cam.stream_url)
        category = classify_public_facility(cam.name)
        if public_facilities_only and not category:
            excluded_traffic_count += 1
            continue
        cam.facility_category = category or "Jalan & Lalu Lintas"
        deduped.append(cam)

    # Enrich Kecamatan & Kelurahan/Desa (cached locally in data/admin_geocode_cache.json)
    geocode_cache_path = (cache_path.parent / "admin_geocode_cache.json") if cache_path else None
    enrich_admin_hierarchy(
        deduped,
        geocode_cache_path=geocode_cache_path,
        enable_remote_geocode=enable_remote_geocode,
    )

    by_city: dict[str, int] = {}
    by_province: dict[str, int] = {}
    by_island: dict[str, int] = {}
    by_district: dict[str, int] = {}
    by_subdistrict: dict[str, int] = {}
    by_category: dict[str, int] = {}

    for c in deduped:
        by_city[c.city] = by_city.get(c.city, 0) + 1
        by_province[c.province] = by_province.get(c.province, 0) + 1
        by_island[c.island] = by_island.get(c.island, 0) + 1
        if c.district:
            by_district[c.district] = by_district.get(c.district, 0) + 1
        if c.subdistrict:
            by_subdistrict[c.subdistrict] = by_subdistrict.get(c.subdistrict, 0) + 1
        if c.facility_category:
            by_category[c.facility_category] = by_category.get(c.facility_category, 0) + 1

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "non_toll_only": True,
        "public_facilities_only": public_facilities_only,
        "excluded_toll_count": total_excluded_tol,
        "excluded_traffic_count": excluded_traffic_count,
        "count": len(deduped),
        "facility_categories": dict(sorted(by_category.items(), key=lambda kv: (-kv[1], kv[0]))),
        "cities": dict(sorted(by_city.items(), key=lambda kv: (-kv[1], kv[0]))),
        "provinces": dict(sorted(by_province.items(), key=lambda kv: (-kv[1], kv[0]))),
        "districts": dict(sorted(by_district.items(), key=lambda kv: (-kv[1], kv[0]))),
        "subdistricts": dict(sorted(by_subdistrict.items(), key=lambda kv: (-kv[1], kv[0]))),
        "islands": dict(sorted(by_island.items(), key=lambda kv: (-kv[1], kv[0]))),
        "sources": source_status,
        "cameras": [c.to_dict() for c in deduped],
    }

    if cache_path:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        with cache_path.open("w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)

    return payload


# =====================================================================
# PATRA SNAPSHOT & FRONTEND CATALOG EXPORT (data_contract.md Section 4)
# =====================================================================

CURATED_PILOT_ROIS: list[tuple[str, list[list[float]]]] = [
    ("uob", [[0.58, 0.36], [0.92, 0.42], [0.96, 0.96], [0.54, 0.96]]),
    ("tanah abang", [[0.55, 0.40], [0.95, 0.44], [0.98, 0.95], [0.50, 0.95]]),
    ("simpang lima", [[0.58, 0.38], [0.93, 0.42], [0.96, 0.94], [0.54, 0.94]]),
    ("balaikota", [[0.56, 0.42], [0.92, 0.46], [0.95, 0.95], [0.52, 0.95]]),
    ("pasar johar", [[0.56, 0.42], [0.92, 0.46], [0.95, 0.95], [0.52, 0.95]]),
    ("johar", [[0.56, 0.42], [0.92, 0.46], [0.95, 0.95], [0.52, 0.95]]),
]

ALLOWED_STREAM_TYPES = {"hls", "mjpeg", "mp4"}


def _pick_curated_roi(name: str) -> list[list[float]] | None:
    lower = name.lower()
    for kw, poly in CURATED_PILOT_ROIS:
        if kw in lower:
            return poly
    return None


def _pick_fallback_video(city: str) -> str:
    return "/videos/demo-semarang.mp4" if "semarang" in city.lower() else "/videos/demo-jakarta.mp4"


def export_patra_catalogs(
    snapshot_path: Path,
    fe_catalog_path: Path | None = None,
    public_facilities_only: bool = False,
    enable_remote_geocode: bool = False,
) -> dict[str, Any]:
    """Fetch all public Indonesian non-toll cameras and export contract-compliant snapshot + FE DTO catalog."""
    raw_cache = snapshot_path.parent / "indonesia_public_cameras_raw.json"
    raw_payload = aggregate_indonesia_cameras(
        cache_path=raw_cache,
        ttl_sec=0,
        force_refresh=True,
        enable_remote_geocode=enable_remote_geocode,
        public_facilities_only=public_facilities_only,
    )

    snapshot_items: list[dict[str, Any]] = []
    fe_items: list[dict[str, Any]] = []
    skipped_unsupported = 0
    seen_ids: set[str] = set()

    for cam in raw_payload.get("cameras", []):
        stype = str(cam.get("stream_type") or "hls").lower()
        if stype not in ALLOWED_STREAM_TYPES:
            skipped_unsupported += 1
            continue

        stream_url = str(cam.get("stream_url") or "").strip()
        if not stream_url.startswith(("http://", "https://")):
            skipped_unsupported += 1
            continue

        source_portal = str(cam.get("source_portal") or "").strip()
        if not source_portal.startswith(("http://", "https://")):
            source_portal = "https://github.com/william-ricchiuti/Live-Environment-Streams"

        lat = cam.get("lat")
        lng = cam.get("lng")
        if lat is None or lng is None:
            skipped_unsupported += 1
            continue

        cam_id = str(cam.get("id") or "").strip()
        if not cam_id or cam_id in seen_ids:
            cam_id = f"{cam_id or 'cam'}_{len(snapshot_items)+1}"
        seen_ids.add(cam_id)

        name = str(cam.get("name") or cam_id).strip()
        city = str(cam.get("city") or "").strip()
        province = str(cam.get("province") or "").strip()
        island = str(cam.get("island") or "Jawa").strip()
        region_label = str(cam.get("region") or f"{city}, {province}").strip()
        district = str(cam.get("district") or "").strip() or None
        subdistrict = str(cam.get("subdistrict") or "").strip() or None
        facility_category = str(cam.get("facility_category") or "").strip() or None
        roi_polygon = _pick_curated_roi(name)
        fallback_video = _pick_fallback_video(city)

        # Contract Section 4.1 (snake_case for BE-Patra/prisma/seed.ts)
        snapshot_items.append(
            {
                "id": cam_id,
                "name": name,
                "city": city,
                "province": province,
                "island": island,
                "region": region_label,
                "stream_url": stream_url,
                "stream_type": stype,
                "lat": float(lat),
                "lng": float(lng),
                "coords_exact": bool(cam.get("coords_exact", False)),
                "needs_cors_proxy": bool(cam.get("needs_cors_proxy", False)),
                "attribution": str(cam.get("attribution") or "Pemda Publik").strip(),
                "source_portal": source_portal,
                "district": district,
                "subdistrict": subdistrict,
                "facility_category": facility_category,
                "playback_url": stream_url,
                "roi_polygon": roi_polygon,
                "fallback_video_url": fallback_video,
                "thumbnail_url": None,
            }
        )

        # Contract Section 5 (camelCase CctvCameraDto for FE-Patra)
        fe_items.append(
            {
                "id": cam_id,
                "name": name,
                "city": city,
                "province": province,
                "regionLabel": region_label,
                "district": district,
                "subdistrict": subdistrict,
                "facilityCategory": facility_category,
                "streamUrl": stream_url,
                "playbackUrl": stream_url,
                "streamType": stype,
                "lat": float(lat),
                "lng": float(lng),
                "coordsExact": bool(cam.get("coords_exact", False)),
                "needsCorsProxy": bool(cam.get("needs_cors_proxy", False)),
                "attribution": str(cam.get("attribution") or "Pemda Publik").strip(),
                "sourcePortal": source_portal,
                "roiPolygon": roi_polygon,
                "thumbnailUrl": None,
                "fallbackVideoUrl": fallback_video,
                "hasActiveReport": False,
            }
        )

    by_city: dict[str, int] = {}
    for item in snapshot_items:
        by_city[item["city"]] = by_city.get(item["city"], 0) + 1

    snapshot_payload = {
        "generated_at": raw_payload["generated_at"],
        "non_toll_only": True,
        "public_facilities_only": public_facilities_only,
        "count": len(snapshot_items),
        "skipped_unsupported_stream": skipped_unsupported,
        "cities": dict(sorted(by_city.items(), key=lambda kv: (-kv[1], kv[0]))),
        "sources": raw_payload.get("sources", {}),
        "cameras": snapshot_items,
    }

    snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    snapshot_path.write_text(json.dumps(snapshot_payload, indent=2, ensure_ascii=False), encoding="utf-8")

    if fe_catalog_path is not None:
        fe_catalog_path.parent.mkdir(parents=True, exist_ok=True)
        fe_payload = {
            "generatedAt": raw_payload["generated_at"],
            "count": len(fe_items),
            "cities": snapshot_payload["cities"],
            "cameras": fe_items,
        }
        fe_catalog_path.write_text(json.dumps(fe_payload, ensure_ascii=False), encoding="utf-8")

    return snapshot_payload


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
    parser = argparse.ArgumentParser(description="PATRA Public Indonesian CCTV Catalog Sync")
    parser.add_argument(
        "--public-facilities-only",
        action="store_true",
        help="Filter hanya fasilitas publik (default: ambil SEMUA kamera non-tol)",
    )
    parser.add_argument(
        "--remote-geocode",
        action="store_true",
        help="Aktifkan reverse geocoding ArcGIS untuk koordinat baru yang belum ada di cache",
    )
    args = parser.parse_args()

    here = Path(__file__).resolve().parent
    repo_root = here.parent.parent
    res = export_patra_catalogs(
        snapshot_path=here / "cctv_snapshot.json",
        fe_catalog_path=repo_root / "FE-Patra" / "public" / "data" / "cctv_catalog.json",
        public_facilities_only=args.public_facilities_only,
        enable_remote_geocode=args.remote_geocode,
    )
    print(f"\n[OK] Exported {res['count']} cameras (skipped non-HLS={res['skipped_unsupported_stream']})")
    print("Cities breakdown:")
    for city, cnt in res["cities"].items():
        print(f"  - {city}: {cnt}")
