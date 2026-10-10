import type { Order, Person, WorldState } from '../model/types.ts';
import { BALANCE } from '../../game/config/balance.ts';
import { center, distance } from '../navigation/grid.ts';
import { capacity } from '../rules/inventory.ts';

/** AI only produces intents. Application code checks and applies them. */
export type SettlementIntent =
  | { type: 'gather'; nodeId: string }
  | { type: 'workBuilding'; buildingId: string }
  | { type: 'idle' };
export interface ResidentPolicy {
  chooseSettlementAction(resident: Person, world: Readonly<WorldState>): SettlementIntent;
  chooseCombatOrder(resident: Person, world: Readonly<WorldState>): Order | null;
}
export class DefaultResidentPolicy implements ResidentPolicy {
  chooseSettlementAction(resident: Person, world: Readonly<WorldState>): SettlementIntent {
    if (resident.job === 'build') {
      const b = world.buildings.filter(b => b.stage !== 'complete')
        .sort((a, b) => distance(center(a.cell), resident.position) - distance(center(b.cell), resident.position))[0];
      return b ? { type: 'workBuilding', buildingId: b.id } : { type: 'idle' };
    }
    if (resident.job === 'farm') {
      const b = world.buildings.filter(b => b.kind === 'farm' && b.stage === 'complete')
        .sort((a, b) => distance(center(a.cell), resident.position) - distance(center(b.cell), resident.position))[0];
      return b ? { type: 'workBuilding', buildingId: b.id } : { type: 'idle' };
    }
    if (resident.job === 'wood' || resident.job === 'stone' || resident.job === 'forage') {
      const resource = resident.job === 'forage' ? 'food' : resident.job;
      if (world.resources[resource] >= capacity(world)) return { type: 'idle' };
      const n = world.nodes.filter(n => n.kind === resource && n.amount > 0)
        .sort((a, b) => distance(center(a.cell), resident.position) - distance(center(b.cell), resident.position))[0];
      return n ? { type: 'gather', nodeId: n.id } : { type: 'idle' };
    }
    return { type: 'idle' };
  }
  chooseCombatOrder(resident: Person, world: Readonly<WorldState>): Order | null {
    const nearby = world.persons
      .filter(p => p.team !== resident.team && p.life === 'active' && distance(p.position, resident.position) <= BALANCE.detectRange)
      .sort((a, b) => distance(resident.position, a.position) - distance(resident.position, b.position));
    return nearby[0] ? { type: 'attack', targetId: nearby[0].id } : null;
  }
}
