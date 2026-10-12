// All bundled course geometry at once – for tests, the caddie audit and data scripts. The app itself loads one
// course at a time (seedLoaders.ts). Sources and notes: courses/README.md.
import type { CourseGeometry } from '../types';
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

export const SEED_GEOMETRY: Record<string, CourseGeometry> = {
  'osm:relation/1326323': hetzenhof as unknown as CourseGeometry,
  'osm:relation/1654444': sonquint as unknown as CourseGeometry,
  'osm:relation/1130271': sonvida as unknown as CourseGeometry,
  'osm:way/51852280': sonmuntaner as unknown as CourseGeometry,
  'osm:way/60140256': songual as unknown as CourseGeometry,
  'osm:way/40755710': alcanada as unknown as CourseGeometry,
  'osm:relation/3332769': canyamel as unknown as CourseGeometry,
  'osm:way/81397943': sontermens as unknown as CourseGeometry,
  'osm:way/98739153': maioris as unknown as CourseGeometry,
  'osm:relation/2738804': pula as unknown as CourseGeometry,
  'osm:way/108783334': puntiro as unknown as CourseGeometry,
  'osm:way/28625559': sonantem as unknown as CourseGeometry,
  'osm:relation/3977168': sonantem as unknown as CourseGeometry,
};
