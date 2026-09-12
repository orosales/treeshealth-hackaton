from __future__ import annotations

import base64
import json
import os

from .models import VisionFindings

PROMPT = """Analyze supplied imagery for externally visible tree warning signs that may justify professional inspection. Do not say a tree will fall, is safe, diseased, or give a definitive arborist diagnosis. Return only observable evidence. If something is obscured, use not_visible or false. Return JSON exactly matching the requested fields."""


def structured_findings_schema() -> dict:
    """Adapt Pydantic's default-friendly schema to OpenAI strict JSON Schema rules."""
    schema = VisionFindings.model_json_schema()
    schema["required"] = list(schema["properties"])
    return schema


async def analyze_images(image_bytes: bytes | None, content_type: str | None, aerial_url: str | None, street_view_image: tuple[bytes, str] | None = None) -> VisionFindings:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("AI analysis is not configured. Set OPENAI_API_KEY on the server and retry.")
    # Import only when an analysis is actually requested so local health and validation
    # endpoints remain usable before optional AI dependencies are installed.
    from openai import APIError, AsyncOpenAI
    content = [{"type": "input_text", "text": PROMPT}]
    if image_bytes and content_type:
        encoded = base64.b64encode(image_bytes).decode("ascii")
        content.append({"type": "input_image", "image_url": f"data:{content_type};base64,{encoded}"})
    if aerial_url:
        content.append({"type": "input_image", "image_url": aerial_url})
    if street_view_image:
        street_bytes, street_content_type = street_view_image
        street_encoded = base64.b64encode(street_bytes).decode("ascii")
        content.append({"type": "input_image", "image_url": f"data:{street_content_type};base64,{street_encoded}"})
    client = AsyncOpenAI(api_key=api_key)
    try:
        response = await client.responses.create(
            model=os.getenv("OPENAI_VISION_MODEL", "gpt-4.1-mini"),
            input=[{"role": "user", "content": content}],
            instructions=PROMPT,
            # Structured Outputs prevents model prose from leaking into the priority engine.
            text={"format": {"type": "json_schema", "name": "tree_visual_findings", "strict": True, "schema": structured_findings_schema()}},
            store=False,
        )
    except APIError as error:
        raise RuntimeError("AI analysis is unavailable. Please retry.") from error
    try:
        return VisionFindings.model_validate(json.loads(response.output_text))
    except Exception as error:
        raise RuntimeError("AI analysis returned an unusable structured response. Please retry.") from error
