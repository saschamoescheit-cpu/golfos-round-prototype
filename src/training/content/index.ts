import type { Category, CategoryId, Drill } from '../types';
import { putting, puttingDrills } from './putting';

// All content of the Training module. Order of the categories = order in the library.

export const CATEGORIES: Category[] = [putting];

export const DRILLS: Drill[] = [...puttingDrills];

export const catById = (id: CategoryId): Category | undefined => CATEGORIES.find((c) => c.id === id);
export const drillById = (id: string): Drill | undefined => DRILLS.find((d) => d.id === id);
/** Drills of a category: its own first, then those that also fit. */
export const drillsOf = (id: CategoryId): Drill[] => [...DRILLS.filter((d) => d.cat === id), ...DRILLS.filter((d) => d.cat !== id && d.also?.includes(id))];
