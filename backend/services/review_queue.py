"""
The "What to review" queue.

Joins workspace.l1_facility_info.final_facility_score_view (facility name/state)
with workspace.results.facility_contradictions on facility_id. The query returns
one row per contradiction; we group them by facility so each facility is one
item carrying a list of contradictions, each with its own severity, what's wrong,
and priority (the UI renders one sub-row per contradiction):

    name           facility name (from the score view)
    state          facility state (from the score view)
    severity       highest contradiction confidence (facility-level, for sorting)
    priority       worst contradiction severity (facility-level, for sorting)
    contradictions list of { id, severity, whats_wrong, priority }
        severity     the contradiction's confidence score
        whats_wrong  contradiction_code + explanation
        priority     the contradiction's severity (High / Medium / Low)

The score view is denormalized (one facility repeated), so it is deduped to one
row per Reference_ID before the join. The joined result is small, cached briefly.
"""

import logging
import time

from backend.services.warehouse import query

logger = logging.getLogger(__name__)

VIEW = "workspace.l1_facility_info.final_facility_score_view"
CONTRADICTIONS = "workspace.results.facility_contradictions"

_MAX_ROWS = 200
_CACHE_TTL_SECONDS = 300

_rows_cache: list[dict] | None = None
_rows_ts: float = 0.0

_SQL = f"""
WITH facility AS (
  SELECT
    Reference_ID                 AS facility_id,
    ANY_VALUE(Organization_name) AS name,
    ANY_VALUE(State)             AS state
  FROM {VIEW}
  GROUP BY Reference_ID
)
SELECT
  c.contradiction_id                                     AS id,
  c.facility_id                                          AS facility_id,
  f.name                                                 AS name,
  f.state                                                AS state,
  c.confidence                                           AS severity,
  concat_ws(' — ', c.contradiction_code, c.explanation)  AS whats_wrong,
  c.severity                                             AS priority
FROM {CONTRADICTIONS} c
JOIN facility f ON f.facility_id = c.facility_id
"""

_PRIORITY_RANK = {"High": 0, "Medium": 1, "Low": 2}


def _rows() -> list[dict]:
    global _rows_cache, _rows_ts
    if _rows_cache is None or (time.time() - _rows_ts) >= _CACHE_TTL_SECONDS:
        _rows_cache = query(_SQL)
        _rows_ts = time.time()
    return _rows_cache


def _to_float(v) -> float | None:
    try:
        return round(float(v), 2)
    except (TypeError, ValueError):
        return None


def _priority(severity: str | None) -> str:
    """The contradictions table's severity (HIGH/MEDIUM/LOW) is the priority."""
    s = (severity or "").strip().capitalize()
    return s if s in _PRIORITY_RANK else "Low"


def get_review_queue(state: str | None = None, search: str | None = None) -> dict:
    """Facilities to review, narrowed by state and/or name search.

    The join returns one row per contradiction; we group them by facility so each
    facility carries a list of contradictions (each with severity, what's wrong,
    and priority). Facility-level severity/priority are the worst across the list,
    used for sorting and the facility header.
    """
    state_q = (state or "").strip().lower()
    search_q = (search or "").strip().lower()

    by_facility: dict[str, dict] = {}
    for r in _rows():
        fid = r.get("facility_id")
        if not fid:
            continue
        name = (r.get("name") or "").strip() or "(unknown facility)"
        r_state = (r.get("state") or "").strip()
        if state_q and r_state.lower() != state_q:
            continue
        if search_q and search_q not in name.lower():
            continue

        severity = _to_float(r.get("severity"))
        priority = _priority(r.get("priority"))
        whats = (r.get("whats_wrong") or "").strip()

        item = by_facility.get(fid)
        if item is None:
            item = by_facility[fid] = {
                "id": fid,
                "facility_id": fid,
                "name": name,
                "state": r_state,
                "severity": severity,
                "priority": priority,
                "contradictions": [],
            }

        # One sub-row per distinct contradiction.
        if whats and not any(c["whats_wrong"] == whats for c in item["contradictions"]):
            item["contradictions"].append(
                {
                    "id": r.get("id"),
                    "severity": severity,
                    "whats_wrong": whats,
                    "priority": priority,
                }
            )
        # Facility-level worst, for sorting and the header.
        if severity is not None and (item["severity"] is None or severity > item["severity"]):
            item["severity"] = severity
        if _PRIORITY_RANK[priority] < _PRIORITY_RANK[item["priority"]]:
            item["priority"] = priority

    items = list(by_facility.values())
    for item in items:
        # Worst contradiction first within each facility.
        item["contradictions"].sort(
            key=lambda c: (_PRIORITY_RANK[c["priority"]], -(c["severity"] or 0))
        )
    # Highest-priority facility first, then by severity.
    items.sort(key=lambda x: (_PRIORITY_RANK[x["priority"]], -(x["severity"] or 0)))
    return {
        "rows": items[:_MAX_ROWS],
        "count": len(items),
        "capped": len(items) > _MAX_ROWS,
    }
