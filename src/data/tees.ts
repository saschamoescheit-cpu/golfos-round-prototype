import { tr } from '../lib/i18n';
// Tee lengths per hole (metres) for the bundled courses – from the clubs' scorecards / course guides 2026
// (Son Quint, Son Vida, Son Muntaner, Alcanada) and the Hetzenhof scorecards. null = no tee of that colour on this hole.
// The hole line on the map starts at one of these tees; the app shifts its start to the tee the player chose.

export interface CourseTees {
  tees: string[]; // colour names, longest first
  holes: Record<string, (number | null)[]>; // by hole label
}

export const TEES: Record<string, CourseTees> = {"osm:relation/1654444":{"tees":["White","Yellow","Blue","Red","Orange"],"holes":{"1":[351,334,307,284,196],"2":[360,347,316,293,223],"3":[165,160,151,139,78],"4":[372,356,333,319,254],"5":[338,328,318,308,254],"6":[326,313,290,263,175],"7":[446,436,410,390,310],"8":[362,350,330,300,240],"9":[157,139,131,121,74],"10":[340,316,290,268,170],"11":[346,334,303,288,238],"12":[195,177,166,151,85],"13":[476,452,423,402,201],"14":[120,117,113,106,58],"15":[374,351,324,298,224],"16":[396,383,339,326,269],"17":[501,483,435,418,363],"18":[396,374,346,313,260]}},"osm:relation/1130271":{"tees":["Yellow","Red","Orange"],"holes":{"1":[258,237,158],"2":[191,158,106],"3":[332,295,219],"4":[139,116,null],"5":[362,332,219],"6":[449,404,340],"7":[298,230,205],"8":[132,107,158],"9":[309,256,171],"10":[198,165,110],"11":[483,389,335],"12":[137,109,67],"13":[502,412,373],"14":[327,296,223],"15":[368,302,240],"16":[125,100,null],"17":[400,314,242],"18":[460,414,340]}},"osm:way/51852280":{"tees":["White","Yellow","Blue","Red"],"holes":{"1":[372,351,324,291],"2":[487,478,444,418],"3":[350,324,308,292],"4":[407,377,333,305],"5":[196,177,160,150],"6":[416,381,357,312],"7":[141,130,126,122],"8":[502,488,419,410],"9":[388,362,338,311],"10":[382,365,323,311],"11":[205,193,172,153],"12":[359,348,301,291],"13":[130,120,101,94],"14":[315,292,282,253],"15":[524,515,459,435],"16":[442,429,379,365],"17":[328,304,285,275],"18":[361,351,319,310]}},"osm:relation/1326323":{"tees":["White","Yellow","Blue","Red"],"holes":{"1A":[324,319,287,282],"2A":[157,145,134,125],"3A":[368,349,302,278],"4A":[567,528,467,420],"5A":[390,355,333,295],"6A":[138,129,116,100],"7A":[400,376,326,307],"8A":[335,306,306,263],"9A":[553,547,492,488],"1B":[392,366,319,313],"2B":[315,305,259,250],"3B":[167,142,142,109],"4B":[572,497,484,413],"5B":[360,317,307,280],"6B":[186,172,172,136],"7B":[429,375,350,294],"8B":[165,147,138,113],"9B":[468,458,417,387],"1C":[158,147,127,117],"2C":[278,273,251,246],"3C":[482,478,437,432],"4C":[424,419,377,373],"5C":[419,415,370,365],"6C":[336,330,292,286],"7C":[479,474,436,431],"8C":[130,130,114,114],"9C":[376,369,324,316]}},"osm:way/40755710":{"tees":["White","Yellow","Green","Blue","Red","Pink"],"holes":{"1":[458,450,415,401,373,368],"2":[387,368,352,350,294,270],"3":[335,314,302,299,280,252],"4":[188,160,146,132,124,102],"5":[376,353,343,323,289,281],"6":[156,137,128,127,106,99],"7":[579,561,544,542,523,470],"8":[428,398,384,365,341,317],"9":[397,374,346,346,324,298],"10":[363,348,333,333,307,257],"11":[554,535,517,516,494,427],"12":[347,324,294,294,280,257],"13":[514,492,424,410,389,368],"14":[167,145,142,140,114,112],"15":[326,297,283,264,244,241],"16":[435,418,395,335,332,310],"17":[213,194,181,164,157,131],"18":[348,325,315,304,270,292]}},"osm:way/28625559":{"tees":["White","Yellow","Blue","Red"],"holes":{"1":[364,338,295,275],"2":[186,178,146,133],"3":[482,449,412,371],"4":[381,361,347,314],"5":[377,351,317,299],"6":[297,270,246,226],"7":[483,454,422,395],"8":[139,131,110,100],"9":[357,340,312,301],"10":[393,379,332,314],"11":[153,139,109,95],"12":[367,342,321,296],"13":[471,444,403,380],"14":[374,356,325,295],"15":[384,364,334,314],"16":[495,465,448,425],"17":[190,182,164,148],"18":[400,370,353,326]}},"osm:relation/3977168":{"tees":["White","Yellow","Blue","Red"],"holes":{"1":[364,338,295,275],"2":[186,178,146,133],"3":[482,449,412,371],"4":[381,361,347,314],"5":[377,351,317,299],"6":[297,270,246,226],"7":[483,454,422,395],"8":[139,131,110,100],"9":[357,340,312,301],"10":[393,379,332,314],"11":[153,139,109,95],"12":[367,342,321,296],"13":[471,444,403,380],"14":[374,356,325,295],"15":[384,364,334,314],"16":[495,465,448,425],"17":[190,182,164,148],"18":[400,370,353,326]}},"sonantem:east":{"tees":["62","58","52","48"],"holes":{"1":[472,446,380,367],"2":[159,118,103,86],"3":[309,299,260,253],"4":[320,310,281,210],"5":[179,174,155,145],"6":[346,315,268,260],"7":[534,492,455,443],"8":[363,340,304,278],"9":[360,341,288,252],"10":[494,467,441,425],"11":[373,363,325,301],"12":[325,307,270,262],"13":[178,167,151,133],"14":[397,380,338,320],"15":[385,376,331,299],"16":[167,138,125,102],"17":[389,370,333,323],"18":[501,450,432,373]}},"southerndunes:fl":{"tees":["Black","Blue","White","Gold","Red"],"holes":{"1":[389,355,319,267,224],"2":[343,323,299,259,229],"3":[213,200,176,114,86],"4":[518,480,439,405,353],"5":[323,311,288,249,211],"6":[169,157,148,116,84],"7":[407,390,361,330,306],"8":[378,359,332,299,279],"9":[513,487,457,413,369],"10":[430,412,380,344,311],"11":[197,170,151,119,96],"12":[507,473,439,417,381],"13":[415,386,359,309,266],"14":[151,137,120,104,80],"15":[331,315,294,270,230],"16":[496,475,454,422,392],"17":[379,352,337,302,263],"18":[420,377,334,288,251]}},"osm:relation/4039063":{"tees":["Gold","Blue","White","Red","Green"],"holes":{"1":[471,449,421,401,378],"2":[345,325,301,272,232],"3":[369,343,311,282,257],"4":[166,148,137,113,93],"5":[347,319,291,269,246],"6":[319,292,278,258,237],"7":[148,137,123,94,80],"8":[475,455,397,360,296],"9":[407,364,327,286,237],"10":[378,345,316,307,283],"11":[404,379,350,324,295],"12":[166,154,137,131,91],"13":[352,324,307,280,259],"14":[508,469,432,394,367],"15":[143,134,118,109,96],"16":[373,326,301,283,266],"17":[389,352,326,298,279],"18":[470,431,415,393,369]}}};

/** Tee colour in the player's language. */
export const teeName = (t: string): string =>
  /^\d+$/.test(t) ? `Tee ${t}` : tr(t, ({ White: 'Weiß', Yellow: 'Gelb', Blue: 'Blau', Red: 'Rot', Orange: 'Orange', Green: 'Grün', Pink: 'Rosa', Black: 'Schwarz', Gold: 'Gold' } as Record<string, string>)[t] ?? t);

// Courses that name their tees by length (Son Antem East: 62/58/52/48) get grey shades, longest darkest.
export const TEE_COLOURS: Record<string, string> = { White: '#f2f2f2', Yellow: '#f5d042', Blue: '#3d8bfd', Red: '#e5484d', Orange: '#f59e0b', Green: '#1f7a4a', Pink: '#e48fc0', Black: '#22272b', Gold: '#c9a227', Silver: '#b8bec4', '62': '#5b6770', '58': '#87939b', '52': '#b3bdc3', '48': '#dfe5e8' }; // ci-allow: the colours of the tee markers themselves

/** Every tee colour, longest first – the standard tee in the profile (Sascha 22.10.2026: black tees, green ones for
 *  children, …). */
export const STANDARD_TEES = ['Black', 'White', 'Yellow', 'Blue', 'Red', 'Orange', 'Green'];

/** A course whose tees are not known: the four nearly every course has (Sascha 22.10.2026: "only the official tees –
 *  no black ones where a course has none"). */
export const COMMON_TEES = ['White', 'Yellow', 'Blue', 'Red'];

const ORDER = ['Black', 'White', 'Gold', 'Yellow', 'Blue', 'Silver', 'Red', 'Orange', 'Pink', 'Green'];
const WORDS: Record<string, string> = {
  black: 'Black', schwarz: 'Black', white: 'White', weiss: 'White', 'weiß': 'White', yellow: 'Yellow', gelb: 'Yellow',
  blue: 'Blue', blau: 'Blue', red: 'Red', rot: 'Red', orange: 'Orange', green: 'Green', 'grün': 'Green', gruen: 'Green',
  gold: 'Gold', pink: 'Pink', rosa: 'Pink', silver: 'Silver', silber: 'Silver',
};

/** A tee as OpenStreetMap or a player writes it ("yellow", "Gelb", "58") – the app's name for it, else null. */
export function teeId(v: string): string | null {
  const t = v.trim().toLowerCase();
  if (WORDS[t]) return WORDS[t];
  return /^\d{1,3}$/.test(t) ? t : null;
}

/** Longest first: numbered tees (Spain: 62, 58, … – the length in hundreds of metres) high to low, colours as on
 *  scorecards. */
export function sortTees(ids: string[]): string[] {
  const rank = (t: string) => (/^\d+$/.test(t) ? -Number(t) : 1000 + (ORDER.includes(t) ? ORDER.indexOf(t) : 99));
  return [...new Set(ids)].sort((a, b) => rank(a) - rank(b));
}

/** The tees a course offers: its scorecard (bundled courses), else the tees OpenStreetMap knows for it, else the usual
 *  colours. `known` = from the course itself. */
export function courseTees(courseId: string, mapped?: string[]): { tees: string[]; known: boolean } {
  const data = TEES[courseId];
  if (data) return { tees: data.tees, known: true };
  if (mapped?.length) return { tees: sortTees(mapped), known: true };
  return { tees: COMMON_TEES, known: false };
}

/** The tee a player starts with: yellow for men, red for ladies where there is one, else the middle one. */
export const defaultTee = (tees: string[], lady = false): string | null => {
  const want = lady ? 'Red' : 'Yellow';
  return tees.includes(want) ? want : tees[Math.floor((tees.length - 1) / 2)] ?? null;
};

/** The player's standard tee from the profile, where this course has it (a course of unknown tees: always). */
export function profileTee(offered: { tees: string[]; known: boolean }, tee: string | undefined): string | null {
  return tee && offered.tees.includes(tee) ? tee : null;
}
