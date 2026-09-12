from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Priority(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class VisionFindings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    crown_condition: Literal["good", "fair", "poor", "not_visible"] = "not_visible"
    crown_loss: bool = False
    dead_branches: bool = False
    broken_limbs: bool = False
    trunk_damage: bool = False
    possible_cavity: bool = False
    leaning: Literal["not_visible", "none", "possible", "significant"] = "not_visible"
    fungal_growth: Literal["not_visible", "none", "possible", "visible"] = "not_visible"
    base_or_root_damage: bool = False
    other_anomalies: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)
    summary: str


class AerialImage(BaseModel):
    image_url: str
    source: str
    capture_date: str | None = None
    bbox: list[float]


class AerialTreeDetection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    x_ratio: float = Field(ge=0, le=1)
    y_ratio: float = Field(ge=0, le=1)
    confidence: float = Field(ge=0, le=1)
    evidence: str


class AerialTreeDetections(BaseModel):
    model_config = ConfigDict(extra="forbid")
    detections: list[AerialTreeDetection] = Field(max_length=4)


class StreetViewImage(BaseModel):
    source: str = "Google Street View (historical)"
    capture_date: str | None = None
    copyright: str | None = None
    panorama_id: str
    panorama_latitude: float
    panorama_longitude: float


class AnalysisResponse(BaseModel):
    location: dict[str, float]
    submitted_at: str
    aerial: AerialImage | None = None
    street_view: StreetViewImage | None = None
    findings: VisionFindings
    warning_signs: list[str]
    score: int
    priority: Priority
    recommendation: str
    disclaimer: str


class AreaBounds(BaseModel):
    south: float
    west: float
    north: float
    east: float


class AreaCandidate(BaseModel):
    asset_id: str | None = None
    location: dict[str, float]
    priority: Priority
    score: int
    warning_signs: list[str]
    summary: str
    confidence: float
    street_view_date: str | None = None
    source: Literal["HRM_INVENTORY", "AERIAL_DETECTION"] = "HRM_INVENTORY"
    discovery_evidence: str | None = None
    street_view_available: bool = False


class AreaScreeningResponse(BaseModel):
    bounds: AreaBounds
    candidates_found: int
    candidate_source: str
    inventory_candidates_found: int = 0
    aerial_candidates_found: int = 0
    aerial_discovery_status: str = "not_run"
    screened: list[AreaCandidate]
    disclaimer: str
