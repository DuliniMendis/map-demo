/**
 * public/data/attribution.json — consumed by WS5's footer and About panel.
 * `text` values are copied exactly from docs/research.md ("Attribution strings (copy exactly)").
 */
export interface AttributionItem {
  id: string;
  /** Exact credit line to display. */
  text: string;
  /** Where the credit links to. */
  url: string;
  licence?: string;
  licenceUrl?: string;
  /** What the project uses it for (for the About panel). */
  usedFor: string;
  kind: 'data' | 'tiles' | 'software';
}

export interface AttributionFile {
  generatedAt: string;
  disclaimer: string;
  items: AttributionItem[];
}

const CC_BY_4 = {
  licence: 'CC BY 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
};

export const DISCLAIMER =
  'Locations are approximate single points for each language variety, from AUSTLANG. They are not ' +
  'boundaries, and are not suitable for native title or any land claim. "Country today" is the ABS ' +
  '2021 suburb/locality containing (or nearest to) that point.';

export const OSM_NEARBY_ATTRIBUTION: AttributionItem = {
  id: 'osm-nearby',
  text: 'Nearby towns and landmarks © OpenStreetMap contributors, ODbL',
  url: 'https://www.openstreetmap.org/copyright',
  licence: 'ODbL 1.0',
  licenceUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
  usedFor:
    '"Country today" orientation: nearest town or village (place=city|town|village, within 100 km) and named peak, river, lake or range (within 50 km), extracted via the Overpass API at build time',
  kind: 'data',
};

export function buildAttribution(
  generatedAt: string,
  withWikidata: boolean,
  withOsmNearby = false,
): AttributionFile {
  const items: AttributionItem[] = [
    {
      id: 'austlang',
      text: 'AUSTLANG © Australian Institute of Aboriginal and Torres Strait Islander Studies (AIATSIS), CC BY 4.0, via TLCMap',
      url: 'https://collection.aiatsis.gov.au/datasets/austlang/001',
      ...CC_BY_4,
      usedFor:
        'Language names, alternative names and approximate locations (TLCMap layer 81: https://tlcmap.org/layers/81)',
      kind: 'data',
    },
    {
      id: 'abs-asgs',
      text: 'Suburb/state boundaries © Australian Bureau of Statistics, CC BY 4.0',
      url: 'https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/non-abs-structures/suburbs-and-localities',
      ...CC_BY_4,
      usedFor:
        '"Country today": ASGS Edition 3 (2021) Suburbs and Localities and States, looked up at build time',
      kind: 'data',
    },
    {
      id: 'mapterhorn',
      text: '© Mapterhorn',
      url: 'https://mapterhorn.com/attribution',
      usedFor: 'Terrain elevation tiles (primary)',
      kind: 'tiles',
    },
    {
      id: 'aws-terrain',
      text: 'Terrain Tiles: Mapzen/AWS Open Data (SRTM, Geoscience Australia)',
      url: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
      usedFor: 'Terrain elevation tiles (fallback)',
      kind: 'tiles',
    },
    {
      id: 'eox-s2cloudless',
      text: 'Sentinel-2 cloudless – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)',
      url: 'https://s2maps.eu',
      ...CC_BY_4,
      usedFor: 'Satellite imagery',
      kind: 'tiles',
    },
    {
      id: 'nsw-imagery',
      text: 'Aerial imagery © State of New South Wales (Spatial Services, a business unit of the Department of Customer Service NSW)',
      url: 'https://www.spatial.nsw.gov.au/',
      licence: 'CC BY 3.0 AU',
      licenceUrl: 'https://creativecommons.org/licenses/by/3.0/au/',
      usedFor: 'Aerial imagery over NSW and the ACT when zoomed in (NSW Imagery web service)',
      kind: 'tiles',
    },
    {
      id: 'qld-imagery',
      text: 'Aerial imagery © State of Queensland (Department of Natural Resources and Mines, Manufacturing and Regional and Rural Development); © Planet Labs Netherlands B.V. reproduced under licence from Planet and Geoplex, all rights reserved, 2026',
      url: 'https://qldspatial.information.qld.gov.au/',
      licence: 'CC BY-SA',
      licenceUrl:
        'https://spatial-img.information.qld.gov.au/arcgis/rest/services/Basemaps/LatestStateProgram_AllUsers/ImageServer/info/iteminfo',
      usedFor:
        'Aerial imagery over Queensland when zoomed in (Latest State Program basemap). In consideration of the State of Queensland permitting use of this data you acknowledge and agree that the State gives no warranty in relation to the data (including accuracy, reliability, completeness, currency or suitability) and accepts no liability (including without limitation, liability in negligence) for any loss, damage or costs (including consequential damage) relating to any use of the data.',
      kind: 'tiles',
    },
    {
      id: 'tas-imagery',
      text: 'Orthophoto © State of Tasmania (theLIST)',
      url: 'https://www.thelist.tas.gov.au/',
      licence: 'CC BY-NC-ND 3.0 AU',
      licenceUrl: 'https://creativecommons.org/licenses/by-nc-nd/3.0/au/',
      usedFor: 'Aerial imagery over Tasmania when zoomed in, shown unaltered',
      kind: 'tiles',
    },
    {
      id: 'openmaptiles',
      text: '© OpenMapTiles © OpenStreetMap contributors',
      url: 'https://www.openstreetmap.org/copyright',
      licence: 'ODbL 1.0',
      licenceUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
      usedFor: 'Place, road and water labels (OpenFreeMap vector tiles)',
      kind: 'tiles',
    },
    {
      id: 'maplibre',
      text: '© MapLibre',
      url: 'https://maplibre.org/',
      licence: 'BSD-3-Clause',
      licenceUrl: 'https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt',
      usedFor: 'Map renderer',
      kind: 'software',
    },
  ];
  if (withWikidata) {
    items.push({
      id: 'wikidata',
      text: 'Wikipedia links via Wikidata (CC0)',
      url: 'https://www.wikidata.org/wiki/Property:P1252',
      licence: 'CC0 1.0',
      licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      usedFor: 'Links from AUSTLANG codes to English Wikipedia articles',
      kind: 'data',
    });
  }
  if (withOsmNearby) items.push(OSM_NEARBY_ATTRIBUTION);
  return { generatedAt, disclaimer: DISCLAIMER, items };
}
