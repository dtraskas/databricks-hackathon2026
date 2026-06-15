"""Facility data endpoints backed by the enriched Unity Catalog table."""

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, HTTPException, status

from backend.services.facilities import get_hospitals, get_options, get_overview
from backend.services.review_queue import get_review_queue

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/facilities", tags=["facilities"])


@router.get("/overview")
async def facilities_overview(refresh: bool = False) -> dict[str, Any]:
    """Aggregated Overview data: state counts, status summary, and map points."""
    try:
        # Blocking warehouse query — keep the event loop free.
        return await asyncio.to_thread(get_overview, refresh)
    except Exception as e:
        logger.error(f"Failed to build facilities overview: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to load facility data: {e}",
        )


@router.get("/options")
async def facilities_options() -> dict[str, Any]:
    """Distinct states and facilities that feed the shared dropdowns."""
    try:
        return await asyncio.to_thread(get_options)
    except Exception as e:
        logger.error(f"Failed to load facility options: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to load facility options: {e}",
        )


@router.get("/hospitals")
async def hospitals(state: str | None = None, city: str | None = None) -> dict[str, Any]:
    """Mappable hospitals for the locator, narrowed by state and/or city."""
    try:
        return await asyncio.to_thread(get_hospitals, state, city)
    except Exception as e:
        logger.error(f"Failed to load hospitals: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to load hospitals: {e}",
        )


@router.get("/review-queue")
async def review_queue(state: str | None = None, search: str | None = None) -> dict[str, Any]:
    """Highest-risk facilities to review, from final_facility_score_view."""
    try:
        return await asyncio.to_thread(get_review_queue, state, search)
    except Exception as e:
        logger.error(f"Failed to load review queue: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to load review queue: {e}",
        )
