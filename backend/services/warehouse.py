"""
Thin helper for running SQL against a Databricks SQL warehouse.

Uses the Statement Execution API via `WorkspaceClient`, which resolves
credentials automatically both locally (Databricks CLI auth) and on Databricks
Apps (the app's service principal). Results are returned as a list of dicts.
"""

import logging
import os
from typing import Any

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import StatementParameterListItem, StatementState

logger = logging.getLogger(__name__)

# SQL warehouse that backs ad-hoc queries. Override with DATABRICKS_WAREHOUSE_ID.
WAREHOUSE_ID = os.environ.get("DATABRICKS_WAREHOUSE_ID", "09dcc4e2f84586bd")

_client: WorkspaceClient | None = None


def _ws() -> WorkspaceClient:
    global _client
    if _client is None:
        _client = WorkspaceClient()
    return _client


def query(sql: str, parameters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Run `sql` on the warehouse and return all rows as dicts.

    Pass `parameters` to use named markers (`:name`) in `sql` — values are bound
    server-side, so callers never string-format untrusted input into the query.

    Blocking — call it from a worker thread (e.g. asyncio.to_thread) so the
    event loop stays free.
    """
    se = _ws().statement_execution
    param_list = (
        [StatementParameterListItem(name=k, value=None if v is None else str(v))
         for k, v in parameters.items()]
        if parameters
        else None
    )
    resp = se.execute_statement(
        warehouse_id=WAREHOUSE_ID,
        statement=sql,
        parameters=param_list,
        wait_timeout="50s",  # API max; large scans usually finish well within
    )

    statement_id = resp.statement_id
    state = resp.status.state if resp.status else None

    # If the warehouse needed more than the inline wait, poll until terminal.
    while state in (StatementState.PENDING, StatementState.RUNNING):
        resp = se.get_statement(statement_id)
        state = resp.status.state if resp.status else None

    if state != StatementState.SUCCEEDED:
        msg = resp.status.error.message if resp.status and resp.status.error else state
        raise RuntimeError(f"Warehouse query failed: {msg}")

    columns = [c.name for c in resp.manifest.schema.columns or []]

    # Collect rows across all result chunks (data is row-major string arrays).
    rows: list[list[str]] = list(resp.result.data_array or []) if resp.result else []
    chunk = resp.result
    while chunk and chunk.next_chunk_index is not None:
        chunk = se.get_statement_result_chunk_n(statement_id, chunk.next_chunk_index)
        rows.extend(chunk.data_array or [])

    return [dict(zip(columns, row)) for row in rows]
