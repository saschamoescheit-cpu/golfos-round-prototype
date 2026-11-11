// The same bundled course under another source's id (Sascha 12.11.2026, Cypress: "we had to set every tee and green" –
// the tournament was set up with an OpenGolfAPI entry of the course, so the bundled map under the OSM id never came):
// each OpenGolfAPI entry of a bundled Florida course points to it – its map, its holes, tees, ratings and green charts.
export const SEED_ALIASES: Record<string, string> = {
  // StoneGate Cypress (two entries there)
  'oga:06d2d455-f1f5-49a8-842f-ab79e127942d': 'osm:relation/4039062',
  'oga:d50fd7f6-d602-4141-b655-2cc705b81d7b': 'osm:relation/4039062',
  // StoneGate Oaks
  'oga:7d340fa3-ef01-4388-88f3-47e167a8222d': 'osm:relation/4039063',
  'oga:c36181a8-89b7-4c4c-a10d-65631a5ef8ac': 'osm:relation/4039063',
  // Southern Dunes
  'oga:808f11f8-5cb1-42c3-af73-d8b15a659fc1': 'southerndunes:fl',
  // Kissimmee Bay
  'oga:eb2ec344-785f-4e95-ba8b-9691b9e8a791': 'osm:relation/4039579',
  // Legends Golf & Country Club, Clermont
  'oga:40d39071-0b96-4c69-b4ed-6c88447e6973': 'osm:relation/4040123',
  // Orange Lake – The Legends
  'oga:416a908a-22a1-4e6e-b6ef-c1c1450d41e9': 'osm:relation/4039887',
  // Falcon's Fire
  'oga:7ffcc946-aa21-42f5-bac0-1088f238db61': 'osm:way/311994625',
};

/** Each alias gets what its course has, in a table keyed by course id. */
export function withAliases<T>(table: Record<string, T>): Record<string, T> {
  for (const [alias, id] of Object.entries(SEED_ALIASES)) if (table[id] !== undefined && table[alias] === undefined) table[alias] = table[id];
  return table;
}
