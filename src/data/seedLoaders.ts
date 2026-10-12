import type { CourseGeometry } from '../types';

// Bundled course geometry, one chunk per course (feature 026): loaded when a course is picked or a round on it
// is opened, so the app starts fast however many courses are bundled. Kept offline by the service worker.
export const SEED_LOADERS: Record<string, () => Promise<CourseGeometry>> = {
  'osm:relation/1326323': () => import('./courses/hetzenhof.json').then((m) => m.default as unknown as CourseGeometry),
  'osm:relation/1654444': () => import('./courses/sonquint.json').then((m) => m.default as unknown as CourseGeometry),
  'osm:relation/1130271': () => import('./courses/sonvida.json').then((m) => m.default as unknown as CourseGeometry),
  'osm:way/51852280': () => import('./courses/sonmuntaner.json').then((m) => m.default as unknown as CourseGeometry),
  'osm:way/60140256': () => import('./courses/songual.json').then((m) => m.default as unknown as CourseGeometry),
  'osm:way/40755710': () => import('./courses/alcanada.json').then((m) => m.default as unknown as CourseGeometry),
  'osm:relation/3332769': () => import('./courses/canyamel.json').then((m) => m.default as unknown as CourseGeometry),
  'osm:way/81397943': () => import('./courses/sontermens.json').then((m) => m.default as unknown as CourseGeometry),
  'osm:way/98739153': () => import('./courses/maioris.json').then((m) => m.default as unknown as CourseGeometry),
  'osm:relation/2738804': () => import('./courses/pula.json').then((m) => m.default as unknown as CourseGeometry),
  'osm:way/108783334': () => import('./courses/puntiro.json').then((m) => m.default as unknown as CourseGeometry),
  'osm:way/28625559': () => import('./courses/sonantem.json').then((m) => m.default as unknown as CourseGeometry),
  'osm:relation/3977168': () => import('./courses/sonantem.json').then((m) => m.default as unknown as CourseGeometry),
  'sonantem:east': () => import('./courses/sonantemeast.json').then((m) => m.default as unknown as CourseGeometry),
};
