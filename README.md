# Halifax Tree Inspection Priority MVP

An AI-assisted visual screening tool for deciding which Halifax trees may deserve professional inspection first. It reports an **inspection priority**, never a prediction that a tree will fall or a definitive diagnosis.

## Run locally

1. Copy `.env.example` to `.env` and set `OPENAI_API_KEY`. The key is read only by the FastAPI server. To enable optional historical Street View context, also set `GOOGLE_STREET_VIEW_API_KEY` and enable the Google Street View Static API for that key.
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

Open the URL shown by Vite, draw a Halifax scan area, and run the screening.

## Included MVP behavior

- Leaflet/OpenStreetMap map centred on Halifax with coordinate selection.
- Best-effort request to the public GeoNOVA/Nova Scotia Orthophoto ArcGIS service. It never blocks ground-image analysis when unavailable.
- Optional historical Google Street View context after a map selection. Its capture date is shown, and no Google key is sent to the browser.
- Hybrid area screening: draw a rectangle up to about 5 km across, combine authoritative Halifax Public Trees assets with up to four deduplicated GeoNOVA aerial discoveries, and screen at most eight combined candidates using aerial and historical Street View evidence. The UI keeps official inventory trees visually distinct from approximate aerial candidates.
- Server-only OpenAI Responses API vision call with schema-validated results.
- Deterministic LOW / MEDIUM / HIGH inspection-priority heuristic and visible contributing signs.
- Copyable municipal-style report including coordinates, timestamp, imagery source/date, evidence, recommendation, and disclaimer.

The public aerial service may not provide a capture date for every selected point; the UI labels this explicitly as unavailable.
