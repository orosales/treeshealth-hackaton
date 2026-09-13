# Halifax Tree Inspection Priority MVP

An AI-assisted visual screening tool for deciding which Halifax trees may deserve professional inspection first. It reports an **inspection priority**, never a prediction that a tree will fall or a definitive diagnosis.

## Run locally

1. Copy `.env.example` to `.env` and set `OPENAI_API_KEY`. The key is read only by the FastAPI server. Set `MAPILLARY_ACCESS_TOKEN` to prefer the newest nearby Mapillary image. Set `GOOGLE_STREET_VIEW_API_KEY` and enable the Google Street View Static API to use Google as the automatic fallback.
2. In one terminal, start the API:

   ```bash
   cd backend
   python -m venv .venv
   . .venv/bin/activate
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 8000
   ```

3. In another terminal, start the web client:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

Open the URL shown by Vite, search for a Halifax place or use the closer central
Halifax map, then drag a scan rectangle. Tapping two opposite corners remains
available as a fallback.

## Included MVP behavior

- Leaflet/OpenStreetMap map centred on Halifax with coordinate selection.
- Map-first mobile layout, Halifax address/neighbourhood search, optional browser-location focus, drag-to-draw rectangles, live area dimensions, and reset controls.
- Best-effort request to the public GeoNOVA/Nova Scotia Orthophoto ArcGIS service. It never blocks ground-image analysis when unavailable.
- Freshness-aware ground context: newest nearby Mapillary imagery when configured, with historical Google Street View as the automatic fallback. Provider keys remain on the server.
- Hybrid area screening: draw a rectangle up to about 5 km across, combine authoritative Halifax Public Trees assets with up to four deduplicated GeoNOVA aerial discoveries, and screen at most eight combined candidates using aerial and available ground evidence. The UI keeps official inventory trees visually distinct from approximate aerial candidates.
- Recent Sentinel-1 radar and Sentinel-2 optical acquisition metadata shown only as area-level coverage context, including optical cloud cover when published. No disturbance claim is made from metadata alone.
- Optional phone/drone upload inside the selected-tree detail for current post-storm confirmation.
- Server-only OpenAI Responses API vision call with schema-validated results.
- Deterministic LOW / MEDIUM / HIGH inspection-priority heuristic and visible contributing signs.
- Copyable municipal-style report including coordinates, timestamp, imagery source/date, evidence, recommendation, and disclaimer.

The public aerial service may not provide a capture date for every selected point; the UI labels this explicitly as unavailable.
