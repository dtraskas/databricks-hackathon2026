"""
Persist reviewer decisions from the Check-a-facility screen.

Each time a reviewer approves ("Looks good") or rejects a facility, a row is
appended to workspace.results.facility_decisions capturing the facility, the
moment, the note text, and the decision. The table is append-only — every
decision is its own audit row, so a facility can have a history of decisions.
"""

import logging

from backend.services.warehouse import query

logger = logging.getLogger(__name__)

TABLE = "workspace.results.facility_decisions"

# Decisions the UI can record (maps to the two buttons).
_VALID_DECISIONS = {"approved", "rejected"}

_INSERT_SQL = f"""
INSERT INTO {TABLE} (facility_id, decided_at, notes, decision)
VALUES (:facility_id, current_timestamp(), :notes, :decision)
"""


def save_decision(facility_id: str, decision: str, notes: str | None) -> dict:
    """Append one decision row. Returns the saved record.

    `decided_at` is set to the warehouse's current_timestamp() so the time is
    consistent regardless of where the request originates.
    """
    fid = (facility_id or "").strip()
    if not fid:
        raise ValueError("facility_id is required")

    dec = (decision or "").strip().lower()
    if dec not in _VALID_DECISIONS:
        raise ValueError(f"decision must be one of {sorted(_VALID_DECISIONS)}")

    note_text = (notes or "").strip()

    query(_INSERT_SQL, parameters={
        "facility_id": fid,
        "notes": note_text,
        "decision": dec,
    })
    logger.info("Saved decision %r for facility %s", dec, fid)
    return {"facility_id": fid, "decision": dec, "notes": note_text, "saved": True}
