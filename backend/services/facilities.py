"""
Builds the Overview payload from the enriched facility table.

The source table is heavily denormalized (~10M rows joined against postal data,
~10k distinct facilities), so we dedupe to one row per Reference_ID, pull that
small facility-level set once, and compute all aggregations in Python. The
result is cached in memory with a short TTL to avoid rescanning on every load.
"""

import logging
import re
import time
from collections import Counter

from backend.services.warehouse import query

logger = logging.getLogger(__name__)

TABLE = "workspace.l1_facility_info.facility_core_details_enriched"

# Every per-field data-quality status column in the table.
STATUS_COLS = [
    "email_status",
    "office_phone_status",
    "state_status",
    "year_established_status",
    "address_line1_status",
    "pincode_status",
    "organization_name_status",
]
# Address-related statuses drive the "Address looks right" KPI.
ADDRESS_STATUS_COLS = ["address_line1_status", "pincode_status", "state_status"]

# India bounding box — drop obviously bad coordinates before mapping.
_LAT_RANGE = (6.0, 38.0)
_LNG_RANGE = (67.0, 98.0)

_TOP_STATES = 15
_MAX_POINTS = 1500  # cap markers so the Leaflet map stays responsive
_MAX_FACILITY_OPTIONS = 1000  # cap the Facility dropdown so the Select stays responsive
_MAX_STATE_OPTIONS = 50  # `State` is free text; keep the most common, drop the long noisy tail
_FACILITY_TYPE = "hospital"  # the Facility views list hospitals only
_MAX_HOSPITALS = 500  # cap map markers per state/city query

# Reference_ID is a UUID; a few source rows are malformed (shifted/garbled values
# with a non-UUID id). Filter those out of the dropdown options.
_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I
)

_CACHE_TTL_SECONDS = 300
_rows_cache: list[dict] | None = None
_rows_ts: float = 0.0

# One row per facility. ANY_VALUE collapses the postal-join duplicates.
_STATUS_SELECT = ",\n    ".join(f"ANY_VALUE({c}) AS {c}" for c in STATUS_COLS)
_FACILITIES_SQL = f"""
WITH facilities AS (
  SELECT
    Reference_ID                          AS id,
    ANY_VALUE(Organization_name)          AS name,
    ANY_VALUE(Organization_Facility_type) AS facility_type,
    ANY_VALUE(State)                      AS state,
    ANY_VALUE(City)                       AS city,
    ANY_VALUE(Address_line1)              AS address,
    ANY_VALUE(Zipcode)                    AS zipcode,
    ANY_VALUE(Office_phone)               AS phone,
    ANY_VALUE(Email)                      AS email,
    ANY_VALUE(Organization_Website)       AS website,
    ANY_VALUE(latitude)                   AS lat,
    ANY_VALUE(longitude)                  AS lng,
    {_STATUS_SELECT}
  FROM {TABLE}
  GROUP BY Reference_ID
)
SELECT * FROM facilities
"""


def _is_valid(status: str | None) -> bool:
    """Status values look like '✅ Valid' / '❌ Missing' / '❌ Invalid Postcode'."""
    return bool(status) and "Valid" in status


def _to_float(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _coords(r: dict) -> tuple[float, float] | None:
    """Return (lat, lng) if present and inside the India bounding box."""
    lat, lng = _to_float(r.get("lat")), _to_float(r.get("lng"))
    if lat is None or lng is None:
        return None
    if _LAT_RANGE[0] <= lat <= _LAT_RANGE[1] and _LNG_RANGE[0] <= lng <= _LNG_RANGE[1]:
        return lat, lng
    return None


def _facilities(force: bool = False) -> list[dict]:
    """Deduped facility rows, cached so one warehouse scan feeds every view."""
    global _rows_cache, _rows_ts
    if force or _rows_cache is None or (time.time() - _rows_ts) >= _CACHE_TTL_SECONDS:
        _rows_cache = query(_FACILITIES_SQL)
        _rows_ts = time.time()
    return _rows_cache


def get_overview(force: bool = False) -> dict:
    """Overview payload: KPIs, per-state counts, and map points."""
    rows = _facilities(force)
    total = len(rows)

    # Facilities per state (top N) for the bar chart.
    state_counts = Counter((r.get("state") or "Unknown").strip() for r in rows)
    by_state = [
        {"state": s, "count": c} for s, c in state_counts.most_common(_TOP_STATES)
    ]

    # KPIs are average validity rates: how many status checks pass overall.
    # "Filled in" looks across all status columns; "Address looks right" across
    # the address-related ones. Counted in cells (facilities × columns).
    filled_valid = 0
    address_valid = 0
    points = []

    for r in rows:
        valid_count = sum(_is_valid(r.get(c)) for c in STATUS_COLS)
        filled_valid += valid_count
        address_valid += sum(_is_valid(r.get(c)) for c in ADDRESS_STATUS_COLS)

        # Map points: facilities with sane coordinates, capped for responsiveness.
        if len(points) < _MAX_POINTS:
            lat, lng = _to_float(r.get("lat")), _to_float(r.get("lng"))
            if (
                lat is not None
                and lng is not None
                and _LAT_RANGE[0] <= lat <= _LAT_RANGE[1]
                and _LNG_RANGE[0] <= lng <= _LNG_RANGE[1]
            ):
                points.append(
                    {
                        "id": r.get("id"),
                        "name": r.get("name"),
                        "state": r.get("state"),
                        "lat": lat,
                        "lng": lng,
                        "good": valid_count,  # valid checks out of len(STATUS_COLS)
                    }
                )

    return {
        "total": total,
        "status_checks": len(STATUS_COLS),
        "kpis": {
            "filled_in": {
                "valid": filled_valid,
                "total": total * len(STATUS_COLS),
                "checks": len(STATUS_COLS),
            },
            "address_ok": {
                "valid": address_valid,
                "total": total * len(ADDRESS_STATUS_COLS),
                "checks": len(ADDRESS_STATUS_COLS),
            },
        },
        "by_state": by_state,
        "points": points,
        "points_capped": total > len(points),
    }


def get_options() -> dict:
    """Distinct states and facilities that feed the shared dropdowns.

    Drops the small number of malformed source rows (non-UUID Reference_ID).
    """
    rows = [
        r
        for r in _facilities()
        if isinstance(r.get("id"), str) and _UUID_RE.match(r["id"])
    ]

    state_counts = Counter(s for r in rows if (s := (r.get("state") or "").strip()))
    states = [s for s, _ in state_counts.most_common(_MAX_STATE_OPTIONS)]

    facilities = sorted(
        (
            {
                "id": r["id"],
                "name": (r.get("name") or "").strip() or "(unnamed)",
                "state": (r.get("state") or "").strip(),
            }
            for r in rows
            if (r.get("facility_type") or "").strip().lower() == _FACILITY_TYPE
        ),
        key=lambda f: f["name"].lower(),
    )
    capped = facilities[:_MAX_FACILITY_OPTIONS]
    return {
        "states": states,
        "facilities": capped,
        "facilities_capped": len(facilities) > len(capped),
    }


def get_hospitals(state: str | None = None, city: str | None = None) -> dict:
    """Mappable hospitals, optionally narrowed by state (exact) and city (contains).

    Each record carries the fields and per-check statuses needed to render the
    detail card, so selecting a marker needs no extra request.
    """
    state_q = (state or "").strip().lower()
    city_q = (city or "").strip().lower()

    facilities = []
    for r in _facilities():
        if not (isinstance(r.get("id"), str) and _UUID_RE.match(r["id"])):
            continue
        if (r.get("facility_type") or "").strip().lower() != _FACILITY_TYPE:
            continue
        coords = _coords(r)
        if coords is None:
            continue

        r_state = (r.get("state") or "").strip()
        r_city = (r.get("city") or "").strip()
        if state_q and r_state.lower() != state_q:
            continue
        if city_q and city_q not in r_city.lower():
            continue

        statuses = {c: _is_valid(r.get(c)) for c in STATUS_COLS}
        facilities.append(
            {
                "id": r["id"],
                "name": (r.get("name") or "").strip() or "(unnamed)",
                "state": r_state,
                "city": r_city,
                "address": (r.get("address") or "").strip(),
                "zipcode": (r.get("zipcode") or "").strip(),
                "phone": (r.get("phone") or "").strip(),
                "email": (r.get("email") or "").strip(),
                "website": (r.get("website") or "").strip(),
                "lat": coords[0],
                "lng": coords[1],
                "good": sum(statuses.values()),
                "statuses": statuses,
            }
        )
        if len(facilities) >= _MAX_HOSPITALS:
            break

    facilities.sort(key=lambda f: f["name"].lower())
    return {
        "facilities": facilities,
        "count": len(facilities),
        "capped": len(facilities) >= _MAX_HOSPITALS,
        "checks": len(STATUS_COLS),
    }
