import type { Resource, Stock, WorldState } from '../model/types.ts';
import { BALANCE } from '../../game/config/balance.ts';
import { BUILDINGS } from '../../game/config/buildings.ts';
export const capacity = (w: Pick<Readonly<WorldState>, 'buildings'>) => BALANCE.baseCapacity + w.buildings.filter(b => b.stage === 'complete').reduce((n, b) => n + BUILDINGS[b.kind].capacity, 0);
export const canAfford = (w: WorldState, cost: Stock) => (Object.keys(cost) as Resource[]).every(k => w.resources[k] >= cost[k]);
export function spend(w: WorldState, cost: Stock): boolean {
  if (!canAfford(w, cost)) return false;
  for (const k of Object.keys(cost) as Resource[]) w.resources[k] -= cost[k];
  return true;
}
export function addStock(w: WorldState, kind: Resource, amount: number): number {
  const actual = Math.min(Math.max(0, amount), Math.max(0, capacity(w) - w.resources[kind]));
  w.resources[kind] += actual;
  return actual;
}
