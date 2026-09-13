# Halifax Tree Risk Detection MVP — Architecture

## 1. Architecture Goal

Create the smallest practical architecture capable of demonstrating AI-assisted tree inspection prioritization within a short hackathon timeframe.

The architecture should:

- Avoid manual API approval dependencies.
- Use public/open geographic data where possible.
- Support a current user-supplied tree image.
- Use a vision-capable AI model.
- Remain functional even if optional imagery sources fail.

## 2. Recommended MVP Stack

### Frontend

Recommended:

- React
- Leaflet or MapLibre
- OpenStreetMap

Responsibilities:

- Display Halifax map
- Capture map clicks
- Upload/capture tree photo
- Display aerial image
- Display AI results
- Display inspection priority

### Backend

Decided:

- FastAPI (Python)

FastAPI is chosen for the hackathon because it is lightweight and easy to integrate with image processing and AI APIs.

### AI

Use an existing vision-capable model.

The AI should receive:

- Ground-level tree image
- Aerial image when available
- Location metadata
- A strict analysis prompt

The model should return structured JSON.

### Geographic Imagery

Primary aerial source:

- GeoNOVA / Nova Scotia Orthophoto map service

Primary current-detail source:

- User phone/camera image

Freshness-aware street-level cascade:

1. Newest nearby Mapillary image when `MAPILLARY_ACCESS_TOKEN` is configured.
2. Google Street View when Mapillary has no usable nearby image.

Google imagery is a historical fallback, not a current-condition claim. Every
street-level result carries its provider, capture date, and a `RECENT`, `AGING`,
`HISTORICAL`, or `UNKNOWN` freshness label. A phone or drone image uploaded by a
user is the confirmation source after storms or when provider imagery is stale.

Copernicus Sentinel-1 radar and Sentinel-2 optical catalogue metadata are queried
for the selected area. They show the newest available area observations and
optical cloud cover, but are kept separate
from individual-tree evidence. At 10 m-class optical resolution it is suitable
for a later area-scale change detector, not for diagnosing one tree.

### Hybrid Area Candidate Discovery

For area screening, use Halifax Regional Municipality's public **Public Trees** ArcGIS FeatureServer as the authoritative candidate source. It provides municipal and right-of-way tree asset points, so the workflow is not dependent on volunteers mapping individual trees in OpenStreetMap.

Supplement the inventory with AI discovery over one north-up GeoNOVA orthophoto of the selected area. The vision model may return up to four high-confidence individual canopy centres. The backend georeferences those normalized image coordinates, filters detections outside the selected boundary, and removes discoveries within 18 metres of an HRM asset or another discovery.

HRM trees and aerial discoveries share the same evidence-screening pipeline:
local GeoNOVA context plus the freshest usable ground context (Mapillary first,
Google Street View fallback). The backend screens at most eight combined
candidates per user-run scan, reserving no more than four positions for aerial
discoveries. This is a bounded hackathon control for external image/AI calls, not
a complete municipal inspection run.

The UI distinguishes official inventory trees from approximate aerial discoveries. Aerial candidates are leads rather than confirmed individual trees and do not receive municipal asset IDs.

### Database

Not required for the first demo.

If persistence is required:

- PostgreSQL
- PostGIS extension

## 3. High-Level Architecture

```text
┌──────────────────────────────┐
│          Web Browser         │
│                              │
│ React + Leaflet / MapLibre   │
│                              │
│ • Halifax map                │
│ • Location selection         │
│ • Camera / image upload      │
│ • Analysis results           │
└──────────────┬───────────────┘
               │
               │ HTTPS
               ▼
┌──────────────────────────────┐
│           Backend            │
│                              │
│ FastAPI (Python)              │
│                              │
│ • Coordinates handling       │
│ • Halifax Public Trees query │
│ • GeoNOVA integration        │
│ • Ground-provider cascade    │
│ • Sentinel radar/optical metadata │
│ • AI orchestration           │
│ • Priority calculation       │
│ • Report generation          │
└───────┬──────────┬───────────┘
        │          │
        │          │
        ▼          ▼
┌──────────────┐  ┌───────────────────────┐
│   GeoNOVA    │  │    Vision AI Model    │
│ Orthophotos  │  │                       │
│              │  │ Analyze:              │
│ aerial image │  │ • Crown               │
│ + metadata   │  │ • Branches            │
└──────────────┘  │ • Trunk               │
                  │ • Lean                 │
                  │ • Damage               │
                  └───────────┬───────────┘
                              │
                              ▼
                  ┌───────────────────────┐
                  │ Inspection Priority   │
                  │                       │
                  │ LOW / MEDIUM / HIGH   │
                  └───────────────────────┘
```

## 4. Request Flow

### Area Screening Flow — Hybrid Discovery

```text
User draws an area (up to about 5 km across)
        ↓
Backend queries Halifax Public Trees FeatureServer by bounding box
        ↓
Backend analyzes selected-area GeoNOVA imagery for possible unmapped crowns
        ↓
Georeference and deduplicate aerial candidates against HRM assets
        ↓
For up to eight combined candidates: GeoNOVA + Mapillary, with Street View fallback
        ↓
Vision model returns visible findings
        ↓
Deterministic inspection-priority ranking and source-aware map markers
```

The UI must label these as visual screening leads, not confirmed hazards. It also
shows the street-image provider and freshness, plus recent Sentinel-1/2 acquisition
metadata for area context. A current phone/drone photo remains the strongest
evidence for the separate single-tree confirmation flow.

### Step 1 — Select Location

The user clicks the map.

Frontend captures:

```json
{
  "latitude": 44.6488,
  "longitude": -63.5752
}
```

### Step 2 — Retrieve GeoNOVA Image

Frontend sends coordinates to backend.

Backend converts the coordinates into a small bounding box.

Example concept:

```text
selected coordinate
       ↓
create 20–50 meter bounding box
       ↓
request orthophoto image
```

The backend retrieves a 640 × 640 export covering approximately 240 metres from
GeoNOVA's cached NSODB 1:10,000 orthophoto service. This extent respects the
service's maximum cached zoom level; smaller export extents return blank tiles.

Possible pattern:

```text
GeoNOVA ArcGIS REST Service
        ↓
MapServer/export
        ↓
PNG/JPEG aerial image
```

The implemented default is `BASE/BASE_NSODB_10k_WM84/MapServer/export`, using a
WGS84 bounding box and output image.

### Step 3 — Upload Ground Photo

Frontend uploads the current tree image to the backend.

For the MVP, the image can remain in memory or temporary storage.

Persistent object storage is not required.

### Step 4 — AI Analysis

Backend sends:

```text
Ground image
+
Aerial image
+
coordinates
+
analysis instructions
```

to the vision model.

Example system instruction:

```text
Analyze the supplied tree imagery for visible indicators that may justify professional inspection.

Do not claim the tree will fall.
Do not provide a definitive medical or arborist diagnosis.

Return observable findings only.
```

### Step 5 — Structured Result

Expected JSON:

```json
{
  "crown": {
    "condition": "poor",
    "visible_loss": true
  },
  "branches": {
    "dead_branches": true,
    "broken_branches": false
  },
  "trunk": {
    "visible_damage": true,
    "cavity": "possible"
  },
  "lean": "possible",
  "fungal_growth": "not_visible",
  "confidence": 0.82,
  "summary": "Significant crown decline and visible trunk damage."
}
```

### Step 6 — Priority Engine

The backend calculates priority.

Example scoring:

```text
dead branches            +2
broken large limb        +3
major crown loss         +2
possible trunk cavity    +3
significant lean         +2
fungal growth at base    +2
```

Example thresholds:

```text
0–2   → LOW
3–5   → MEDIUM
6+    → HIGH
```

This is a hackathon heuristic, not a certified arboriculture risk model.

### Step 7 — Return Results

Backend response:

```json
{
  "location": {
    "latitude": 44.6488,
    "longitude": -63.5752
  },
  "priority": "HIGH",
  "score": 7,
  "findings": [
    "Large dead branches detected",
    "Possible trunk cavity",
    "Crown deterioration detected"
  ],
  "recommendation": "Professional inspection recommended.",
  "disclaimer": "AI-assisted visual screening only."
}
```

## 5. API Design

### POST /api/tree-analysis

Multipart request:

```text
latitude
longitude
groundImage
```

Optional:

```text
streetViewImage
```

Backend responsibilities:

1. Retrieve GeoNOVA image.
2. Retrieve the newest nearby Mapillary image, or Google Street View as fallback.
3. Combine those sources with the required current phone/drone image.
4. Call vision AI.
5. Calculate priority.
6. Return the source dates and result.

### POST /api/area-screen

JSON request:

```json
{
  "south": 44.64,
  "west": -63.59,
  "north": 44.66,
  "east": -63.55
}
```

Backend responsibilities:

1. Validate the bounded scan area.
2. Query the Halifax Public Trees FeatureServer using an envelope intersection.
3. Supplement the inventory with bounded GeoNOVA aerial discovery.
4. Retrieve Mapillary-first ground evidence for up to eight candidates.
5. Query recent Sentinel-1 radar and Sentinel-2 optical catalogue metadata for area-level context.
6. Return ranked visual screening leads with source and freshness metadata.

### GET /api/ground-context

Returns a normalized ground image without exposing provider credentials:

```json
{
  "provider": "MAPILLARY",
  "source": "Mapillary (crowdsourced)",
  "captureDate": "2026-09-10T14:23:00+00:00",
  "imageUrl": "/api/mapillary/image/123456",
  "freshness": "RECENT"
}
```

If no Mapillary image is available, the same shape identifies
`GOOGLE_STREET_VIEW`. `/api/mapillary/image/{image_id}` proxies the selected
thumbnail so `MAPILLARY_ACCESS_TOKEN` never reaches the browser.

### GET /api/geonova/image

Parameters:

```text
latitude
longitude
```

Response:

```json
{
  "imageUrl": "...",
  "captureDate": "...",
  "source": "GeoNOVA"
}
```

This endpoint can also proxy the image if direct browser access creates CORS issues.

### GET /api/health

Returns:

```json
{
  "status": "ok"
}
```

## 6. Optional Persistence Architecture

If there is time:

```text
Backend
   ↓
PostgreSQL + PostGIS
```

PostgreSQL (with the PostGIS extension) runs locally via Docker Compose — see `docker-compose.yml` at the project root, which starts a `postgis/postgis` container on port 5432. Copy `.env.example` to `.env` and run:

```text
docker compose up -d
```

The backend connects using `DATABASE_URL` from the environment.

Suggested schema:

```sql
tree_report
-----------
id
latitude
longitude
geom
created_at
priority
score
ai_confidence
ai_summary
ground_image_url
aerial_image_url
aerial_capture_date
status
```

PostGIS enables future queries such as:

```text
High-risk trees within 100 m of a school
```

or:

```text
Reports within a specific Halifax neighbourhood
```

## 7. GeoNOVA Integration

GeoNOVA should be treated as an external imagery provider.

The application should not copy the entire provincial imagery database.

Expected pattern:

```text
coordinate
    ↓
GeoNOVA map service
    ↓
small exported image
    ↓
AI analysis
```

Implementation should confirm:

- Public service endpoint
- Export-image support
- Coordinate reference system
- Maximum requested image size
- Licensing/usage conditions
- Available imagery date metadata

For the hackathon, the workflow should degrade gracefully if GeoNOVA is unavailable.

## 8. Ground Image Strategy

The current phone image should be considered the strongest current visual evidence.

Recommended photo guidance:

```text
Photo 1: whole tree
Photo 2: trunk/base
Photo 3: crown/branches
```

The first MVP may accept only one image.

Support for multiple images is a useful extension.

## 9. Freshness-Aware Ground Imagery

Mapillary and Google Street View provide opportunistic ground-level context.

Architecture:

```text
coordinates → newest nearby Mapillary image?
                         │ no
                         ▼
                  Google panorama available?
                         │ yes
                         ▼
             normalized provider/date/image response
```

Important:

The provider and capture date must be displayed. Mapillary is queried inside a
75 metre bounding box; tree-facing camera headings are preferred before choosing
the newest capture. Provider thumbnails are proxied through FastAPI so access
tokens remain server-side.

Street View should not be treated as current evidence unless the image is recent enough for the use case.

## 10. Sentinel Radar/Optical Area Context

Sentinel-2 is useful for:

- Broader vegetation stress
- Seasonal vegetation comparison
- Historical canopy changes
- Neighbourhood-level vegetation monitoring

The implemented integration queries the public Copernicus Data Space STAC
catalogue concurrently for recent Sentinel-1 GRD and Sentinel-2 L2A acquisitions,
then displays their acquisition dates and optical cloud cover. It deliberately
does not turn catalogue metadata into a
disturbance claim. A production disturbance signal would compare cloud-screened,
seasonally matched scenes before and after an event.

Sentinel-2 should not be used as the main individual-tree image because its best
spatial resolution is approximately 10 metres per pixel.

## 11. Failure Handling

### GeoNOVA Failure

Continue with ground photo only.

### AI Failure

Return:

```text
Analysis unavailable. Please retry.
```

### No Ground Image

Do not attempt a detailed structural assessment.

The aerial image alone may be used for limited crown analysis.

### Missing Image Date

Label it:

```text
Capture date unavailable
```

## 12. Security

Secrets must remain backend-only.

Environment variables:

```text
OPENAI_API_KEY=
GOOGLE_STREET_VIEW_API_KEY=
MAPILLARY_ACCESS_TOKEN=
```

Do not expose keys directly in frontend JavaScript.

GeoNOVA should not require an application key if the selected map service is public.

## 13. Deployment

For a short hackathon:

Frontend:

- Vercel
- Netlify

Backend:

- Render
- Railway
- Fly.io
- Azure App Service

Database:

- Skip for MVP

or:

- Supabase Postgres
- Neon

## 14. Three-Hour Implementation Priority

### Must Have

```text
Map
↓
Select coordinates
↓
Upload tree image
↓
Vision AI
↓
Inspection priority
↓
Results screen
```

### Should Have

```text
GeoNOVA aerial image
```

### Implemented Context Enhancements

```text
Mapillary-first ground context
Google Street View fallback
Sentinel-2 area acquisition context
Optional current phone/drone confirmation
```

If GeoNOVA integration takes too long, it should not block the demo.

## 15. Future Architecture

A future production version could evolve into:

```text
GeoNOVA historical imagery
+
Satellite imagery
+
Municipal tree inventory
+
Street View / municipal vehicle cameras
+
Citizen photos
+
Weather/storm history
+
LiDAR
        ↓
Multimodal Risk Engine
        ↓
City Tree Monitoring Platform
        ↓
Arborist / 311 workflow
```

The production platform could monitor large areas and recommend field inspections proactively.

## 16. Architecture Principle

The system should answer:

> Which trees deserve human inspection first?

It should **not** attempt to answer:

> Will this tree definitely fall?

That distinction should remain central to the architecture and product messaging.
