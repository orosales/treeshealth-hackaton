from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

from .geonova import get_aerial_image, get_area_aerial_image
from .models import AnalysisResponse, AreaBounds, AreaCandidate, AreaScreeningResponse
from .area import MAX_AERIAL_CANDIDATES, MAX_CANDIDATES, aerial_candidate_locations, public_trees, validate_bounds
from .priority import DISCLAIMER, hrm_signals, inspection_priority, recommendation, score_findings
from .vision import analyze_images, detect_aerial_trees
from .streetview import bearing_to_target, get_street_view, get_street_view_image
from .address import approximate_address

load_dotenv()
app = FastAPI(title="Halifax Tree Inspection Priority API")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])


def valid_halifax_coordinate(latitude: float, longitude: float) -> bool:
    return 44.3 <= latitude <= 45.0 and -64.1 <= longitude <= -63.3


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/geonova/image")
async def geonova_image(latitude: float, longitude: float):
    if not valid_halifax_coordinate(latitude, longitude):
        raise HTTPException(422, "Choose a location in the Halifax Regional Municipality.")
    aerial = await get_aerial_image(latitude, longitude)
    if not aerial:
        raise HTTPException(503, "GeoNOVA imagery is unavailable for this location. Continue with the ground photo.")
    return {"imageUrl": aerial.image_url, "source": aerial.source, "captureDate": aerial.capture_date, "bbox": aerial.bbox}


@app.get("/api/streetview")
async def streetview(latitude: float, longitude: float):
    if not valid_halifax_coordinate(latitude, longitude):
        raise HTTPException(422, "Choose a location in the Halifax Regional Municipality.")
    context = await get_street_view(latitude, longitude)
    if not context:
        raise HTTPException(404, "Historical Street View is unavailable for this location or has not been configured.")
    return {"source": context.source, "captureDate": context.capture_date, "copyright": context.copyright}


@app.get("/api/streetview/image")
async def streetview_image(latitude: float, longitude: float):
    if not valid_halifax_coordinate(latitude, longitude):
        raise HTTPException(422, "Choose a location in the Halifax Regional Municipality.")
    context = await get_street_view(latitude, longitude)
    heading = bearing_to_target(context.panorama_latitude, context.panorama_longitude, latitude, longitude) if context else None
    image = await get_street_view_image(context.panorama_id, heading) if context else None
    if not image:
        raise HTTPException(404, "Historical Street View image unavailable.")
    body, content_type = image
    return Response(content=body, media_type=content_type, headers={"Cache-Control": "private, max-age=3600"})


@app.get("/api/location/address")
async def location_address(latitude: float, longitude: float):
    if not valid_halifax_coordinate(latitude, longitude):
        raise HTTPException(422, "Choose a location in the Halifax Regional Municipality.")
    address = await approximate_address(latitude, longitude)
    if not address:
        raise HTTPException(404, "An approximate street address is unavailable for this tree point.")
    return {"address": address, "label": "Approximate nearest address"}


@app.post("/api/tree-analysis", response_model=AnalysisResponse)
async def tree_analysis(latitude: float = Form(...), longitude: float = Form(...), groundImage: UploadFile = File(...)):
    if not valid_halifax_coordinate(latitude, longitude):
        raise HTTPException(422, "Choose a location in the Halifax Regional Municipality.")
    if not groundImage.content_type or not groundImage.content_type.startswith("image/"):
        raise HTTPException(422, "Upload a JPG, PNG, HEIC, or other supported image.")
    image = await groundImage.read()
    if not image or len(image) > 15 * 1024 * 1024:
        raise HTTPException(422, "Use an image between 1 byte and 15 MB.")
    aerial = await get_aerial_image(latitude, longitude)
    street_view = await get_street_view(latitude, longitude)
    heading = bearing_to_target(street_view.panorama_latitude, street_view.panorama_longitude, latitude, longitude) if street_view else None
    street_image = await get_street_view_image(street_view.panorama_id, heading) if street_view else None
    try:
        findings = await analyze_images(image, groundImage.content_type, aerial.image_url if aerial else None, street_image)
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from error
    score, signs = score_findings(findings)
    priority = inspection_priority(score)
    return AnalysisResponse(
        location={"latitude": latitude, "longitude": longitude}, submitted_at=datetime.now(timezone.utc).isoformat(),
        aerial=aerial, street_view=street_view, findings=findings, warning_signs=signs, score=score, priority=priority,
        recommendation=recommendation(priority), disclaimer=DISCLAIMER,
    )


@app.post("/api/area-screen", response_model=AreaScreeningResponse)
async def area_screen(bounds: AreaBounds):
    try:
        validate_bounds(bounds)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    try:
        total, trees = await public_trees(bounds)
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from error
    aerial_locations: list[tuple[float, float, str]] = []
    discovery_status = "imagery_unavailable"
    area_aerial = await get_area_aerial_image(bounds)
    if area_aerial:
        discovery_status = "analysis_unavailable"
        try:
            detections = await detect_aerial_trees(area_aerial.image_url)
            aerial_locations = aerial_candidate_locations(detections.detections, area_aerial.bbox, bounds, trees)
            discovery_status = "complete"
        except RuntimeError:
            # Aerial discovery supplements the authoritative inventory. A failure here
            # must not discard otherwise usable HRM candidates.
            pass

    aerial_slots = min(
        len(aerial_locations),
        MAX_AERIAL_CANDIDATES,
        max(2, MAX_CANDIDATES - min(len(trees), MAX_CANDIDATES)),
    )
    inventory_slots = MAX_CANDIDATES - aerial_slots
    screening_targets = [(*tree, "HRM_INVENTORY", None) for tree in trees[:inventory_slots]]
    screening_targets.extend((latitude, longitude, None, None, None, "AERIAL_DETECTION", evidence) for latitude, longitude, evidence in aerial_locations[:aerial_slots])
    if not screening_targets:
        return AreaScreeningResponse(
            bounds=bounds, candidates_found=0, candidate_source="Halifax Public Trees + GeoNOVA aerial discovery",
            inventory_candidates_found=total, aerial_candidates_found=len(aerial_locations), aerial_discovery_status=discovery_status,
            screened=[], disclaimer=DISCLAIMER,
        )
    candidates: list[AreaCandidate] = []
    for latitude, longitude, asset_id, fcode, wires, source, discovery_evidence in screening_targets:
        aerial = await get_aerial_image(latitude, longitude)
        street_view = await get_street_view(latitude, longitude)
        heading = bearing_to_target(street_view.panorama_latitude, street_view.panorama_longitude, latitude, longitude) if street_view else None
        street_image = await get_street_view_image(street_view.panorama_id, heading) if street_view else None
        if not aerial and not street_image:
            continue
        try:
            findings = await analyze_images(None, None, aerial.image_url if aerial else None, street_image)
        except RuntimeError as error:
            raise HTTPException(503, str(error)) from error
        score, signs = score_findings(findings)
        if source == "HRM_INVENTORY":
            hrm_score, hrm_signs = hrm_signals(fcode, wires)
            score += hrm_score
            signs = signs + hrm_signs
        candidates.append(AreaCandidate(
            asset_id=asset_id, location={"latitude": latitude, "longitude": longitude}, priority=inspection_priority(score), score=score,
            warning_signs=signs, summary=findings.summary, confidence=findings.confidence,
            street_view_date=street_view.capture_date if street_view else None,
            source=source, discovery_evidence=discovery_evidence, street_view_available=street_view is not None,
        ))
    priority_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    candidates.sort(key=lambda item: (priority_order[item.priority.value], -item.score))
    return AreaScreeningResponse(
        bounds=bounds, candidates_found=total + len(aerial_locations), candidate_source="Halifax Public Trees + GeoNOVA aerial discovery",
        inventory_candidates_found=total, aerial_candidates_found=len(aerial_locations), aerial_discovery_status=discovery_status,
        screened=candidates, disclaimer=DISCLAIMER,
    )


static_dir = Path(__file__).resolve().parent.parent / "static"
if static_dir.is_dir():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
