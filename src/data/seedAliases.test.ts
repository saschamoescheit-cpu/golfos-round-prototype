import { describe, expect, it } from 'vitest';
import { SEED_ALIASES } from './seedAliases';
import { SEED_COURSES } from './seedCourses';
import { SEED_GEOMETRY } from './seedGeometry';
import { SEED_LOADERS } from './seedLoaders';
import { TEES } from './tees';
import { RATINGS } from './ratings';

// Sascha 12.11.2026, Cypress: the tournament was set up with an OpenGolfAPI entry – the bundled course under the OSM id
// must come under that id too: its holes, its map, its tees and ratings
describe('a bundled course under its OpenGolfAPI ids', () => {
  for (const [alias, id] of Object.entries(SEED_ALIASES)) {
    it(`${alias} → ${SEED_COURSES[id]?.name ?? id}`, () => {
      expect(SEED_COURSES[alias]).toBe(SEED_COURSES[id]);
      expect(SEED_LOADERS[alias]).toBe(SEED_LOADERS[id]);
      expect(SEED_GEOMETRY[alias]).toBe(SEED_GEOMETRY[id]);
      expect(TEES[alias]).toBe(TEES[id]);
      expect(RATINGS[alias]).toBe(RATINGS[id]);
      expect(SEED_COURSES[alias]?.holeTags.length).toBe(18);
    });
  }
});
