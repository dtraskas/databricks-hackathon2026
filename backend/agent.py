"""
The simplest possible agent built with the Databricks Agent Framework.

Follows the recommended MLflow `ResponsesAgent` pattern:
https://docs.databricks.com/aws/en/generative-ai/agent-framework/author-agent

The agent is a thin wrapper around a Databricks foundation model serving
endpoint. It authenticates with `WorkspaceClient`, which resolves credentials
automatically both locally (Databricks CLI auth) and on Databricks Apps (the
app's service principal).
"""

import os
from uuid import uuid4

from databricks.sdk import WorkspaceClient
from mlflow.pyfunc import ResponsesAgent
from mlflow.types.responses import ResponsesAgentRequest, ResponsesAgentResponse

# Pay-per-token foundation model endpoint. Override with AGENT_LLM_ENDPOINT.
# Note: this workspace's Claude endpoints (e.g. databricks-claude-opus-4-8) are
# currently disabled (rate limit 0); switch the default once an admin enables one.
LLM_ENDPOINT = os.environ.get("AGENT_LLM_ENDPOINT", "databricks-meta-llama-3-3-70b-instruct")
SYSTEM_PROMPT = "You are a concise, helpful assistant."


class SimpleAgent(ResponsesAgent):
    """A single-turn agent that forwards the conversation to an LLM endpoint."""

    def __init__(self, model: str = LLM_ENDPOINT):
        self.model = model
        # OpenAI-compatible client pointed at Databricks Model Serving.
        self.client = WorkspaceClient().serving_endpoints.get_open_ai_client()

    def predict(self, request: ResponsesAgentRequest) -> ResponsesAgentResponse:
        # `prep_msgs_for_cc_llm` converts Responses-format input items into the
        # chat-completions message list the endpoint expects.
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        messages += self.prep_msgs_for_cc_llm([i.model_dump() for i in request.input])

        completion = self.client.chat.completions.create(
            model=self.model, messages=messages
        )
        text = completion.choices[0].message.content or ""

        return ResponsesAgentResponse(
            output=[self.create_text_output_item(text, str(uuid4()))]
        )


# Lazily instantiated so importing this module never requires credentials.
_agent: SimpleAgent | None = None


def get_agent() -> SimpleAgent:
    global _agent
    if _agent is None:
        _agent = SimpleAgent()
    return _agent


def _extract_text(response: ResponsesAgentResponse) -> str:
    parts: list[str] = []
    for item in response.output:
        item = item if isinstance(item, dict) else item.model_dump()
        for chunk in item.get("content") or []:
            if chunk.get("type") == "output_text":
                parts.append(chunk.get("text", ""))
    return "".join(parts)


def ask(message: str) -> str:
    """Send a single user message to the agent and return its text reply."""
    request = ResponsesAgentRequest(input=[{"role": "user", "content": message}])
    return _extract_text(get_agent().predict(request))
