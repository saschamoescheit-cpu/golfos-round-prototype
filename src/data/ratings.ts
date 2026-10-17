// Course rating and slope per tee (men) for the bundled courses – needed for the handicap played today
// (WHS score differential). Only values whose tee length matches our tee data (src/data/tees.ts) are used;
// the player can correct them on the scorecard.
// - Son Antem West and East: the official RFEG tables published by the club (sonantemgolf.com, "BP12-2 Campo Oeste",
//   valid from 18.10.2014, and "BP12-1 Campo Este", valid from 25.03.2023), men's values.
// - Son Muntaner (GolfPass, 1golf.eu): white 6305 m 74.1 / 133, yellow 5985 m 72.4 / 133.
// - Alcanada (1golf.eu, GolfAdvisor, GolfPass): yellow 6193 m 73.0 / 135.
// - Son Quint (GolfPass): yellow 5750 m 70.8 / 133.
// - Son Vida: published yellow lengths (5529 / 5597 m) differ from our 5470 m – left out, the player enters it.

export interface TeeRating {
  cr: number; // course rating
  slope: number;
}

const SON_ANTEM_WEST: Record<string, TeeRating> = {
  White: { cr: 73.7, slope: 140 },
  Yellow: { cr: 71.8, slope: 134 },
  Blue: { cr: 69.7, slope: 128 },
  Red: { cr: 67.7, slope: 123 },
};

export const RATINGS: Record<string, Record<string, TeeRating>> = {
  'osm:relation/4039063': { Gold: { cr: 72.3, slope: 128 }, Blue: { cr: 70.0, slope: 123 }, White: { cr: 67.8, slope: 119 }, Red: { cr: 65.6, slope: 114 }, Green: { cr: 67.4, slope: 114 } }, // StoneGate Golf Club – Oaks: official scorecard 2025
  'osm:way/28625559': SON_ANTEM_WEST,
  'osm:relation/3977168': SON_ANTEM_WEST,
  'sonantem:east': { '62': { cr: 72.9, slope: 133 }, '58': { cr: 70.7, slope: 129 }, '52': { cr: 67.6, slope: 122 }, '48': { cr: 65.5, slope: 114 } },
  'osm:way/51852280': { White: { cr: 74.1, slope: 133 }, Yellow: { cr: 72.4, slope: 133 } },
  'osm:way/40755710': { Yellow: { cr: 73.0, slope: 135 } },
  'osm:relation/1654444': { Yellow: { cr: 70.8, slope: 133 } },
};
