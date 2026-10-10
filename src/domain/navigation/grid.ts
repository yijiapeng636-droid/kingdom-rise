import type { Cell, Point, WorldState } from '../model/types.ts';
import { BALANCE } from '../../game/config/balance.ts';
import { BUILDINGS } from '../../game/config/buildings.ts';

export const DIRS: Cell[] = [
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
  { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
];
export const key = (cell: Cell) => `${cell.x},${cell.y}`;
export const inBounds = (cell: Cell) => Number.isInteger(cell.x) && Number.isInteger(cell.y)
  && cell.x >= 0 && cell.y >= 0 && cell.x < BALANCE.mapSize && cell.y < BALANCE.mapSize;
export const center = (cell: Cell): Point => ({
  x: (cell.x + 0.5) * BALANCE.cellSize,
  y: (cell.y + 0.5) * BALANCE.cellSize,
});
export const worldSize = (): Point => ({
  x: BALANCE.mapSize * BALANCE.cellSize,
  y: BALANCE.mapSize * BALANCE.cellSize,
});
export const toCell = (point: Point): Cell => ({
  x: Math.floor(point.x / BALANCE.cellSize),
  y: Math.floor(point.y / BALANCE.cellSize),
});
export const neighbors = (cell: Cell): Cell[] => DIRS
  .map(direction => ({ x: cell.x + direction.x, y: cell.y + direction.y }))
  .filter(inBounds);
export const distanceCell = (a: Cell, b: Cell): number => {
  const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
  return Math.min(dx, dy) * Math.SQRT2 + Math.abs(dx - dy);
};
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const isBlocked = (world: WorldState, cell: Cell, excludeBuildingId?: string): boolean =>
  !inBounds(cell) || world.waterCells.some(water => key(water) === key(cell))
  || world.nodes.some(node => node.amount > 0 && key(node.cell) === key(cell))
  || world.buildings.some(building => building.id !== excludeBuildingId && building.hp > 0
    && key(building.cell) === key(cell) && BUILDINGS[building.kind].blocksMovement);

function cutsBlockedCorner(world: WorldState, from: Cell, to: Cell): boolean {
  if (from.x === to.x || from.y === to.y) return false;
  return isBlocked(world, { x: to.x, y: from.y }) || isBlocked(world, { x: from.x, y: to.y });
}

/** A* uses eight directions and never permits diagonal movement through a blocked corner. */
export function findPath(world: WorldState, from: Point, goal: Point, allowNearby = true): Point[] | null {
  const start = toCell(from), end = toCell(goal);
  if (!inBounds(start) || !inBounds(end)) return null;
  const targets = !isBlocked(world, end) ? [end] : allowNearby ? neighbors(end).filter(cell => !isBlocked(world, cell)) : [];
  if (!targets.length) return null;
  const targetSet = new Set(targets.map(key));
  if (targetSet.has(key(start))) return [];
  const open = [start];
  const came = new Map<string, string>();
  const costs = new Map<string, number>([[key(start), 0]]);
  const scores = new Map<string, number>([[key(start), Math.min(...targets.map(target => distanceCell(start, target)))]]);
  const visited = new Set<string>();
  const cells = new Map<string, Cell>([[key(start), start]]);
  while (open.length) {
    open.sort((a, b) => (scores.get(key(a)) ?? Infinity) - (scores.get(key(b)) ?? Infinity));
    const current = open.shift()!;
    const currentKey = key(current);
    if (targetSet.has(currentKey)) {
      const path: Point[] = [];
      let step = currentKey;
      while (step !== key(start)) {
        path.unshift(center(cells.get(step)!));
        step = came.get(step)!;
      }
      return path;
    }
    visited.add(currentKey);
    for (const next of neighbors(current)) {
      const nextKey = key(next);
      if (isBlocked(world, next) || cutsBlockedCorner(world, current, next) || visited.has(nextKey)) continue;
      const moveCost = current.x === next.x || current.y === next.y ? 1 : Math.SQRT2;
      const tentative = (costs.get(currentKey) ?? Infinity) + moveCost;
      if (tentative >= (costs.get(nextKey) ?? Infinity)) continue;
      cells.set(nextKey, next);
      came.set(nextKey, currentKey);
      costs.set(nextKey, tentative);
      scores.set(nextKey, tentative + Math.min(...targets.map(target => distanceCell(next, target))));
      if (!open.some(cell => key(cell) === nextKey)) open.push(next);
    }
  }
  return null;
}
