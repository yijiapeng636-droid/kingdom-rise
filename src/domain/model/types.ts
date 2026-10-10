/** Single source of truth. All persisted game objects must be plain JSON values. */
export type Resource = 'wood' | 'stone' | 'food';
export type FoodKind = 'grain' | 'berries' | 'fruit' | 'fish' | 'game';
export type WeatherKind = 'clear' | 'rain' | 'storm' | 'cold';
export type Stock = Record<Resource, number>;
export type Point = { x: number; y: number };
export type Cell = { x: number; y: number };
export type Team = 'settlement' | 'raiders';
export type Job = 'idle' | 'wood' | 'stone' | 'farm' | 'forage' | 'build' | 'rest';
export type Life = 'active' | 'downed' | 'wounded' | 'dead' | 'prisoner' | 'released';
export type Role = 'leader' | 'resident' | 'raider';
export type BuildingKind = 'house' | 'farm' | 'warehouse' | 'palisade';
export type BuildingStage = 'foundation' | 'construction' | 'complete';
export type Order =
  | { type: 'move'; destination: Point }
  | { type: 'attack'; targetId: string }
  | { type: 'gather'; nodeId: string }
  | { type: 'hold' };

export interface Person {
  id: string;
  name: string;
  team: Team;
  role: Role;
  life: Life;
  position: Point;
  previousPosition: Point;
  path: Point[];
  order: Order;
  manualOrder: boolean;
  job: Job;
  level: number;
  exp: number;
  skills: { wood: number; stone: number; farm: number; build: number };
  hp: number;
  cooldown: number;
  workTimer: number;
  downedTimer: number;
  recoveryTimer: number;
  aiTimer: number;
  combatContribution: number;
  targetBuildingId: string | null;
  targetNodeId: string | null;
  captorFactionId: Team | null;
  recruitProgress: number;
  /** Seconds since last hostile hit, used to avoid interrupting every farming tick. */
  aggroTimer: number;
}
export interface ResourceNode {
  id: string;
  kind: Resource;
  cell: Cell;
  amount: number;
  maxAmount: number;
  foodKind?: FoodKind;
}
export interface Building {
  id: string;
  kind: BuildingKind;
  cell: Cell;
  stage: BuildingStage;
  progress: number;
  hp: number;
  builderIds: string[];
}
export interface Encounter {
  id: string;
  phase: 'active' | 'victory' | 'defeat';
  raiderIds: string[];
  defenderIds: string[];
  casualties: string[];
  injured: string[];
  prisoners: string[];
  loot: Stock;
  lootClaimed: boolean;
  combatXpGranted: boolean;
  startedAt: number;
  endedAt: number | null;
}
export type GameEvent = { id: number; tick: number; kind: string; message: string };
export interface RefugeeOffer { id: string; name: string; expiresAt: number }
export interface WorldState {
  schemaVersion: 3;
  idCounter: number;
  tick: number;
  time: number;
  day: number;
  speed: 1 | 2;
  paused: boolean;
  resources: Stock;
  loyalty: number;
  prosperity: number;
  persons: Person[];
  nodes: ResourceNode[];
  waterCells: Cell[];
  buildings: Building[];
  events: GameEvent[];
  encounter: Encounter | null;
  /** Whether this settlement has ever faced a raid; active-raid locking uses encounter.phase. */
  raidTriggered: boolean;
  raidAt: number;
  rngSeed: number;
  weather: WeatherKind;
  weatherUntil: number;
  foodVariety: FoodKind[];
  refugee: RefugeeOffer | null;
  refugeeAt: number;
  productionTimer: number;
  upkeepTimer: number;
  regenerationTimer: number;
  gameOver: boolean;
}
export type GameCommand =
  | { type: 'order'; personIds: string[]; order: Order }
  | { type: 'assign'; personId: string; job: Job }
  | { type: 'build'; kind: BuildingKind; cell: Cell }
  | { type: 'pause'; value: boolean }
  | { type: 'speed'; value: 1 | 2 }
  | { type: 'raid'; value?: never }
  | { type: 'claimLoot'; value?: never }
  | { type: 'releasePrisoner'; personId: string }
  | { type: 'recruitPrisoner'; personId: string }
  | { type: 'acceptRefugee'; value?: never }
  | { type: 'rejectRefugee'; value?: never }
  | { type: 'devResources'; value?: never }
  | { type: 'devWeather'; value?: never }
  | { type: 'devRefugee'; value?: never }
  | { type: 'devPrisoner'; value?: never }
  | { type: 'devRecruit'; value?: never };

export interface CommandResult { ok: boolean; message: string }
