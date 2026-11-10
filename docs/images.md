# Info card illustrations

Each nation's info card can show one illustration. On screens 900 px and wider the card widens to two
columns, picture on the left and facts on the right. On narrow screens the picture sits above the facts. Cards
without a picture keep the single-column layout.

## Generating them

`scripts/nation-images.ts` drafts a prompt for every nation and generates pictures through
[Vercel AI Gateway](https://vercel.com/docs/ai-gateway).

1. **Draft prompts:** `pnpm images:draft` writes `data/image-prompts.json`, with a prompt and alt text per
   nation. Each prompt comes from a rough landscape region for the point (tropical savanna, desert, south-west
   forest and so on, see `regionOf` in `scripts/lib/nation-images.ts`) and the kind of nearby landmark
   (river, lake, peak, range). Prompts never use the place or landmark name. Edit any entry by hand: later
   `draft` runs keep existing entries unless you pass `--force`. Use `--style flat` for flat 2D
   illustrations instead of pencil.
2. **Check the cost (free):** `pnpm images:generate --model <provider/model>` prints how many pictures it
   would make and the estimated cost from AI Gateway's live price list, then stops. Image models and prices
   are listed at <https://ai-gateway.vercel.sh/v1/models> (`type: "image"`).
3. **Try a few first:** add an AI Gateway API key to your shell as `AI_GATEWAY_API_KEY` (create one in the
   Vercel dashboard under AI Gateway → API keys), then run
   `pnpm images:generate --model <provider/model> --limit 5 --yes`. Look at the pictures in
   `public/images/nations/` before running the rest.
4. **Generate the rest:** run the same command without `--limit`. It skips nations that already have a
   picture, saves each one as it goes, and an interrupted run picks up where it stopped. `--ids N92,A43`
   targets particular nations. `--redo` replaces existing pictures.
5. **Review every picture** against the rules below, delete any that fail (the file and its
   `data/images.json` entry), and regenerate them with `--ids`.
6. Run `node scripts/build-nations.ts && pnpm data:validate`, then commit the pictures,
   `data/images.json` and `public/data/nations.json`.

Pictures are saved as 960 × 960 WebP (about 60 to 120 KB each). The card crops a tall slice on desktop and a
wide band on phones, so square sources suit both.

## Adding one by hand

Save the picture as `public/images/nations/<AUSTLANG id>.webp` (square, about 960 px) and add an entry to
`data/images.json`:

```json
"N92": {
  "alt": "Pencil sketch of tropical savanna with a river winding across it.",
  "credit": "Pencil illustration by <artist>, used with permission"
}
```

The build fails if an entry has no picture, no `alt` or `credit`, or an unknown id.

## What the pictures show

The card has no written story for each nation; it lists today's locality, the nearest town and landmark
(OpenStreetMap) and alternative names. Pictures should illustrate those facts: the landscape of Country
around the point, such as the named river, range, peak or lake, and the vegetation and terrain of the region.

Keep to the guardrails in `PLAN.md` §8 and the Indigenous Cultural and Intellectual Property (ICIP)
principles:

- Landscape only. No people, ceremonies, sacred sites, rock art, artefacts or likenesses of community members.
  Generated pictures show a generic landscape for the region, never a named place.
- No imitation of Aboriginal or Torres Strait Islander art styles (dot painting, cross-hatching/rarrk, x-ray
  style and so on). Pencil, ink or plain flat illustration in a neutral style is fine.
- Say in the credit that the picture is an illustration, and if it is AI-generated (the script does this).
- Prompts describe only what the picture should show. Image models tend to draw anything a prompt names, even
  after "no", so don't add the styles to avoid to a prompt. Catch them in review instead.
- Pictures commissioned from, or approved by, the community concerned replace generated ones whenever they are
  offered.
