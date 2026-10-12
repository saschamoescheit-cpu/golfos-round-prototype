// Course rating and slope per tee (men) for the bundled courses – needed for the handicap played today
// (WHS score differential). Only values whose tee length matches our tee data (src/data/tees.ts) are used;
// the player can correct them on the scorecard.
// - Son Antem West yellow: 1golf.eu and GolfAdvisor give 72.2 / 136, Golfify and golfingrecord 71.8 / 134 –
//   the higher pair is used until the club's scorecard confirms it.
// - Son Muntaner (GolfPass, 1golf.eu): white 6305 m 74.1 / 133, yellow 5985 m 72.4 / 133.
// - Alcanada (1golf.eu, GolfAdvisor, GolfPass): yellow 6193 m 73.0 / 135.
// - Son Quint (GolfPass): yellow 5750 m 70.8 / 133.
// - Son Vida: published yellow lengths (5529 / 5597 m) differ from our 5470 m – left out, the player enters it.

export interface TeeRating {
  cr: number; // course rating
  slope: number;
}

const SON_ANTEM_WEST: Record<string, TeeRating> = { White: { cr: 74.3, slope: 138 }, Yellow: { cr: 72.2, slope: 136 } };

export const RATINGS: Record<string, Record<string, TeeRating>> = {
  'osm:way/28625559': SON_ANTEM_WEST,
  'osm:relation/3977168': SON_ANTEM_WEST,
  'osm:way/51852280': { White: { cr: 74.1, slope: 133 }, Yellow: { cr: 72.4, slope: 133 } },
  'osm:way/40755710': { Yellow: { cr: 73.0, slope: 135 } },
  'osm:relation/1654444': { Yellow: { cr: 70.8, slope: 133 } },
};
