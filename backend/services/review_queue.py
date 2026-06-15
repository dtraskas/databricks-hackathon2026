"""
The "What to review" queue, fed by
datalake_dev.l1_facility_info.final_facility_score_view.

The view is denormalized (one facility repeated across rows); we dedupe by
Reference_ID, cache the deduped rows, and return the highest-risk facilities.
"""

import json
import logging
import re
import time

from backend.services.warehouse import query

logger = logging.getLogger(__name__)

VIEW = "datalake_dev.l1_facility_info.final_facility_score_view"

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I
)
_MAX_ROWS = 200  # the queue shows the top-N riskiest facilities
_CACHE_TTL_SECONDS = 300

_rows_cache: list[dict] | None = None
_rows_ts: float = 0.0

_SQL = f"""
WITH q AS (
  SELECT
    Reference_ID                         AS id,
    ANY_VALUE(Organization_name)         AS name,
    ANY_VALUE(State)                     AS state,
    ANY_VALUE(final_risk_score)          AS risk,
    ANY_VALUE(completeness_score)        AS completeness,
    ANY_VALUE(evidence_score)            AS evidence,
    ANY_VALUE(consistency_score)         AS consistency,
    ANY_VALUE(geospatial_score)          AS geospatial,
    ANY_VALUE(contradiction_score)       AS contradiction,
    ANY_VALUE(contradiction_explanation) AS contradiction_explanation,
    ANY_VALUE(Issue_value)               AS issues
  FROM {VIEW}
  GROUP BY Reference_ID
)
SELECT * FROM q
"""


def _view_rows() -> list[dict]:
    global _rows_cache, _rows_ts
    if _rows_cache is None or (time.time() - _rows_ts) >= _CACHE_TTL_SECONDS:
        _rows_cache = query(_SQL)
        _rows_ts = time.time()
    return _rows_cache


def _to_float(v) -> float | None:
    try:
        return round(float(v), 1)
    except (TypeError, ValueError):
        return None


def _to_int(v) -> int | None:
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def _issues(raw) -> list[str]:
    """Issue_value is a JSON array string padded with nulls."""
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return []
    if not isinstance(raw, list):
        return []
    return [s.strip() for s in raw if isinstance(s, str) and s.strip()]


def _priority(risk: float | None) -> str:
    if risk is None:
        return "Low"
    if risk >= 40:
        return "High"
    if risk >= 20:
        return "Medium"
    return "Low"


def get_review_queue(state: str | None = None, search: str | None = None) -> dict:
    """Highest-risk facilities to review, narrowed by state and/or name search."""
    state_q = (state or "").strip().lower()
    search_q = (search or "").strip().lower()

    items = []
    for r in _view_rows():
        if not (isinstance(r.get("id"), str) and _UUID_RE.match(r["id"])):
            continue
        name = (r.get("name") or "").strip() or "(unnamed)"
        r_state = (r.get("state") or "").strip()
        if state_q and r_state.lower() != state_q:
            continue
        if search_q and search_q not in name.lower():
            continue

        risk = _to_float(r.get("risk"))
        items.append(
            {
                "id": r["id"],
                "name": name,
                "state": r_state,
                "risk": risk,
                "completeness": _to_float(r.get("completeness")),
                "evidence": _to_float(r.get("evidence")),
                "consistency": _to_float(r.get("consistency")),
                "geospatial": _to_float(r.get("geospatial")),
                "contradiction": _to_int(r.get("contradiction")),
                "contradiction_explanation": (r.get("contradiction_explanation") or "").strip(),
                "issues": _issues(r.get("issues")),
                "priority": _priority(risk),
            }
        )

    # Highest risk first; missing risk sinks to the bottom.
    items.sort(key=lambda x: (x["risk"] is None, -(x["risk"] or 0)))
    return {
        "rows": items[:_MAX_ROWS],
        "count": len(items),
        "capped": len(items) > _MAX_ROWS,
    }
