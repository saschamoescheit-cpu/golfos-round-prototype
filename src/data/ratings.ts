// Course rating and slope per tee (men) for the bundled courses – needed for the handicap played today
// (WHS score differential). Only values from published scorecards; the player can correct them on the scorecard.
// Son Antem West yellow: 1golf.eu and GolfAdvisor give 72.2 / 136, Golfify and golfingrecord 71.8 / 134 –
// the higher pair is used until the club's scorecard confirms it.

export interface TeeRating {
  cr: number; // course rating
  slope: number;
}

const SON_ANTEM_WEST: Record<string, TeeRating> = { White: { cr: 74.3, slope: 138 }, Yellow: { cr: 72.2, slope: 136 } };

export const RATINGS: Record<string, Record<string, TeeRating>> = {
  'osm:way/28625559': SON_ANTEM_WEST,
  'osm:relation/3977168': SON_ANTEM_WEST,
};
