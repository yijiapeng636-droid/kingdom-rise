import type { Building, Cell, Order, Person, Point, ResourceNode, WorldState } from '../domain/model/types.ts';
import { createInitialState } from '../domain/model/initialState.ts';
import { center } from '../domain/navigation/grid.ts';
import { BALANCE } from '../game/config/balance.ts';

const STORAGE_KEY = 'kingdom-rise-mvp.save.v3';
const LEGACY_KEYS = ['kingdom-rise-mvp.save.v2', 'kingdom-rise-mvp.save.v1'];
export interface SaveRepository {
  load(): WorldState | null;
  save(world: WorldState): boolean;
  clear(): void;
}
/** Browser-only adapter. Add versioned migrations here as the domain evolves. */
export class LocalSaveRepository implements SaveRepository {
  load(): WorldState | null {
    try {
      const text = localStorage.getItem(STORAGE_KEY) ?? LEGACY_KEYS.map(key => localStorage.getItem(key)).find(Boolean);
      if (!text) return null;
      const data = migrate(JSON.parse(text));
      if (!isValid(data)) return null;
      return data;
    } catch (e) { console.warn('无法读取存档', e); return null; }
  }
  save(world: WorldState): boolean {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(world)); return true; }
    catch (e) { console.warn('无法写入存档', e); return false; }
  }
  clear() {
    localStorage.removeItem(STORAGE_KEY);
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);
  }
}

type LegacyWorld = Partial<Omit<WorldState, 'schemaVersion'>> & { schemaVersion: 1 | 2 };
type LegacyCell = { q: number; r: number };

function migrateCell(value: unknown): Cell {
  const cell = value as Partial<Cell & LegacyCell> | undefined;
  if (Number.isFinite(cell?.x) && Number.isFinite(cell?.y)) return { x: cell!.x!, y: cell!.y! };
  return { x: cell?.q ?? 0, y: cell?.r ?? 0 };
}
function legacyPointToCell(point: Point): Cell {
  const x = (point.x - 42) / 25, y = (point.y - 45) / 25;
  const q = Math.sqrt(3) / 3 * x - y / 3, r = 2 / 3 * y;
  let cubeX = q, cubeZ = r, cubeY = -q - r;
  let roundedX = Math.round(cubeX), roundedY = Math.round(cubeY), roundedZ = Math.round(cubeZ);
  const dx = Math.abs(roundedX - cubeX), dy = Math.abs(roundedY - cubeY), dz = Math.abs(roundedZ - cubeZ);
  if (dx > dy && dx > dz) roundedX = -roundedY - roundedZ;
  else if (dy > dz) roundedY = -roundedX - roundedZ;
  else roundedZ = -roundedX - roundedY;
  return {
    x: Math.max(0, Math.min(BALANCE.mapSize - 1, roundedX)),
    y: Math.max(0, Math.min(BALANCE.mapSize - 1, roundedZ)),
  };
}
function migratePoint(point: Point): Point { return center(legacyPointToCell(point)); }
function migrateOrder(order: Order): Order {
  return order.type === 'move' ? { ...order, destination: migratePoint(order.destination) } : order;
}
function migratePerson(person: Person): Person {
  return {
    ...person,
    position: migratePoint(person.position), previousPosition: migratePoint(person.previousPosition),
    path: person.path.map(migratePoint), order: migrateOrder(person.order),
    recruitProgress: person.recruitProgress ?? 0,
  };
}
function migrate(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const version = (value as { schemaVersion?: unknown }).schemaVersion;
  if (version === 3) return value;
  if (version !== 1 && version !== 2) return value;
  const legacy = value as LegacyWorld;
  const fresh = createInitialState();
  const persons = legacy.persons?.map(migratePerson) ?? fresh.persons;
  const oldNodes = legacy.nodes?.map(node => ({ ...node, cell: migrateCell(node.cell),
    foodKind: node.foodKind ?? (node.kind === 'food' ? 'berries' as const : undefined) })) ?? [];
  const missingFood = version === 1
    ? fresh.nodes.filter(node => node.foodKind && !oldNodes.some(old => old.foodKind === node.foodKind)) : [];
  const waterCells = legacy.waterCells?.map(migrateCell) ?? fresh.waterCells;
  const buildings = legacy.buildings?.map(building => ({ ...building, cell: migrateCell(building.cell) })) ?? [];
  return {
    ...fresh, ...legacy, schemaVersion: 3, persons, nodes: oldNodes.length ? [...oldNodes, ...missingFood] : fresh.nodes,
    waterCells, buildings,
    rngSeed: legacy.rngSeed ?? fresh.rngSeed,
    raidAt: legacy.raidAt ?? (legacy.raidTriggered ? (legacy.time ?? 0) + 90 : Math.max((legacy.time ?? 0) + 30, fresh.raidAt)),
    weather: legacy.weather ?? 'clear', weatherUntil: legacy.weatherUntil ?? (legacy.time ?? 0) + 45,
    foodVariety: legacy.foodVariety ?? [], refugee: legacy.refugee ?? null,
    refugeeAt: legacy.refugeeAt ?? (legacy.time ?? 0) + 180,
  } satisfies WorldState;
}
function validCell(cell: Cell): boolean {
  return Number.isInteger(cell.x) && Number.isInteger(cell.y) && cell.x >= 0 && cell.y >= 0
    && cell.x < BALANCE.mapSize && cell.y < BALANCE.mapSize;
}
function isValid(value: unknown): value is WorldState {
  if (!value || typeof value !== 'object') return false;
  const world = value as Partial<WorldState>;
  const sample = createInitialState();
  return world.schemaVersion === 3 && typeof world.time === 'number' && Number.isFinite(world.time)
    && typeof world.idCounter === 'number' && typeof world.tick === 'number'
    && !!world.resources && ['wood', 'stone', 'food'].every(key => typeof world.resources?.[key as keyof typeof sample.resources] === 'number')
    && Array.isArray(world.persons) && world.persons.length >= 1 && world.persons.every(person =>
      typeof person.id === 'string' && typeof person.level === 'number' && typeof person.exp === 'number'
      && person.position && Number.isFinite(person.position.x) && Number.isFinite(person.position.y)
      && !!person.order && Array.isArray(person.path))
    && Array.isArray(world.nodes) && world.nodes.every((node: ResourceNode) => validCell(node.cell))
    && Array.isArray(world.waterCells) && world.waterCells.every(validCell)
    && Array.isArray(world.buildings) && world.buildings.every((building: Building) => validCell(building.cell))
    && Array.isArray(world.events) && typeof world.upkeepTimer === 'number'
    && typeof world.raidTriggered === 'boolean' && typeof world.raidAt === 'number'
    && typeof world.rngSeed === 'number' && typeof world.weather === 'string' && typeof world.weatherUntil === 'number'
    && Array.isArray(world.foodVariety) && typeof world.refugeeAt === 'number';
}
