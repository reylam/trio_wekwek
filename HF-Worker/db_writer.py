"""Database writer & Supabase Storage uploader (hanya tulis saat PKL baru terdeteksi atau jumlahnya bertambah)."""

from __future__ import annotations

import json
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import requests

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover - terpasang di container Docker HF Spaces
    psycopg = None  # type: ignore[assignment]
    dict_row = None  # type: ignore[assignment]

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
WIB_TZ = timezone(timedelta(hours=7))


@dataclass
class CameraRecord:
    id: str
    region_id: str
    name: str
    city: str
    region_label: str
    stream_url: str
    lat: float
    lng: float
    roi_polygon: Any


def generate_report_code(now: datetime | None = None) -> str:
    dt = (now or datetime.now(timezone.utc)).astimezone(WIB_TZ)
    ym = dt.strftime("%Y%m")
    suffix = "".join(secrets.choice(CODE_ALPHABET) for _ in range(5))
    return f"PTR-{ym}-{suffix}"


def decide_write_action(
    detected_count: int,
    active_report: dict[str, Any] | None,
    last_action_submitted_at: datetime | None,
    cooldown_sec: int,
    now: datetime | None = None,
) -> str:
    """
    Aturan hemat DB (identik dengan BR-001 & BR-003 BE-Patra):
    - 0 PKL -> SKIP_ZERO (tidak tulis DB)
    - Ada laporan aktif & jumlah PKL tidak bertambah -> MERGED_NOOP (tidak tulis DB)
    - Ada laporan aktif & jumlah PKL bertambah -> ESCALATE (upload + update DB)
    - Tidak ada laporan aktif & masih dalam masa cooldown pasca penindakan -> COOLDOWN_SKIP
    - Tidak ada laporan aktif & lewat cooldown -> CREATE (upload + insert laporan baru)
    """
    if detected_count <= 0:
        return "SKIP_ZERO"

    if active_report is not None:
        prev_count = int(active_report.get("detectedCount") or 0)
        if detected_count > prev_count:
            return "ESCALATE"
        return "MERGED_NOOP"

    if last_action_submitted_at is not None and cooldown_sec > 0:
        cur = now or datetime.now(timezone.utc)
        last_utc = (
            last_action_submitted_at.replace(tzinfo=timezone.utc)
            if last_action_submitted_at.tzinfo is None
            else last_action_submitted_at.astimezone(timezone.utc)
        )
        if (cur - last_utc).total_seconds() < cooldown_sec:
            return "COOLDOWN_SKIP"

    return "CREATE"


def point_in_geo_polygon(lat: float, lng: float, points: Any) -> bool:
    """Cek apakah (lat, lng) berada dalam poligon GeoJSON [[lng, lat], ...]."""
    if not isinstance(points, list) or len(points) < 3:
        return False
    inside = False
    n = len(points)
    j = n - 1
    for i in range(n):
        xi, yi = float(points[i][0]), float(points[i][1])
        xj, yj = float(points[j][0]), float(points[j][1])
        intersect = ((yi > lat) != (yj > lat)) and (
            lng < (xj - xi) * (lat - yi) / max(1e-9, (yj - yi)) + xi
        )
        if intersect:
            inside = not inside
        j = i
    return inside


class SupabasePatraStore:
    """Akses langsung ke Supabase PostgreSQL (PgBouncer-safe) dan Supabase Storage."""

    def __init__(
        self,
        database_url: str,
        supabase_url: str,
        supabase_service_key: str,
        supabase_bucket: str = "patra-evidence",
        cooldown_sec: int = 30,
    ) -> None:
        self.database_url = database_url
        self.supabase_url = supabase_url.rstrip("/")
        self.supabase_service_key = supabase_service_key
        self.supabase_bucket = supabase_bucket
        self.cooldown_sec = cooldown_sec

    def _connect(self) -> Any:
        if psycopg is None or dict_row is None:
            raise RuntimeError("Paket psycopg belum terpasang. Jalankan: pip install 'psycopg[binary]'")
        # prepare_threshold=None wajib untuk Supabase Transaction Pooler (:6543)
        return psycopg.connect(
            self.database_url,
            row_factory=dict_row,
            prepare_threshold=None,
            connect_timeout=10,
        )

    def load_active_cameras(
        self,
        cities: list[str] | None = None,
        max_cameras: int = 60,
    ) -> list[CameraRecord]:
        sql = """
            SELECT id, "regionId", name, city, "regionLabel", "streamUrl", lat, lng, "roiPolygon"
            FROM "CctvCamera"
            WHERE "isActive" = true AND "streamType" = 'hls'
        """
        params: list[Any] = []
        if cities:
            sql += " AND LOWER(city) = ANY(%s)"
            params.append([c.strip().lower() for c in cities if c.strip()])
        sql += ' ORDER BY CASE WHEN "roiPolygon" IS NOT NULL THEN 0 ELSE 1 END, id ASC LIMIT %s'
        params.append(max_cameras)

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()

        return [
            CameraRecord(
                id=str(r["id"]),
                region_id=str(r["regionId"]),
                name=str(r["name"]),
                city=str(r["city"]),
                region_label=str(r["regionLabel"] or r["name"]),
                stream_url=str(r["streamUrl"]),
                lat=float(r["lat"]),
                lng=float(r["lng"]),
                roi_polygon=r["roiPolygon"],
            )
            for r in rows
        ]

    def upload_before_snapshot(self, jpeg_bytes: bytes) -> str:
        object_path = f"before/{uuid.uuid4()}.jpg"
        upload_url = f"{self.supabase_url}/storage/v1/object/{self.supabase_bucket}/{object_path}"
        headers = {
            "Authorization": f"Bearer {self.supabase_service_key}",
            "apikey": self.supabase_service_key,
            "Content-Type": "image/jpeg",
            "x-upsert": "true",
        }
        resp = requests.post(upload_url, headers=headers, data=jpeg_bytes, timeout=20)
        if not resp.ok:
            raise RuntimeError(
                f"Upload Supabase Storage gagal (HTTP {resp.status_code}): {resp.text[:180]}"
            )
        return f"{self.supabase_url}/storage/v1/object/public/{self.supabase_bucket}/{object_path}"

    def record_detection_if_needed(
        self,
        cam: CameraRecord,
        detected_count: int,
        max_confidence: float,
        jpeg_bytes: bytes,
    ) -> dict[str, Any]:
        """Tulis ke database HANYA bila ada deteksi baru (CREATE) atau jumlah PKL bertambah (ESCALATE)."""
        if detected_count <= 0:
            return {"outcome": "SKIP_ZERO", "written": False}

        now = datetime.now(timezone.utc)
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, "reportCode", "detectedCount", "maxConfidence", "beforeImageUrl"
                    FROM "ViolationReport"
                    WHERE "cameraId" = %s AND status = 'NEED_ACTION'
                    ORDER BY "createdAt" DESC
                    LIMIT 1
                    """,
                    (cam.id,),
                )
                active = cur.fetchone()

                last_action_at: datetime | None = None
                if active is None:
                    cur.execute(
                        """
                        SELECT "actionSubmittedAt"
                        FROM "ViolationReport"
                        WHERE "cameraId" = %s AND "actionSubmittedAt" IS NOT NULL
                        ORDER BY "actionSubmittedAt" DESC
                        LIMIT 1
                        """,
                        (cam.id,),
                    )
                    last_row = cur.fetchone()
                    if last_row:
                        last_action_at = last_row["actionSubmittedAt"]

                action = decide_write_action(
                    detected_count=detected_count,
                    active_report=active,
                    last_action_submitted_at=last_action_at,
                    cooldown_sec=self.cooldown_sec,
                    now=now,
                )

                if action in ("SKIP_ZERO", "MERGED_NOOP", "COOLDOWN_SKIP"):
                    return {
                        "outcome": action,
                        "written": False,
                        "reportCode": active["reportCode"] if active else None,
                    }

                # Hanya upload snapshot jika benar-benar akan CREATE atau ESCALATE!
                image_url = self.upload_before_snapshot(jpeg_bytes)

                if action == "ESCALATE" and active is not None:
                    new_conf = max(float(active["maxConfidence"] or 0.0), float(max_confidence))
                    cur.execute(
                        """
                        UPDATE "ViolationReport"
                        SET "detectedCount" = %s,
                            "maxConfidence" = %s,
                            "beforeImageUrl" = %s,
                            "updatedAt" = %s
                        WHERE id = %s
                        """,
                        (detected_count, new_conf, image_url, now, active["id"]),
                    )
                    cur.execute(
                        """
                        INSERT INTO "AuditLog" (
                            id, "reportId", "actorId", "actorRole", "actorName",
                            action, "fromStatus", "toStatus", note, metadata, "createdAt"
                        )
                        VALUES (%s, %s, NULL, 'SYSTEM_AI', 'PATRA HF 24/7 Worker',
                                'INCIDENT_ESCALATED', 'NEED_ACTION', 'NEED_ACTION', %s, %s::jsonb, %s)
                        """,
                        (
                            str(uuid.uuid4()),
                            active["id"],
                            f"Jumlah PKL aktif meningkat dari {active['detectedCount']} menjadi {detected_count}.",
                            json.dumps(
                                {
                                    "previousBeforeImageUrl": active["beforeImageUrl"],
                                    "previousCount": int(active["detectedCount"]),
                                    "newCount": detected_count,
                                    "worker": "hf-space-24x7",
                                }
                            ),
                            now,
                        ),
                    )
                    conn.commit()
                    return {
                        "outcome": "ESCALATED",
                        "written": True,
                        "reportCode": active["reportCode"],
                        "detectedCount": detected_count,
                    }

                # CREATE laporan baru
                cur.execute(
                    """
                    SELECT id, points
                    FROM "RestrictedZone"
                    WHERE "regionId" = %s AND "isActive" = true
                    """,
                    (cam.region_id,),
                )
                zone_id: str | None = None
                for z in cur.fetchall():
                    if point_in_geo_polygon(cam.lat, cam.lng, z["points"]):
                        zone_id = str(z["id"])
                        break

                report_id = str(uuid.uuid4())
                report_code = generate_report_code(now)
                address = f"{cam.name} ({cam.region_label})"

                cur.execute(
                    """
                    INSERT INTO "ViolationReport" (
                        id, "reportCode", "regionId", "cameraId", "zoneId",
                        source, status, address, lat, lng,
                        "detectedCount", "maxConfidence", "beforeImageUrl",
                        "isSimulationMode", "relocationRequested",
                        "createdAt", "updatedAt"
                    )
                    VALUES (
                        %s, %s, %s, %s, %s,
                        'AUTO_AI', 'NEED_ACTION', %s, %s, %s,
                        %s, %s, %s,
                        false, false,
                        %s, %s
                    )
                    """,
                    (
                        report_id,
                        report_code,
                        cam.region_id,
                        cam.id,
                        zone_id,
                        address,
                        cam.lat,
                        cam.lng,
                        detected_count,
                        float(max_confidence),
                        image_url,
                        now,
                        now,
                    ),
                )
                cur.execute(
                    """
                    INSERT INTO "AuditLog" (
                        id, "reportId", "actorId", "actorRole", "actorName",
                        action, "fromStatus", "toStatus", note, metadata, "createdAt"
                    )
                    VALUES (%s, %s, NULL, 'SYSTEM_AI', 'PATRA HF 24/7 Worker',
                            'REPORT_CREATED', NULL, 'NEED_ACTION', %s, %s::jsonb, %s)
                    """,
                    (
                        str(uuid.uuid4()),
                        report_id,
                        f"Terdeteksi otomatis {detected_count} PKL oleh worker 24/7 (conf {max_confidence:.2f}).",
                        json.dumps(
                            {
                                "detectedCount": detected_count,
                                "maxConfidence": round(float(max_confidence), 3),
                                "worker": "hf-space-24x7",
                            }
                        ),
                        now,
                    ),
                )
                conn.commit()
                return {
                    "outcome": "CREATED",
                    "written": True,
                    "reportCode": report_code,
                    "detectedCount": detected_count,
                }
