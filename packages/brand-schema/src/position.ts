/**
 * Ordering for sections and blocks.
 *
 * Items carry a numeric `position`. Moving an item only rewrites that item's
 * position (midpoint between its new neighbours), so drag-and-drop is a single
 * row update. When gaps get too small to split, `needsRebalance` signals that
 * the siblings should be renumbered with `rebalance`.
 */

export const POSITION_STEP = 1024;
const MIN_GAP = 1e-6;

/** Position for an item placed between `before` and `after` (either may be absent). */
export function positionBetween(before: number | null | undefined, after: number | null | undefined): number {
  const hasBefore = before !== null && before !== undefined;
  const hasAfter = after !== null && after !== undefined;
  if (!hasBefore && !hasAfter) return POSITION_STEP;
  if (!hasBefore) return (after as number) - POSITION_STEP;
  if (!hasAfter) return (before as number) + POSITION_STEP;
  if ((after as number) <= (before as number)) {
    throw new Error(`Invalid neighbours: after (${after}) must be greater than before (${before})`);
  }
  return ((before as number) + (after as number)) / 2;
}

export function needsRebalance(before: number, after: number): boolean {
  return after - before < MIN_GAP;
}

/** Evenly renumber items, keeping their current order. Returns new positions by id. */
export function rebalance<T extends { id: string; position: number }>(items: T[]): Map<string, number> {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  return new Map(sorted.map((item, i) => [item.id, (i + 1) * POSITION_STEP]));
}

/** Stable sort by position, then id, so equal positions never flicker. */
export function byPosition<T extends { id: string; position: number }>(a: T, b: T): number {
  return a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
