// Scorecards of courses whose holes OpenStreetMap does not have (Sascha 27.10.2026, Hawks Landing in Orlando): par and
// stroke index per hole, so the round has them – the holes themselves are drawn on the aerial photo once (from home too).
// Each from the course's published scorecard, checked against a second source.

export const CARDS: Record<string, Record<string, string>[]> = {
  // Hawk's Landing Golf Club, Orlando (World Center Marriott): GolfPass scorecard, par 70, 6255 yd from the Black tees –
  // GolfNow the same (27.10.2026)
  'osm:relation/4053362': [
    [4, 10], [3, 18], [4, 4], [5, 2], [4, 16], [5, 14], [3, 8], [4, 12], [4, 6],
    [5, 7], [4, 9], [4, 5], [3, 15], [4, 3], [3, 17], [4, 11], [4, 13], [3, 1],
  ].map(([par, hcp], k) => ({ ref: String(k + 1), par: String(par), handicap: String(hcp) })),
};
