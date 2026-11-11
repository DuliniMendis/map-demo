# Place search and "Whose Country?"

Code: `src/places/` (`PlaceFinder.tsx`, `photon.ts`, `nativeLand.ts`, `territoryLayer.ts`, `places.css`).

## What it does

- **Find a suburb or address** (box over the map, top left). Suggestions appear after 3 characters
  (350 ms debounce). Picking one flies there: the suburb's outline when OpenStreetMap has one (max
  zoom 15), otherwise zoom 16 on the point. A black-and-yellow pin marks it until the search is cleared.
- **Whose Country?** panel under the search box. It lists the Native Land Digital territories at
  the searched place, and draws them on the map (coloured fill, outline and name, below the nation
  pins). When you pan or zoom yourself at zoom ≥ 9, it follows the **map centre**, which a crosshair
  marks. Below zoom 9 the panel and shapes go away.

## Data sources and why

| | Source | Terms that shape the code |
|---|---|---|
| Search | [Photon](https://photon.komoot.io) (komoot), OpenStreetMap data, ODbL | Free and keyless, but "please be fair - extensive usage will be throttled". So searches are debounced, need 3 or more characters, and abort superseded requests. Results are limited to Australia's bounding box, with no location bias: biasing ranked nearby streets above whole suburbs. |
| Territories | [Native Land Digital](https://native-land.ca) API, `maps=territories&position=lat,lng` | Needs an API key. Data Sovereignty Treaty: non-commercial only, attribute, show a disclaimer, **do not store or redistribute**. So results are fetched at runtime and kept only in an in-memory cache (40 positions, rounded to about 1 km) for the open page. |

This reverses two v1 decisions in `PLAN.md` (no polygons, no runtime geocoding). The project owner
chose this on 2026-11-10 over two alternatives: showing the nearest AUSTLANG points, or official
datasets where they exist (Victorian RAPs, native title determinations).

**Privacy:** whatever is typed in the search box goes to photon.komoot.io. Map-centre and
searched-place coordinates, rounded to 2 decimals, go to native-land.ca along with the site's key.

**Accuracy:** Native Land shapes are community-sourced, often overlap, and are not official or legal
boundaries. The panel always says so and points to Traditional Owners and Land Councils as the
authority. OpenStreetMap's house-number coverage in Australia is patchy, so an exact street
address may come back as nearby places on the same street.

## Setting up the Native Land key

1. Sign up at https://native-land.ca, open the API tab and accept the agreement.
2. Put the key in `.env.local`, which is git-ignored (see `.env.example`):
   `VITE_NATIVE_LAND_KEY=…`, then restart `pnpm dev`. For a deploy, set the same variable in the
   host's environment (Vercel: Project → Settings → Environment Variables).

Vite inlines `VITE_*` variables into the shipped JavaScript, so **the key is public** to anyone who
opens the site. Native Land's docs show client-side use but don't address exposed keys. If that
matters, put a small proxy in front of the API instead.

Without a key, search still works. After a search the panel says the overlay isn't set up, and it
stays quiet while you browse.

## Tests

- `src/places/places.test.ts`: URL building, response parsing (including unsafe colours and links),
  caching, API errors, attribution.
- `src/places/PlaceFinder.test.ts`: search → Enter → panel, with and without a key (fetch stubbed).
- Playwright blocks all unlisted external hosts, so no e2e test reaches Photon or Native Land.
