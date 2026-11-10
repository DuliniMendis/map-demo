# Guided tour — stops and narration (WS9)

**Status: DRAFT. Every narration below needs the owner's review before release.**

The tour (`Tour` button, top-left of the map) visits 12 nations in a loop around the continent: it flies to
each one, waits until the camera has landed, lingers about 8 s, and moves on. Code:
[`src/app/tour/`](../src/app/tour) (`stops.ts` is the stop list and narration builder, `machine.ts` the state
machine, `driver.ts` runs it against the store, `Tour.tsx` the button and panel).

## Narration rules (binding, PLAN.md §8)

Each narration is assembled at runtime from three parts:

1. **From `nations.json` only:** `{name} language group ({peopleName}).` (the AUSTLANG name and people name).
2. **From `nations.json` only:** `Country today: {locality}, {state}.` (the ABS locality and state, as on the
   info card).
3. **One neutral landscape sentence** written for the tour (`landscape` in `stops.ts`): physical geography only
   (landform, vegetation, water). No cultural claims, history, stories, or words from the language. "Nation",
   "people", "language group", "Country"; never "tribe".

Parts 1 and 2 cannot drift from the data. Part 3 is the only hand-written text, so it is what needs review.
A unit test (`src/app/tour/tour.test.ts`) fails if a narration below no longer matches the code.

### For the owner to decide

- **Wording of every landscape sentence** (below). They describe the country around the AUSTLANG point, which
  is approximate; please check each against what the camera actually shows.
- **Modern geographic names in landscape sentences:** Cape York, Torres Strait, Gulf of Carpentaria, Murray
  River, Tasmania, Blue Mountains. These are today's map names, not facts from our data. Keep them, or replace
  them with purely descriptive wording?
- **Torres Strait:** the brief asks for an island stop in the Torres Strait, but the dataset has no Torres
  Strait Island languages (no Kalaw Lagaw Ya or Meriam Mir entry among the 455 with coordinates). The nearest
  is Djagaraga (`Y6`) at Somerset on the tip of Cape York, facing the Strait; Yanyuwa (`N153`, Pellew Islands)
  is the island stop. Worth raising with WS3 / the data owner.
- **People names** are shown exactly as in `nations.json` (`thesaurus_heading_people`), including "Palawa
  people" for South-western Tasmanian and the doubled "Djagaraga language group (Djagaraga people)" pattern.
- **Order and choice of stops:** north → west → south → east, chosen for state coverage, landscape variety and
  existing camera overrides (`data/overrides.json`). The ACT is not included (the brief asks for every state
  and the NT).

## The 12 stops (drafts)

### 1. Djagaraga (`Y6`) — Somerset (Qld), QLD

> Djagaraga language group (Djagaraga people). Country today: Somerset (Qld), Queensland. The northern tip of Cape York: low open woodland, mangroves and beaches facing the islands of the Torres Strait.

- Landscape sentence (draft): "The northern tip of Cape York: low open woodland, mangroves and beaches facing the islands of the Torres Strait."
- Camera: override `{"bearing":180}`; point 142.520, −10.816.

### 2. Djabugay / Tjapukai (`Y106`) — Mona Mona, QLD

> Djabugay / Tjapukai language group (Djabugay / Tjapukai people). Country today: Mona Mona, Queensland. Rainforest-covered ranges on a tableland above the coastal plain, cut by river valleys.

- Landscape sentence (draft): "Rainforest-covered ranges on a tableland above the coastal plain, cut by river valleys."
- Camera: default view; point 145.508, −16.737.

### 3. Yanyuwa (`N153`) — Pellew Islands, NT

> Yanyuwa language group (Yanyuwa people). Country today: Pellew Islands, Northern Territory. Low islands, mangrove shores and river mouths on the southern edge of the Gulf of Carpentaria.

- Landscape sentence (draft): "Low islands, mangrove shores and river mouths on the southern edge of the Gulf of Carpentaria."
- Camera: override `{"zoom":9.5,"bearing":180}`; point 136.808, −15.802.

### 4. Bugurnidja (`N42.1`) — Kakadu, NT

> Bugurnidja language group (Bugurnidja people). Country today: Kakadu, Northern Territory. Wide seasonal floodplains and wetlands below a sandstone escarpment.

- Landscape sentence (draft): "Wide seasonal floodplains and wetlands below a sandstone escarpment."
- Camera: default view; point 132.702, −12.766.

### 5. Yawuru (`K1`) — Roebuck, WA

> Yawuru language group (Yawuru people). Country today: Roebuck, Western Australia. A coast of red sandy cliffs, white beaches and broad tidal flats around a large bay.

- Landscape sentence (draft): "A coast of red sandy cliffs, white beaches and broad tidal flats around a large bay."
- Camera: override `{"zoom":9.5,"bearing":90}`; point 122.625, −17.944.

### 6. Ngaatjatjarra (`A43`) — Ngaanyatjarra-Giles, WA

> Ngaatjatjarra language group (Ngaatjatjarra people). Country today: Ngaanyatjarra-Giles, Western Australia. Desert country of red sand plains and dunes, broken by rocky ranges.

- Landscape sentence (draft): "Desert country of red sand plains and dunes, broken by rocky ranges."
- Camera: override `{"zoom":9.5}`; point 128.542, −25.081.

### 7. Mirning (`A9`) — Forrest (WA), WA

> Mirning language group (Mirning people). Country today: Forrest (WA), Western Australia. A flat, almost treeless limestone plain that runs to the horizon.

- Landscape sentence (draft): "A flat, almost treeless limestone plain that runs to the horizon."
- Camera: override `{"zoom":9.5,"pitch":55}`; point 128.153, −31.293.

### 8. Tanganekald (`S11`) — Coorong, SA

> Tanganekald language group (Tanganekald people). Country today: Coorong, South Australia. A long, narrow coastal lagoon behind high sand dunes, near where the Murray River reaches the sea.

- Landscape sentence (draft): "A long, narrow coastal lagoon behind high sand dunes, near where the Murray River reaches the sea."
- Camera: default view; point 139.569, −36.089.

### 9. Dhudhuroa (`S44`) — Nariel Valley, VIC

> Dhudhuroa language group (Dhudhuroa people). Country today: Nariel Valley, Victoria. Steep forested valleys in the high country, with alpine ranges above them.

- Landscape sentence (draft): "Steep forested valleys in the high country, with alpine ranges above them."
- Camera: override `{"zoom":11,"pitch":70}`; point 147.693, −36.364.

### 10. South-western Tasmanian (`T10`) — Southwest, TAS

> South-western Tasmanian language group (Palawa people). Country today: Southwest, Tasmania. Rugged mountains, wet forest and wild rivers in the far south-west of Tasmania.

- Landscape sentence (draft): "Rugged mountains, wet forest and wild rivers in the far south-west of Tasmania."
- Camera: override `{"zoom":11,"pitch":70,"bearing":0}`; point 146.071, −43.400.

### 11. Wiradjuri (`D10`) — Wyalong, NSW

> Wiradjuri language group (Wiradjuri people). Country today: Wyalong, New South Wales. Broad inland plains and low hills, drained by long, slow inland rivers.

- Landscape sentence (draft): "Broad inland plains and low hills, drained by long, slow inland rivers."
- Camera: override `{"zoom":9.5}`; point 147.257, −33.909.

### 12. Dharug / Darug (`S64`) — Jenolan, NSW

> Dharug / Darug language group (Dharug / Darug people). Country today: Jenolan, New South Wales. Forested ridges and deep, steep-sided valleys in the Blue Mountains.

- Landscape sentence (draft): "Forested ridges and deep, steep-sided valleys in the Blue Mountains."
- Camera: override `{"zoom":11,"pitch":70}`; point 150.048, −33.890.

## Coverage

| | Stops |
|---|---|
| States / territory | QLD (Y6, Y106), NT (N153, N42.1), WA (K1, A43, A9), SA (S11), VIC (S44), TAS (T10), NSW (D10, S64) |
| Desert | A43 (sand plains, dunes, ranges), A9 (limestone plain) |
| Rainforest | Y106 |
| Coast | Y6, K1, S11 |
| Islands | N153 (Gulf islands); Y6 faces the Torres Strait islands |
| Alpine / high country | S44, T10 |
| Rivers / wetlands | N42.1 (floodplains), S11 (Murray mouth), D10 (inland rivers) |

## Behaviour

- **Tour** starts at stop 1 and plays. At each stop: select the nation → the camera flies (WS2's
  choreography) → once `cameraState` is `idle` the info card shows and the tour waits 8 s → next stop. Stop 12
  ends the tour, paused at the last stop ("end of tour"); **Replay** starts over.
- **Prev / Next** jump between stops (playing or paused stays as it was). **Pause / Play** toggles
  auto-advance. **End tour** turns it off, clears the selection and flies back to the overview.
- Anything that takes over pauses it: choosing another nation (list, search or marker), dragging,
  wheel-zooming or keyboard-panning the map, the zoom/compass buttons, Esc, or opening About. Esc inside the
  tour panel only pauses (the info card stays); elsewhere it also closes the card as before.
- **Reduced motion:** the tour starts paused and never auto-advances; Prev / Next still work and use the
  reduced-motion jump.
- The panel sits top-left under the About / Tour buttons, so it never covers the info card (bottom-left on
  wide screens, above the bottom sheet on narrow ones) or the selected marker (map centre: the panel is capped
  at half the map height). It covers the first-visit disclaimer banner while the tour runs, so it repeats
  "Approximate locations from AUSTLANG."
- The stop count, name and narration are one `aria-live="polite"` region, so a screen reader reads each new
  stop. The tour is not in the URL.
