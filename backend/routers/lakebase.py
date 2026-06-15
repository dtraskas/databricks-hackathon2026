"""Lakebase Postgres data endpoint."""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/lakebase", tags=["lakebase"])


@router.get("/data")
async def get_lakebase_data(
    table: str = "information_schema.tables",
    limit: int = 10,
) -> dict[str, Any]:
    """Get data from a Lakebase table. Table must be in 'schema.table' format."""
    from backend.config.database import AsyncSessionLocal

    if AsyncSessionLocal is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not initialized. Check server logs for connection issues.",
        )

    if not table or "." not in table:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Table must be in format: schema.table",
        )

    limit = min(max(limit, 1), 1000)

    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(text(f"SELECT * FROM {table} LIMIT {limit}"))
            columns = list(result.keys())
            rows = result.fetchall()
            return {"columns": columns, "data": [dict(zip(columns, row)) for row in rows]}
    except Exception as e:
        logger.error(f"Query error for table {table}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to execute query",
        )
