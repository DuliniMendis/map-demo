# WS4 — Side panel & info card UI

**Goal:** a calm, fast side panel: search, filter by state, a long list of nations you can scan and navigate by
keyboard, and an info card that explains where you are now (nation names, synonyms, "Country today: locality,
state", links, disclaimer).

**Owns:** `src/ui/**`. Reference: `docs/contracts.md` (component props, store, `data-testid`s), `PLAN.md §8` (wording).
Develop against `src/data/mock-nations.json` through the store; the map can be a grey box in your dev page.

## Deliverables

1. `SidePanel.tsx` (container): header "Nations & language groups", `SearchBox`, `NationList`, footer count "455 language groups · AUSTLANG © AIATSIS". Collapsible on narrow screens (< 900 px → bottom sheet with drag handle).
2. `SearchBox.tsx`: debounced 120 ms; matches name, synonyms, locality, state; diacritic-insensitive (`ŋ`, macrons) via `String.normalize('NFD')`; `Esc` clears; state filter `<select>` ALL/NSW/VIC/QLD/SA/WA/TAS/NT/ACT/OT.
3. `NationList.tsx`: virtualised (`@tanstack/react-virtual`) when > 100 items; each row: name, small grey "locality, STATE"; selected row highlighted and `scrollIntoView` when selection changes from the map; `aria-selected`; roving tabindex with ↑/↓/Home/End/Enter; type-ahead by first letter.
4. `InfoCard.tsx`: floats over the map bottom-left (desktop) / above the sheet (mobile). Shows: `peopleName || name`, language name, synonyms as chips (max 8, "+n more"), **Country today** → `{locality}, {state}` with a one-line explainer "Suburb/locality boundary from ABS 2021", links (AUSTLANG page, Wikipedia if present), inline `Disclaimer`, close button; "Back to overview" button.
5. `Disclaimer.tsx`: banner variant (first visit, dismiss stored in `localStorage`, try/catch) and inline variant (one sentence: "Locations are approximate single points from AUSTLANG and do not represent boundaries or native title.").
6. `ui.css` with CSS variables (`--bg`, `--fg`, `--accent` ochre `#c2641f`, `--muted`), dark-first palette that sits well next to satellite imagery, light mode via `prefers-color-scheme`. Fonts: system stack. Hit targets ≥ 40 px.
7. `filterNations` selector in `src/ui/filter.ts` (pure) with vitest tests: diacritics, synonyms, state filter, empty query.

## Quality bar
- Lighthouse accessibility ≥ 95 on the panel; axe clean; full keyboard operation; visible focus rings.
- 455 rows scroll at 60 FPS; search feels instant.

## Done when
- Dev page renders the panel with mock data, selection round-trips through the store (select in list → store → card updates; store change from "map" simulation → list scrolls/highlights).
- All `data-testid`s from contracts present. Screenshots (desktop + 390 px mobile) in the PR.

## Don't
- Don't import MapLibre. Don't use the word "tribe" anywhere in the UI. Don't add a component library.
