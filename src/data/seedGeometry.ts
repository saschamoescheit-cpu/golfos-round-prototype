// All bundled course geometry at once – for tests, the caddie audit and data scripts. The app itself loads one
// course at a time (seedLoaders.ts). Sources and notes: courses/README.md.
import type { CourseGeometry } from '../types';
import { unpackGeometry } from '../lib/polyline';
import hetzenhof from './courses/hetzenhof.json';
import sonquint from './courses/sonquint.json';
import sonvida from './courses/sonvida.json';
import sonmuntaner from './courses/sonmuntaner.json';
import songual from './courses/songual.json';
import alcanada from './courses/alcanada.json';
import canyamel from './courses/canyamel.json';
import sontermens from './courses/sontermens.json';
import maioris from './courses/maioris.json';
import pula from './courses/pula.json';
import puntiro from './courses/puntiro.json';
import sonantem from './courses/sonantem.json';
import sonantemeast from './courses/sonantemeast.json';
import southerndunes from './courses/southerndunes.json';
import stonegateoaks from './courses/stonegateoaks.json';

export const SEED_GEOMETRY: Record<string, CourseGeometry> = {
  'osm:relation/1326323': unpackGeometry(hetzenhof as unknown as CourseGeometry),
  'osm:relation/1654444': unpackGeometry(sonquint as unknown as CourseGeometry),
  'osm:relation/1130271': unpackGeometry(sonvida as unknown as CourseGeometry),
  'osm:way/51852280': unpackGeometry(sonmuntaner as unknown as CourseGeometry),
  'osm:way/60140256': unpackGeometry(songual as unknown as CourseGeometry),
  'osm:way/40755710': unpackGeometry(alcanada as unknown as CourseGeometry),
  'osm:relation/3332769': unpackGeometry(canyamel as unknown as CourseGeometry),
  'osm:way/81397943': unpackGeometry(sontermens as unknown as CourseGeometry),
  'osm:way/98739153': unpackGeometry(maioris as unknown as CourseGeometry),
  'osm:relation/2738804': unpackGeometry(pula as unknown as CourseGeometry),
  'osm:way/108783334': unpackGeometry(puntiro as unknown as CourseGeometry),
  'osm:way/28625559': unpackGeometry(sonantem as unknown as CourseGeometry),
  'osm:relation/3977168': unpackGeometry(sonantem as unknown as CourseGeometry),
  'sonantem:east': unpackGeometry(sonantemeast as unknown as CourseGeometry),
  'southerndunes:fl': unpackGeometry(southerndunes as unknown as CourseGeometry),
  'osm:relation/4039063': unpackGeometry(stonegateoaks as unknown as CourseGeometry),
};
