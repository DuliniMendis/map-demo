// TEMPORARY STUB (WS5): hard-coded copy of the attribution strings in docs/research.md, shaped like
// WS3's attribution.json `items` (usedFor/kind values are WS5's guesses), used only
// while WS3's `public/data/attribution.json` does not exist (or fails to load). Keep in sync with
// research.md; delete the import in ../attributionData.ts once WS3 lands. See ./README.md.
import type { AttributionEntry } from '../attributionData';

export const FALLBACK_ATTRIBUTION: AttributionEntry[] = [
  {
    id: 'austlang',
    usedFor: 'Language locations',
    kind: 'data',
    text: 'AUSTLANG © Australian Institute of Aboriginal and Torres Strait Islander Studies (AIATSIS), CC BY 4.0, via TLCMap',
    url: 'https://collection.aiatsis.gov.au/austlang/search',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
  },
  {
    id: 'mapterhorn',
    usedFor: 'Terrain elevation',
    kind: 'terrain',
    text: '© Mapterhorn',
    url: 'https://mapterhorn.com/attribution',
  },
  {
    id: 'aws-terrain',
    usedFor: 'Backup terrain elevation',
    kind: 'terrain',
    text: 'Terrain Tiles: Mapzen/AWS Open Data (SRTM, Geoscience Australia)',
    url: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
  },
  {
    id: 'eox',
    usedFor: 'Satellite imagery',
    kind: 'imagery',
    text: 'Sentinel-2 cloudless – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)',
    url: 'https://s2maps.eu',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
  },
  {
    id: 'openmaptiles',
    usedFor: 'Place labels',
    kind: 'labels',
    text: '© OpenMapTiles © OpenStreetMap contributors',
    url: 'https://www.openstreetmap.org/copyright',
  },
  {
    id: 'abs',
    usedFor: 'Country today (suburb/locality and state)',
    kind: 'data',
    text: 'Suburb/state boundaries © Australian Bureau of Statistics, CC BY 4.0',
    url: 'https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/non-abs-structures/suburbs-and-localities',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
  },
];
