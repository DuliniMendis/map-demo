# Phase 3 — optional extras (pick after M5)

**Picked 2026-11-10:** 2 → [WS8](WS8-nearby.md), 4 (contours + time-of-day light) → [WS7](WS7-landscape-detail.md),
5 + 8 → [WS9](WS9-globe-tour.md). Not picked: 1 (needs the owner's Native Land API key and terms), 3 (needs a hosting
and bandwidth decision), 6 (needs permission from language centres), 7.

Each is independent and can be its own worker.

1. **Native Land Digital overlay (runtime only).** Settings field for the user's own API key; fetch
   `https://native-land.ca/api/index.php?maps=territories&position=lat,lng&key=…` on selection and draw the returned
   polygons as a translucent fill for that view only. Never cache to disk, never bundle, show their disclaimer and
   credit. Non-commercial use only. Toggle default off.
2. **Nearest town / landmark.** Build-time: from OpenStreetMap (Overpass or OpenFreeMap tiles) take the nearest `place=town|city`
   within 100 km and the nearest named peak/river; show "near Alice Springs" under the locality.
3. **Self-hosted Australia terrain.** Generate PMTiles from GA 1 s DEM‑S (CC BY 4.0) or download Mapterhorn's
   Australia PMTiles subsets and serve from the same static host via `pmtiles` protocol; removes third-party SLA risk.
4. **Landscape detail pack.** Contour lines (from DEM via `gdal_contour` → PMTiles) at z ≥ 11; hillshade illumination
   following local time of day; slope/aspect tint; optional vegetation (Sentinel‑2 NDVI) layer.
5. **Guided tour.** Auto-play through a curated sequence of 12 nations with narration text; pause/resume.
6. **Language audio & words.** Only with explicit permission from language centres; Gambay data licence is unknown, link only.
7. **Offline/PWA.** Service worker caching tiles for the last 5 visited regions (respect host terms; EOX/Mapterhorn allow caching for display).
8. **Globe view.** MapLibre `projection: 'globe'` for the zoomed-out state, switching to mercator below z 4.
