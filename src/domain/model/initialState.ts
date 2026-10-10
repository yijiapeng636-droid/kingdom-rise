import type { Cell, Person, ResourceNode, WorldState } from './types.ts';
import { FRONTIER_SCENARIO, type ScenarioDefinition } from '../../game/config/scenario.ts';
import { center } from '../navigation/grid.ts';
import { BALANCE } from '../../game/config/balance.ts';

function createPerson(id: string, name: string, role: Person['role'], cell: Cell): Person {
  const position = center(cell);
  return {
    id, name, role, team: role === 'raider' ? 'raiders' : 'settlement', life: 'active',
    position, previousPosition: { ...position }, path: [], order: { type: 'hold' }, manualOrder: false, job: 'idle',
    level: 1, exp: 0, skills: { wood: 0, stone: 0, farm: 0, build: 0 }, hp: BALANCE.maxHp[role],
    cooldown: 0, workTimer: 0, downedTimer: 0, recoveryTimer: 0,
    aiTimer: 0, combatContribution: 0, targetBuildingId: null, targetNodeId: null,
    captorFactionId: null, recruitProgress: 0, aggroTimer: 0,
  };
}
export function createInitialState(scenario: ScenarioDefinition = FRONTIER_SCENARIO, seed = 0x5eed1234): WorldState {
  const persons = [createPerson('leader-1', scenario.leader.name, 'leader', scenario.leader.cell),
    ...scenario.residents.map((spec, i) => {
      const person = createPerson(`resident-${i + 1}`, spec.name, 'resident', spec.cell);
      person.skills[spec.specialty] = 2;
      person.job = spec.job;
      return person;
    })];
  const nodes: ResourceNode[] = scenario.resourceGroups.flatMap((group, groupIndex) => group.cells.map((cell, i) => ({
    id: `node-${group.kind}-${groupIndex}-${i}`, cell, kind: group.kind, ...(group.foodKind ? { foodKind: group.foodKind } : {}),
    amount: group.amount, maxAmount: group.amount,
  })));
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 0x100000000);
  const raidAt = BALANCE.daySeconds * (BALANCE.raidWindowDays[0] + random() * (BALANCE.raidWindowDays[1] - BALANCE.raidWindowDays[0]));
  const refugeeAt = BALANCE.refugeeEvery[0] + random() * (BALANCE.refugeeEvery[1] - BALANCE.refugeeEvery[0]);
  return {
    schemaVersion: 3, idCounter: 0, tick: 0, time: 0, day: 1, speed: 1, paused: false,
    resources: { ...BALANCE.initialResources }, loyalty: BALANCE.startLoyalty, prosperity: BALANCE.startProsperity,
    persons, nodes, waterCells: scenario.waterCells.map(cell => ({ ...cell })), buildings: [],
    events: [{ id: 1, tick: 0, kind: 'info', message: '欢迎来到边境！建设营地，警惕随时可能出现的强盗。' }],
    encounter: null, raidTriggered: false, raidAt, rngSeed: seed,
    weather: 'clear', weatherUntil: BALANCE.weatherEvery, foodVariety: [], refugee: null, refugeeAt,
    productionTimer: 0, upkeepTimer: 0,
    regenerationTimer: 0, gameOver: false,
  };
}
export { createPerson };
