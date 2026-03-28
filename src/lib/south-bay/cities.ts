// ---------------------------------------------------------------------------
// South Bay Signal — city metadata
// ---------------------------------------------------------------------------

import type { City } from "./types";

export interface CityConfig {
  id: City;
  name: string;
  website: string;
}

export const CITIES: CityConfig[] = [
  { id: "campbell", name: "Campbell", website: "https://www.campbellca.gov" },
  { id: "cupertino", name: "Cupertino", website: "https://www.cupertino.org" },
  { id: "los-gatos", name: "Los Gatos", website: "https://www.losgatosca.gov" },
  { id: "mountain-view", name: "Mountain View", website: "https://www.mountainview.gov" },
  { id: "saratoga", name: "Saratoga", website: "https://www.saratoga.ca.us" },
  { id: "sunnyvale", name: "Sunnyvale", website: "https://www.sunnyvale.ca.gov" },
  { id: "san-jose", name: "San Jose", website: "https://www.sanjoseca.gov" },
  { id: "santa-clara", name: "Santa Clara", website: "https://www.santaclaraca.gov" },
  { id: "los-altos", name: "Los Altos", website: "https://www.losaltosca.gov" },
  { id: "palo-alto", name: "Palo Alto", website: "https://www.cityofpaloalto.org" },
  { id: "milpitas", name: "Milpitas", website: "https://www.milpitas.gov" },
];

export const CITY_MAP = Object.fromEntries(
  CITIES.map((c) => [c.id, c]),
) as Record<City, CityConfig>;

export function getCityName(id: City): string {
  return CITY_MAP[id]?.name ?? id;
}
