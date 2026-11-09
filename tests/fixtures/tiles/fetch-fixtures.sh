#!/usr/bin/env bash
# Re-downloads the committed tile fixtures (tests/fixtures/tiles/*). Run this rarely and by hand,
# never in CI: the hosts are free community services with no SLA (see docs/qa.md, "Rate-limit etiquette").
# It fetches ~45 tiles covering Australia at the overview zooms, sequentially, with a pause between
# requests and an identifying User-Agent. Everything else the map asks for during tests is served from
# the generated fallback tiles (tests/fixtures/tiles/fallback/, see make-fallbacks.ts).
#
# Usage: bash tests/fixtures/tiles/fetch-fixtures.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UA="country-map-fixtures/1.0 (one-off test fixture download; github.com/DuliniMendis/map-demo)"
PAUSE=0.5

fetch() { # fetch <url> <dest>
  local url="$1" dest="$2"
  if [[ -s "$dest" ]]; then echo "have  ${dest#"$DIR"/}"; return; fi
  mkdir -p "$(dirname "$dest")"
  echo "get   $url"
  # Ocean-only tiles 404 on some hosts (e.g. Mapterhorn); the fallback tile covers them in tests.
  local code
  code="$(curl --silent --show-error --location --user-agent "$UA" --output "$dest" \
    --write-out '%{http_code}' "$url")"
  if [[ $code != 200 ]]; then echo "      HTTP $code, not kept"; rm -f "$dest"; fi
  sleep "$PAUSE"
}

# Australia (AUSTRALIA_BOUNDS [[112.5,-44.5],[154.5,-9.5]]) tile ranges, z/x/y in XYZ scheme:
#   z3: x 6-7,   y 4-5
#   z4: x 13-14, y 8-10
#   z5: x 26-29, y 16-20

# Mapterhorn terrarium WebP, 512 px (primary DEM): z3 + z4
for z_x_y in 3/6/4 3/6/5 3/7/4 3/7/5 \
  4/13/8 4/13/9 4/13/10 4/14/8 4/14/9 4/14/10; do
  fetch "https://tiles.mapterhorn.com/${z_x_y}.webp" "$DIR/mapterhorn/${z_x_y}.webp"
done

# AWS Terrain Tiles terrarium PNG, 256 px (fallback DEM): z3 only (the fallback test needs few tiles)
for z_x_y in 3/6/4 3/6/5 3/7/4 3/7/5; do
  fetch "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z_x_y}.png" "$DIR/aws/${z_x_y}.png"
done

# EOX Sentinel-2 cloudless 2024, 256 px JPEG. Upstream URL order is {z}/{y}/{x}; stored as z/x/y.
for z in 4 5; do
  if [[ $z == 4 ]]; then xs="13 14"; ys="8 9 10"; else xs="26 27 28 29"; ys="16 17 18 19 20"; fi
  for x in $xs; do for y in $ys; do
    fetch "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/${z}/${y}/${x}.jpg" \
      "$DIR/eox/${z}/${x}/${y}.jpg"
  done; done
done

# OpenFreeMap (OpenMapTiles schema): TileJSON, z3 vector tiles, one glyph range.
fetch "https://tiles.openfreemap.org/planet" "$DIR/openfreemap/planet.tilejson"
TILES_URL="$(node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(j.tiles[0])' "$DIR/openfreemap/planet.tilejson")"
for z_x_y in 3/6/4 3/6/5 3/7/4 3/7/5; do
  IFS=/ read -r z x y <<<"$z_x_y"
  url="${TILES_URL/\{z\}/$z}"; url="${url/\{x\}/$x}"; url="${url/\{y\}/$y}"
  fetch "$url" "$DIR/openfreemap/planet/${z_x_y}.pbf"
done
fetch "https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf" \
  "$DIR/openfreemap/fonts/Noto Sans Regular/0-255.pbf"

echo
du -sh "$DIR"
