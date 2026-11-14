import { withAliases } from './seedAliases';
// Course rating and slope per tee for the bundled courses – needed for the handicap played today (WHS score differential)
// and the playing handicap. RATINGS are the men's values, LADY_RATINGS the women's (same keys). Only values whose tee
// length matches our tee data (src/data/tees.ts, within 1–2 %) are used; the player can correct them on the scorecard.
// Sascha 13.11.2026: "every course must always have slope and course rating – typing them in is a nuisance and error-prone":
// every tee checked against the official tables (13.11.2026).
// Spain – the Spanish federation's current tables (RFEG, the public club page rfegolf.es/club/<club>, "Recorrido y Hoyos":
//   Vc / Vs per tee, caballeros and damas, with the metres of every hole):
// - Son Antem West and East: also the club's RFEG tables (sonantemgolf.com, "BP12-2 Campo Oeste" valid from 18.10.2014,
//   "BP12-1 Campo Este" valid from 25.03.2023), men and women – identical. East tee 62: RFEG 6232 m (hole 9 341 m), the card 6251.
// - Son Quint: RFEG, every tee to the metre (yellow men 71.0, not GolfPass' older 70.8); the orange tee (3672 m) is not rated.
// - Son Vida: RFEG "Par 70", yellow 5470 m and red 4633 m (our 4636: hole 10 165 m on the club's card of June 2025, which
//   prints the same ratings); the par-71 layout (hole 2 a par 4) is not ours. The orange tee is not rated.
// - Son Muntaner: RFEG, white and yellow as GolfPass/1golf had them; women rated from blue and red only.
// - Alcanada: RFEG (yellow men 72.4 – the club's card of 2025 too; the 73.0 from 1golf/GolfPass was old), pink 4822 m to our 4852.
// - Son Gual, Canyamel, Son Térmens, Maioris, Pula, T Golf Palma Puntiró: RFEG, with the tee data taken from the same page;
//   Canyamel men also in the club's RFEG table BP11-1 (canyamelgolf.com, valid from 06.10.2023). The aggregators (GolfPass,
//   1golf) show older, different values for Son Gual, Maioris and Puntiró – not used.
// Germany:
// - Hetzenhof (27 holes): one rating per 18-hole combination – key "<tee>@<loops>" (golfingrecord.com scorecards of
//   A-B, B-C, A-C, which give every tee length to the metre: A+B yellow 5833 m, B+C 5814 m, A+C 6089 m; the club's own
//   website publishes no scorecard). Each with the par of its scorecard – men's blue and red play some holes a par shorter,
//   the ladies' tees some a par longer ("(L)" rows, their own par); 9 holes of a loop use it too. White has no ladies' rating.
// USA (Florida) – the USGA ratings as the Florida State GA publishes them (fsga.org club pages; ncrdb.usga.org refuses
//   automated access), 18Birdies the same value for value; lengths from the club's card, GolfPass, GolfLink, Stymie:
// - Southern Dunes: men as on the club's card (07/26) and GolfPass, every hole to the metre (Black 7192 yd = the card's
//   "Red", Blue 6737, White 6220, Gold 5498). Women FSGA (white 76.4; gold 72.5 and the forward tee 68.5/120 – the card
//   prints 72.1 and 68.1/119). Our "Red" (the card's "Green", 4825 yd) has no men's rating at FSGA.
// - StoneGate Cypress and Oaks: the club's 2025 card (one value per tee) and FSGA; the green tee's value on the card
//   (68.6 / 67.4) is the women's – the men's from FSGA. No women's rating from gold.
// - Kissimmee Bay: FSGA's current set (gold 72.0/135 …); the club's website still shows the older one (72.4/132 …).
// - Falcon's Fire, Orange Lake Legends: FSGA = GolfCourseAPI = GolfPass (men); the club's PDF of Falcon's Fire is older.
// - Hawk's Landing, Orlando: FSGA; silver men 62.0 (GolfPass' unlabelled 68.5 is no men's value). Women from blue down.
// - Orange Lake – The Reserve: the current card – the resort's own site (orangelakegolf.com) = GolfPass = FSGA: green 6241,
//   blue 5941, white 5764, yellow 4698 yd, men and women (14.11.2026; teal 6505 yd of golfingrecord.com is the old card).
// - Legends Golf & Country Club, Clermont: the club's card of August 2025 = FSGA = GolfPass, tee data from the same card.

export interface TeeRating {
  cr: number; // course rating
  slope: number;
  par?: number; // the par this rating is for, where it differs from the holes' par (shorter tees)
  /** where it came from when not bundled: OpenGolfAPI (ODbL – named where it shows) */
  source?: 'opengolfapi';
}

const SON_ANTEM_WEST: Record<string, TeeRating> = {
  White: { cr: 73.7, slope: 140 },
  Yellow: { cr: 71.8, slope: 134 },
  Blue: { cr: 69.7, slope: 128 },
  Red: { cr: 67.7, slope: 123 },
};
const SON_ANTEM_WEST_LADY: Record<string, TeeRating> = {
  Blue: { cr: 75.1, slope: 137 },
  Red: { cr: 72.6, slope: 131 },
};

export const RATINGS: Record<string, Record<string, TeeRating>> = {
  'osm:relation/4039062': { Gold: { cr: 72.6, slope: 137 }, Blue: { cr: 70.3, slope: 132 }, White: { cr: 68.4, slope: 123 }, Red: { cr: 66.2, slope: 118 }, Green: { cr: 63.2, slope: 112 } }, // StoneGate Golf Club – Cypress: official scorecard 2025, green FSGA
  'osm:relation/4039063': { Gold: { cr: 72.3, slope: 128 }, Blue: { cr: 70.0, slope: 123 }, White: { cr: 67.8, slope: 119 }, Red: { cr: 65.6, slope: 114 }, Green: { cr: 62.8, slope: 108 } }, // StoneGate Golf Club – Oaks: official scorecard 2025, green FSGA
  'osm:way/28625559': SON_ANTEM_WEST,
  'osm:relation/3977168': SON_ANTEM_WEST,
  'sonantem:east': { '62': { cr: 72.9, slope: 133 }, '58': { cr: 70.7, slope: 129 }, '52': { cr: 67.6, slope: 122 }, '48': { cr: 65.5, slope: 114 } },
  'osm:way/51852280': { White: { cr: 74.1, slope: 133 }, Yellow: { cr: 72.4, slope: 133 }, Blue: { cr: 69.2, slope: 135 }, Red: { cr: 67.5, slope: 125 } }, // Son Muntaner: RFEG
  'osm:way/40755710': { White: { cr: 74.6, slope: 137 }, Yellow: { cr: 72.4, slope: 135 }, Green: { cr: 70.9, slope: 131 }, Blue: { cr: 69.8, slope: 129 }, Red: { cr: 67.5, slope: 123 }, Pink: { cr: 65.5, slope: 118 } }, // Alcanada: RFEG
  'osm:relation/1654444': { White: { cr: 72.3, slope: 137 }, Yellow: { cr: 71.0, slope: 133 }, Blue: { cr: 68.8, slope: 125 }, Red: { cr: 67.0, slope: 120 } }, // Son Quint: RFEG
  'osm:relation/1130271': { Yellow: { cr: 69.8, slope: 134 }, Red: { cr: 65.8, slope: 115 } }, // Son Vida (par 70): RFEG
  'osm:way/60140256': { Black: { cr: 75.1, slope: 143 }, White: { cr: 72.8, slope: 144 }, Yellow: { cr: 72.0, slope: 138 }, Blue: { cr: 69.4, slope: 129 }, Red: { cr: 66.0, slope: 124 } }, // Son Gual: RFEG
  'osm:relation/3332769': { White: { cr: 73.4, slope: 143 }, Yellow: { cr: 72.2, slope: 141 }, Red: { cr: 69.0, slope: 129 } }, // Canyamel: RFEG
  'osm:way/81397943': { Yellow: { cr: 68.9, slope: 135 }, Red: { cr: 64.7, slope: 118 } }, // Son Térmens: RFEG
  'osm:way/98739153': { White: { cr: 74.3, slope: 138 }, Yellow: { cr: 72.9, slope: 134 }, Blue: { cr: 70.7, slope: 128 }, Red: { cr: 68.6, slope: 127 } }, // Maioris: RFEG
  'osm:relation/2738804': { White: { cr: 74.4, slope: 139 }, Yellow: { cr: 72.0, slope: 135 }, Blue: { cr: 69.4, slope: 132 }, Red: { cr: 67.3, slope: 125 } }, // Pula: RFEG
  'osm:way/108783334': { White: { cr: 72.5, slope: 135 }, Yellow: { cr: 69.7, slope: 134 }, Blue: { cr: 67.4, slope: 123 }, Red: { cr: 64.6, slope: 111 } }, // T Golf Palma Puntiró: RFEG
  'osm:way/311994625': { Gold: { cr: 74.1, slope: 138 }, Blue: { cr: 71.0, slope: 128 }, White: { cr: 68.9, slope: 121 }, Red: { cr: 66.3, slope: 114 } }, // Falcon's Fire: GolfCourseAPI (night 22./23.10.2026) = FSGA, men's values
  'osm:relation/4039579': { Gold: { cr: 72.0, slope: 135 }, Blue: { cr: 69.3, slope: 130 }, White: { cr: 67.7, slope: 129 }, Red: { cr: 62.9, slope: 116 } }, // Kissimmee Bay: FSGA
  'osm:relation/4053362': { Black: { cr: 70.2, slope: 133 }, Green: { cr: 67.8, slope: 126 }, Blue: { cr: 66.3, slope: 116 }, Gold: { cr: 64.9, slope: 112 }, Silver: { cr: 62.0, slope: 106 } }, // Hawk's Landing, Orlando: GolfPass (27.10.2026) = FSGA, men's
  'osm:relation/4039888': { Green: { cr: 70.1, slope: 126 }, Blue: { cr: 68.7, slope: 124 }, White: { cr: 67.7, slope: 121 }, Yellow: { cr: 62.7, slope: 106 } }, // Orange Lake – The Reserve: the current card (orangelakegolf.com = GolfPass, 14.11.2026), men's
  'osm:relation/4039887': { Green: { cr: 73.7, slope: 135 }, Black: { cr: 71.9, slope: 131 }, Blue: { cr: 70.1, slope: 126 }, White: { cr: 67.5, slope: 121 }, Yellow: { cr: 65.0, slope: 112 } }, // Orange Lake – Legends: GolfCourseAPI (night 22./23.10.2026) = FSGA, men's values
  'osm:relation/4040123': { Gold: { cr: 72.9, slope: 132 }, Blue: { cr: 71.3, slope: 129 }, White: { cr: 69.3, slope: 126 }, Green: { cr: 65.6, slope: 122 }, Purple: { cr: 62.8, slope: 111 }, Silver: { cr: 59.7, slope: 98 } }, // Legends G&CC, Clermont: club card 08/2025 = FSGA
  'southerndunes:fl': { Black: { cr: 75.0, slope: 140 }, Blue: { cr: 72.9, slope: 136 }, White: { cr: 70.4, slope: 133 }, Gold: { cr: 67.2, slope: 121 } },
  'osm:relation/1326323': {
    'White@AB': { cr: 74.2, slope: 134, par: 71 }, 'Yellow@AB': { cr: 71.6, slope: 130, par: 71 }, 'Blue@AB': { cr: 68.7, slope: 127, par: 70 }, 'Red@AB': { cr: 66.2, slope: 119, par: 68 },
    'White@BC': { cr: 73.2, slope: 132, par: 71 }, 'Yellow@BC': { cr: 71.4, slope: 131, par: 71 }, 'Blue@BC': { cr: 68.5, slope: 123, par: 70 }, 'Red@BC': { cr: 66.8, slope: 118, par: 69 },
    'White@AC': { cr: 74.0, slope: 136, par: 72 }, 'Yellow@AC': { cr: 72.6, slope: 132, par: 72 }, 'Blue@AC': { cr: 69.3, slope: 125, par: 72 }, 'Red@AC': { cr: 67.9, slope: 122, par: 71 },
  },
};
withAliases(RATINGS); // the same course under an OpenGolfAPI id (12.11.2026)

/** The women's course rating and slope per tee (13.11.2026) – same keys as RATINGS; a tee without one is not rated for
 *  women (the federations rate them from the shorter tees only). Sources: the header above. */
export const LADY_RATINGS: Record<string, Record<string, TeeRating>> = {
  'osm:way/28625559': SON_ANTEM_WEST_LADY,
  'osm:relation/3977168': SON_ANTEM_WEST_LADY,
  'sonantem:east': { '62': { cr: 79.9, slope: 141 }, '58': { cr: 77.6, slope: 138 }, '52': { cr: 73.6, slope: 129 }, '48': { cr: 70.9, slope: 126 } },
  'osm:relation/1654444': { White: { cr: 79.3, slope: 137 }, Yellow: { cr: 77.8, slope: 135 }, Blue: { cr: 74.5, slope: 131 }, Red: { cr: 72.3, slope: 126 } }, // Son Quint
  'osm:relation/1130271': { Yellow: { cr: 75.7, slope: 137 }, Red: { cr: 70.7, slope: 126 } }, // Son Vida (par 70)
  'osm:way/51852280': { Blue: { cr: 75.6, slope: 131 }, Red: { cr: 73.2, slope: 130 } }, // Son Muntaner
  'osm:way/40755710': { White: { cr: 82.3, slope: 143 }, Yellow: { cr: 79.7, slope: 138 }, Green: { cr: 77.7, slope: 135 }, Blue: { cr: 76.3, slope: 133 }, Red: { cr: 73.7, slope: 132 }, Pink: { cr: 71.0, slope: 129 } }, // Alcanada
  'osm:way/60140256': { Blue: { cr: 75.2, slope: 141 }, Red: { cr: 71.8, slope: 134 } }, // Son Gual
  'osm:relation/3332769': { White: { cr: 80.1, slope: 149 }, Yellow: { cr: 78.7, slope: 146 }, Red: { cr: 74.7, slope: 138 } }, // Canyamel
  'osm:way/81397943': { Yellow: { cr: 74.8, slope: 138 }, Red: { cr: 69.9, slope: 126 } }, // Son Térmens
  'osm:way/98739153': { White: { cr: 81.0, slope: 143 }, Yellow: { cr: 79.2, slope: 139 }, Blue: { cr: 76.9, slope: 139 }, Red: { cr: 74.9, slope: 134 } }, // Maioris
  'osm:relation/2738804': { Blue: { cr: 75.6, slope: 145 }, Red: { cr: 73.4, slope: 138 } }, // Pula
  'osm:way/108783334': { White: { cr: 78.4, slope: 144 }, Yellow: { cr: 75.5, slope: 137 }, Blue: { cr: 72.6, slope: 131 }, Red: { cr: 69.1, slope: 125 } }, // T Golf Palma Puntiró
  'osm:relation/1326323': {
    'Yellow@AB': { cr: 77.8, slope: 133, par: 73 }, 'Blue@AB': { cr: 74.6, slope: 128, par: 71 }, 'Red@AB': { cr: 71.3, slope: 126, par: 71 },
    'Yellow@BC': { cr: 77.3, slope: 135, par: 75 }, 'Blue@BC': { cr: 74.0, slope: 127, par: 72 }, 'Red@BC': { cr: 72.0, slope: 128, par: 71 },
    'Yellow@AC': { cr: 79.1, slope: 139, par: 76 }, 'Blue@AC': { cr: 75.3, slope: 136, par: 73 }, 'Red@AC': { cr: 73.6, slope: 131, par: 72 },
  }, // Hetzenhof: the "(L)" rows of the golfingrecord.com scorecards, each with its ladies' par
  'southerndunes:fl': { White: { cr: 76.4, slope: 138 }, Gold: { cr: 72.5, slope: 128 }, Red: { cr: 68.5, slope: 120 } },
  'osm:relation/4039062': { Blue: { cr: 76.7, slope: 135 }, White: { cr: 74.5, slope: 129 }, Red: { cr: 71.8, slope: 124 }, Green: { cr: 68.6, slope: 117 } }, // StoneGate Cypress
  'osm:relation/4039063': { Blue: { cr: 75.9, slope: 130 }, White: { cr: 73.1, slope: 124 }, Red: { cr: 70.8, slope: 119 }, Green: { cr: 67.4, slope: 114 } }, // StoneGate Oaks
  'osm:relation/4039579': { Red: { cr: 66.9, slope: 116 } }, // Kissimmee Bay
  'osm:way/311994625': { White: { cr: 74.6, slope: 128 }, Red: { cr: 71.4, slope: 120 } }, // Falcon's Fire
  'osm:relation/4053362': { Blue: { cr: 71.7, slope: 133 }, Gold: { cr: 69.9, slope: 129 }, Silver: { cr: 65.6, slope: 119 } }, // Hawk's Landing
  'osm:relation/4039887': { Blue: { cr: 75.8, slope: 137 }, White: { cr: 73.1, slope: 131 }, Yellow: { cr: 69.8, slope: 124 } }, // Orange Lake – Legends
  'osm:relation/4039888': { Green: { cr: 75.9, slope: 139 }, Blue: { cr: 74.3, slope: 135 }, White: { cr: 73.4, slope: 133 }, Yellow: { cr: 66.9, slope: 112 } }, // Orange Lake – The Reserve: current card, women's (14.11.2026)
  'osm:relation/4040123': { White: { cr: 74.9, slope: 136 }, Green: { cr: 70.6, slope: 133 }, Purple: { cr: 67.2, slope: 122 }, Silver: { cr: 62.7, slope: 100 } }, // Legends G&CC, Clermont
};
withAliases(LADY_RATINGS);
