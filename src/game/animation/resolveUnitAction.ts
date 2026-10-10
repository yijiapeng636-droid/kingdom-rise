import type { Person, WorldState } from '../../domain/model/types.ts';
import { center, distance } from '../../domain/navigation/grid.ts';
import { BALANCE } from '../config/balance.ts';
import type { UnitAction } from './animationConfig.ts';

/** Read-only adapter from existing game tasks to view animation names.
 *  IMPORTANT: do not create or alter a Person/WorldState here. */
export function resolveUnitAction(person: Readonly<Person>, world: Readonly<WorldState>): UnitAction {
  if (person.life === 'downed' || person.life === 'dead') return 'downed';
  if (person.life === 'wounded') return 'wounded';
  if (person.life === 'prisoner') return 'prisoner';
  if (person.life !== 'active') return 'idle';

  if (person.path.length || distance(person.position, person.previousPosition) > 0.1) return 'walk';
  if (person.order.type === 'attack') return 'combat';

  if (person.order.type === 'gather') {
    const nodeId = person.order.nodeId;
    const node = world.nodes.find(n => n.id === nodeId && n.amount > 0);
    if (node && distance(person.position, center(node.cell)) < BALANCE.interactionRange) {
      return node.kind === 'wood' ? 'wood' : node.kind === 'stone' ? 'stone' : 'food';
    }
  }

  if (person.role === 'resident' && !person.manualOrder && person.targetBuildingId) {
    const building = world.buildings.find(b => b.id === person.targetBuildingId);
    if (building && distance(person.position, center(building.cell)) < BALANCE.interactionRange) {
      if (person.job === 'farm' && building.kind === 'farm' && building.stage === 'complete') return 'farm';
      if (person.job === 'build' && building.stage !== 'complete') return 'build';
    }
  }
  return 'idle';
}
