import { describe, expect, it } from 'vitest';
import { gridHeight, type TerrainGrid } from './terraingrid';

describe('course height grid', () => {
  // 3 × 2 cells of 10 m (north row first), rising 1 m per cell to the east, 0.5 m per cell to the south
  const g: TerrainGrid = { west: 9.0, north: 48.0, dLon: 0.0001, dLat: 0.0001, cols: 3, rows: 2, base: 400, cm: [0, 100, 200, 50, 150, 250] };
  it('reads between the grid points', () => {
    expect(gridHeight(g, [9.0, 48.0])).toBeCloseTo(400, 5);
    expect(gridHeight(g, [9.00015, 47.99995])).toBeCloseTo(401.75, 5); // halfway east of column 1, halfway south
    expect(gridHeight(g, [9.0002, 47.9999])).toBeCloseTo(402.5, 5);
  });
  it('outside the grid or without a height: null (the coarse service is used)', () => {
    expect(gridHeight(g, [8.9999, 48.0])).toBeNull();
    expect(gridHeight({ ...g, cm: [0, -1, 200, 50, 150, 250] }, [9.00005, 47.99995])).toBeNull();
  });
});
