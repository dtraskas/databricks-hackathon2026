"""
Agent endpoint — DISABLED (kept as scaffolding).

The single-agent chat endpoint is commented out for now. The underlying
implementation lives in backend/agent.py (the Databricks Agent Framework
`ResponsesAgent` example). To re-enable: uncomment below and register the router
in backend/app.py (`app.include_router(agents.router)`).
"""

# import asyncio
# import logging
# from typing import Any, Dict
#
# from fastapi import APIRouter, HTTPException, status
#
# logger = logging.getLogger(__name__)
#
# router = APIRouter(tags=["agents"])
#
#
# @router.post("/api/agent/chat")
# async def agent_chat(body: Dict[str, Any]) -> Dict[str, str]:
#     """Send a message to the agent and return its reply."""
#     message = (body.get("message") or "").strip()
#     if not message:
#         raise HTTPException(
#             status_code=status.HTTP_400_BAD_REQUEST,
#             detail="'message' is required",
#         )
#
#     from backend.agent import ask
#
#     try:
#         reply = await asyncio.to_thread(ask, message)
#         return {"response": reply}
#     except Exception as e:
#         logger.error(f"Agent request failed: {e}")
#         raise HTTPException(
#             status_code=status.HTTP_502_BAD_GATEWAY,
#             detail=f"Agent request failed: {e}",
#         )
