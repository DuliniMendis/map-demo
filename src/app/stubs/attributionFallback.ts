// TEMPORARY STUB (WS5): hard-coded copy of the attribution strings in docs/research.md, used only
// while WS3's `public/data/attribution.json` does not exist (or fails to load). Keep in sync with
// research.md; delete the import in ../attributionData.ts once WS3 lands. See ./README.md.
import type { AttributionEntry } from '../attributionData';

export const FALLBACK_ATTRIBUTION: AttributionEntry[] = [
  {
    id: 'austlang',
    short: '© AIATSIS (AUSTLANG)',
    text: 'AUSTLANG © Australian Institute of Aboriginal and Torres Strait Islander Studies (AIATSIS), CC BY 4.0, via TLCMap',
    url: 'https://collection.aiatsis.gov.au/austlang/search',
    licence: 'CC BY 4.0',
  },
  {
    id: 'mapterhorn',
    short: '© Mapterhorn',
    text: '© Mapterhorn',
    url: 'https://mapterhorn.com/attribution',
  },
  {
    id: 'aws-terrain',
    short: 'Terrain Tiles (Mapzen/AWS)',
    text: 'Terrain Tiles: Mapzen/AWS Open Data (SRTM, Geoscience Australia)',
    url: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
  },
  {
    id: 'eox',
    short: 'Sentinel-2 cloudless by EOX',
    text: 'Sentinel-2 cloudless – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)',
    url: 'https://s2maps.eu',
    licence: 'CC BY 4.0',
  },
  {
    id: 'openmaptiles',
    short: '© OpenMapTiles © OpenStreetMap',
    text: '© OpenMapTiles © OpenStreetMap contributors',
    url: 'https://www.openstreetmap.org/copyright',
  },
  {
    id: 'abs',
    short: '© ABS',
    text: 'Suburb/state boundaries © Australian Bureau of Statistics, CC BY 4.0',
    url: 'https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/non-abs-structures/suburbs-and-localities',
    licence: 'CC BY 4.0',
  },
];
