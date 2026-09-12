# Halifax Tree Risk Detection MVP — Requirements

## 1. Purpose

Build a hackathon MVP that helps identify trees in Halifax that may require professional inspection.

The system must **not** claim that a tree will fall or provide a definitive arborist diagnosis. Its purpose is to detect visible warning signs and assign an **inspection priority**.

## 2. Problem Statement

Municipalities often depend on citizens or field staff to notice potentially hazardous trees. A tree may show visible deterioration in its crown, trunk, branches, bark, or base before it becomes an urgent safety issue.

The proposed solution combines:

- High-resolution aerial imagery from GeoNOVA / Nova Scotia Orthophotos
- A current ground-level tree photo captured or uploaded by a user
- AI vision analysis
- Geographic location
- A simple inspection-priority model

The output is intended to help prioritize which trees should be reviewed by a qualified arborist or municipal inspector.

## 3. MVP Scope

The MVP should allow a user to:

1. Open a map centered on Halifax.
2. Select or click a tree/location on the map.
3. Capture the latitude and longitude.
4. Retrieve aerial imagery for the selected area from GeoNOVA, where possible.
5. Upload or capture a current ground-level photo of the tree.
6. Send the available images to an AI vision model.
7. Detect visible warning signs.
8. Generate an inspection-priority result:
   - Low
   - Medium
   - High
9. Display the findings to the user.
10. Generate a simple municipal-style report with location, evidence, and recommendation.

## 4. Out of Scope for the MVP

The MVP does not need to:

- Predict with certainty whether a tree will fall.
- Replace a certified arborist.
- Detect internal trunk or root decay that is not externally visible.
- Automatically submit cases to Halifax 311.
- Maintain a complete municipal tree inventory.
- Analyze all trees in Halifax automatically.
- Train a custom machine-learning model.
- Use Sentinel-2 imagery as a required source.
- Require Google Street View.

These may be considered future enhancements.

## 5. Functional Requirements

### FR-01 — Map Display

The application shall display an interactive map of Halifax.

Recommended implementation:

- Leaflet or MapLibre
- OpenStreetMap as the base map

### FR-02 — Location Selection

The user shall be able to click a location on the map.

The application shall capture:

- Latitude
- Longitude

### FR-03 — GeoNOVA Aerial Imagery

The backend shall attempt to retrieve an aerial image around the selected coordinates using a public GeoNOVA / Nova Scotia Orthophoto map service.

The application shall store or display available imagery metadata when possible, including:

- Image source
- Capture year/date if available
- Bounding box or selected coordinates

If GeoNOVA imagery cannot be retrieved, the application shall continue using the ground-level image.

### FR-04 — Ground-Level Photo

The user shall be able to:

- Upload an existing tree image, or
- Capture a tree image using a supported device camera

The image should ideally include the trunk, crown, branches, or base.

### FR-05 — AI Image Analysis

The system shall submit available images to a vision-capable AI model.

The model shall look for visible indicators including:

- Dead or missing branches
- Sparse or deteriorated crown
- Broken limbs
- Visible trunk cavities
- Bark damage
- Possible fungal growth
- Excessive leaning
- Visible root or base damage
- Major asymmetry or crown loss
- Other obvious structural or health anomalies

### FR-06 — Structured AI Response

The AI response should be returned in structured JSON.

Example:

```json
{
  "crown_condition": "poor",
  "dead_branches": true,
  "trunk_damage": false,
  "leaning": "possible",
  "fungal_growth": "not_visible",
  "confidence": 0.81,
  "summary": "Visible crown decline and multiple dead branches detected."
}
```

### FR-07 — Inspection Priority

The application shall calculate an inspection priority using AI findings and available context.

Allowed values:

- LOW
- MEDIUM
- HIGH

Example logic:

- LOW: no major visible issues
- MEDIUM: one or more warning signs
- HIGH: multiple significant warning signs or severe visible damage

The application must describe the result as an **inspection priority**, not as a probability that the tree will fall.

### FR-08 — Results Display

The application shall display:

- Selected location
- Ground image
- Aerial image if available
- Detected warning signs
- AI confidence
- Inspection priority
- Recommendation

Example recommendation:

> Potential visible hazards detected. Professional arborist inspection recommended.

### FR-09 — Report Generation

The user shall be able to view or copy a simple report containing:

- Coordinates
- Date/time of submission
- Aerial imagery source
- Ground image
- Detected issues
- Priority
- AI summary
- Disclaimer

### FR-10 — Disclaimer

The application shall clearly state:

> This tool provides an AI-assisted visual screening only. It does not replace an assessment by a qualified arborist or municipal inspector.

## 6. Optional MVP Requirements

If time remains, the team may add:

### FR-11 — Google Street View

Retrieve historical street-level imagery near the selected coordinates.

This source should be marked with its capture date because it may not represent current tree conditions.

### FR-12 — Save Reports

Store analyzed trees in PostgreSQL.

Suggested fields:

```text
id
latitude
longitude
created_at
inspection_priority
ai_summary
ai_confidence
ground_image_url
aerial_image_url
aerial_capture_date
streetview_capture_date
status
```

### FR-13 — Map Markers

Display analyzed trees on the map with markers based on inspection priority.

### FR-14 — Nearby Risk Context

Calculate whether the tree is close to:

- Roads
- Sidewalks
- Buildings
- Parks
- Playgrounds

This can help prioritize trees that could affect people or infrastructure.

## 7. Non-Functional Requirements

### NFR-01 — Speed

For the hackathon demo, a single analysis should ideally complete within approximately 30 seconds.

### NFR-02 — Resilience

Failure of one optional image source shall not prevent the full workflow.

Example:

If GeoNOVA fails, the system should still analyze the uploaded ground photo.

### NFR-03 — Simplicity

The MVP should avoid unnecessary infrastructure.

A database is optional.

The backend shall be implemented in **FastAPI (Python)**, per the decision in `ARCHITECTURE.md`, for fastest integration with image handling and vision-model AI calls within the hackathon timeframe.

### NFR-04 — Security

API keys shall remain server-side and shall not be embedded in frontend code.

### NFR-05 — Explainability

The application should show the visual warning signs that contributed to the priority result.

### NFR-06 — Responsible Output

The system must avoid statements such as:

- "This tree will fall."
- "This tree is safe."
- "This tree is definitely diseased."

Preferred wording:

- "Potential warning signs detected."
- "Inspection recommended."
- "No major visible warning signs detected in the submitted imagery."

## 8. Suggested User Flow

```text
Open application
    ↓
View Halifax map
    ↓
Click/select tree location
    ↓
Capture coordinates
    ↓
Retrieve GeoNOVA aerial context
    ↓
Upload/take current tree photo
    ↓
Run AI vision analysis
    ↓
Combine findings
    ↓
Generate inspection priority
    ↓
Show report
```

## 9. Demo Scenario

A user selects a tree near a Halifax sidewalk.

The system retrieves aerial imagery showing the crown and receives a current phone image showing the trunk and branches.

AI detects:

- Significant crown thinning
- Two large dead branches
- Possible trunk cavity

Result:

```text
Inspection Priority: HIGH

Reason:
Multiple visible warning signs detected, including dead branches and possible trunk damage.

Recommendation:
Professional arborist or municipal inspection recommended.
```

## 10. Success Criteria

The MVP is successful if the team can demonstrate:

1. A user selecting a Halifax location.
2. At least one real imagery source.
3. Upload or capture of a tree photo.
4. AI analysis of the tree.
5. Structured warning-sign detection.
6. A LOW / MEDIUM / HIGH inspection-priority result.
7. A clear recommendation and disclaimer.
