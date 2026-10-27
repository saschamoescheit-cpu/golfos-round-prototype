// Course rating and slope per tee (men) for the bundled courses – needed for the handicap played today
// (WHS score differential). Only values whose tee length matches our tee data (src/data/tees.ts) are used;
// the player can correct them on the scorecard.
// - Son Antem West and East: the official RFEG tables published by the club (sonantemgolf.com, "BP12-2 Campo Oeste",
//   valid from 18.10.2014, and "BP12-1 Campo Este", valid from 25.03.2023), men's values.
// - Son Muntaner (GolfPass, 1golf.eu): white 6305 m 74.1 / 133, yellow 5985 m 72.4 / 133.
// - Alcanada (1golf.eu, GolfAdvisor, GolfPass): yellow 6193 m 73.0 / 135.
// - Son Quint (GolfPass): yellow 5750 m 70.8 / 133.
// - Son Vida: published yellow lengths (5529 / 5597 m) differ from our 5470 m – left out, the player enters it.
// - Hetzenhof (27 holes): one rating per 18-hole combination – key "<tee>@<loops>" (golfingrecord.com scorecards of
//   A-B, B-C, A-C, men's values; every tee length matches ours to the metre: A+B yellow 5833 m, B+C 5814 m,
//   A+C 6089 m). Each with the par of its scorecard – blue and red play some holes a par shorter; 9 holes of a loop use it too.
// - Southern Dunes (Florida): GolfPass scorecard, Black and Blue also on 18Birdies; every hole of every tee matches ours
//   to the metre (Black 7192 yd, Blue 6737, White 6220, Gold 5498). Men's values; red has only a women's rating – left out.

export interface TeeRating {
  cr: number; // course rating
  slope: number;
  par?: number; // the par this rating is for, where it differs from the holes' par (shorter tees)
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
  'osm:way/311994625': { Gold: { cr: 74.1, slope: 138 }, Blue: { cr: 71.0, slope: 128 }, White: { cr: 68.9, slope: 121 }, Red: { cr: 66.3, slope: 114 } }, // Falcon's Fire: GolfCourseAPI (night 22./23.10.2026), men's values; Southern Dunes checked the same way: identical
  'osm:relation/4053362': { Black: { cr: 70.2, slope: 133 }, Green: { cr: 67.8, slope: 126 }, Blue: { cr: 66.3, slope: 116 }, Gold: { cr: 64.9, slope: 112 } }, // Hawk's Landing, Orlando: GolfPass (27.10.2026), men's; Silver left out (68.5 for 4253 yd does not fit)
  'osm:relation/4039887': { Green: { cr: 73.7, slope: 135 }, Black: { cr: 71.9, slope: 131 }, Blue: { cr: 70.1, slope: 126 }, White: { cr: 67.5, slope: 121 }, Yellow: { cr: 65.0, slope: 112 } }, // Orange Lake – Legends: GolfCourseAPI (night 22./23.10.2026), men's values; Southern Dunes checked the same way: identical
  'southerndunes:fl': { Black: { cr: 75.0, slope: 140 }, Blue: { cr: 72.9, slope: 136 }, White: { cr: 70.4, slope: 133 }, Gold: { cr: 67.2, slope: 121 } },
  'osm:relation/1326323': {
    'White@AB': { cr: 74.2, slope: 134, par: 71 }, 'Yellow@AB': { cr: 71.6, slope: 130, par: 71 }, 'Blue@AB': { cr: 68.7, slope: 127, par: 70 }, 'Red@AB': { cr: 66.2, slope: 119, par: 68 },
    'White@BC': { cr: 73.2, slope: 132, par: 71 }, 'Yellow@BC': { cr: 71.4, slope: 131, par: 71 }, 'Blue@BC': { cr: 68.5, slope: 123, par: 70 }, 'Red@BC': { cr: 66.8, slope: 118, par: 69 },
    'White@AC': { cr: 74.0, slope: 136, par: 72 }, 'Yellow@AC': { cr: 72.6, slope: 132, par: 72 }, 'Blue@AC': { cr: 69.3, slope: 125, par: 72 }, 'Red@AC': { cr: 67.9, slope: 122, par: 71 },
  },
};
