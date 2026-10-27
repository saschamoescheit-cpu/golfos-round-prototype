import type { LngLat } from '../types';

// Scorecards of courses whose holes OpenStreetMap does not have (Sascha 27.10.2026, Hawks Landing in Orlando): par and
// stroke index per hole, so the round has them – and the holes where we could work them out (LINES below), else they are
// drawn on the aerial photo once (from home too).
// Each from the course's published scorecard, checked against a second source.

export const CARDS: Record<string, Record<string, string>[]> = {
  // Hawk's Landing Golf Club, Orlando (World Center Marriott): GolfPass scorecard, par 70, 6255 yd from the Black tees –
  // GolfNow the same (27.10.2026)
  'osm:relation/4053362': [
    [4, 10], [3, 18], [4, 4], [5, 2], [4, 16], [5, 14], [3, 8], [4, 12], [4, 6],
    [5, 7], [4, 9], [4, 5], [3, 15], [4, 3], [3, 17], [4, 11], [4, 13], [3, 1],
  ].map(([par, hcp], k) => ({ ref: String(k + 1), par: String(par), handicap: String(hcp) })),
};

/**
 * The holes of such a course, tee to green, in the order of the card (Sascha 27.10.2026: "other apps can show these courses
 * too"). Hawks Landing: the green centres from GolfTraxx (GPS-surveyed – but 18 still the old green, the island green from
 * the aerial), the tees from OpenStreetMap's tee boxes, the routing from the club's own hole maps (vip.teeitup.com course
 * tour) checked hole by hole against the aerial and the card's lengths. A hole the player draws himself goes first.
 */
export const LINES: Record<string, LngLat[][]> = {
  'osm:relation/4053362': [
    [[-81.512395,28.360227],[-81.514658,28.362636]], // 1: tee: the long tee strip at the range corner (OSM T7) – Green tee length, Black 40 m further back
    [[-81.51429,28.362893],[-81.513409,28.361696]], // 2: OSM tees T13 … T22
    [[-81.513046,28.362026],[-81.513748,28.362987],[-81.514204,28.364026],[-81.514395,28.364844]], // 3: OSM tees T10 … T51, along the fairway
    [[-81.513944,28.36456],[-81.511361,28.364592],[-81.511281,28.363506],[-81.510586,28.362888]], // 4: OSM tees T24, T41, T33, T8 – dogleg right around the lake
    [[-81.510077,28.362748],[-81.510337,28.365143]], // 5: OSM tees T36, T53
    [[-81.510215,28.365519],[-81.514406,28.365281]], // 6: OSM tees T40, T6, T31, T20
    [[-81.514894,28.365067],[-81.514843,28.363202]], // 7: OSM tees T14, T44, T18, T47
    [[-81.515441,28.363617],[-81.515009,28.361077]], // 8: OSM tees T21, T50, T19
    [[-81.514875,28.360296],[-81.511423,28.359061]], // 9: tee estimated (no tee in OSM): from the scorecard length, by the ponds
    [[-81.510664,28.359503],[-81.508867,28.359494],[-81.505731,28.358869]], // 10: OSM tee T28, along the northern fairway (GolfTraxx aim point there)
    [[-81.504574,28.358358],[-81.503019,28.358786],[-81.501058,28.358985]], // 11: OSM tees T26, T12, T43 – along the fairway to the green on the peninsula
    [[-81.502546,28.358266],[-81.500766,28.358503],[-81.500123,28.358833],[-81.499933,28.359306]], // 12: OSM tees T3, T38 – Black/Green tee not in OSM (further back)
    [[-81.499647,28.359848],[-81.501069,28.359434]], // 13: GolfTraxx tee point (beside OSM tees T32 … T45)
    [[-81.500577,28.360006],[-81.504172,28.358983]], // 14: OSM tees T15, T42, T11
    [[-81.504551,28.358479],[-81.504865,28.35961]], // 15: GolfTraxx tee point (OSM tees T4 … T16 beside it)
    [[-81.505097,28.359982],[-81.501804,28.361027]], // 16: OSM tees T9, T34, T49
    [[-81.503794,28.361911],[-81.505339,28.361477]], // 17: OSM tees T54, T17 – 156 m to the green, the card says 251 m: back tee not found
    [[-81.508384,28.359626],[-81.510208,28.359281]], // 18: island green from the aerial (GolfTraxx has the old green); back tees estimated, OSM T23/T39 forward
  ],
};
