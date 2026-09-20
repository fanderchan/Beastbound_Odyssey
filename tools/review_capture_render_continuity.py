"""Shared receipt validation for offline native review capture, never performance."""
from collections.abc import Mapping
from typing import Any


def validate_render_continuity(payload: Mapping[str, Any]) -> dict[str, Any]:
    continuity = payload.get("renderContinuity")
    start = payload.get("captureFrameStartInclusive")
    end = payload.get("processFrameEndExclusive")
    if (
        not isinstance(continuity, dict)
        or type(start) is not int
        or type(end) is not int
        or end <= start
        or continuity.get("policy") != "occluded_viewport_without_present_v1"
        or continuity.get("result") != "PASS"
        or continuity.get("performanceEvidence") is not False
        or type(continuity.get("startProcessFrame")) is not int
        or continuity.get("startProcessFrame") != start
        or type(continuity.get("endProcessFrameExclusive")) is not int
        or continuity.get("endProcessFrameExclusive") != end
        or type(continuity.get("completedProcessFrameCount")) is not int
        or continuity.get("completedProcessFrameCount") != end - start
        or type(continuity.get("missingDrawFrameCount")) is not int
        or continuity.get("missingDrawFrameCount") != 0
        or continuity.get("firstMissingDrawFrames") != []
        or type(continuity.get("fallbackDrawCount")) is not int
        or not 0 <= continuity.get("fallbackDrawCount", -1) <= end - start + 1
    ):
        raise ValueError("review render continuity 存在缺帧或无效绘制证据")
    return dict(continuity)
