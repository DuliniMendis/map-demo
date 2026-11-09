# Terrain spike (throwaway)

Proves the core rendering stack with zero build tooling: MapLibre GL JS 6.17 (ESM, loaded from unpkg),
Sentinel‑2 cloudless imagery (EOX) draped over Terrarium‑encoded terrain (AWS Terrain Tiles), hillshade,
sky/fog, and a `flyTo` with pitch to a marker.

Run it (no Node needed):

```bash
python3 -m http.server 8765 --directory spikes/terrain-spike
```

Then open http://127.0.0.1:8765/ and click a button, or call `__go('uluru')` in the console.

Screenshots from the spike are in `docs/spike/`. Findings are folded into `docs/research.md`.
To try Mapterhorn terrain instead, swap the `dem` source for
`tiles: ['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'], tileSize: 512, maxzoom: 17`.
