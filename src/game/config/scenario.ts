import type { Cell, FoodKind, Job, Person, Resource } from '../../domain/model/types.ts';

export const HOLDING_CELL: Cell = { x: 10, y: 9 };
export const REFUGEE_CELL: Cell = { x: 12, y: 10 };
export const WATER_CELLS: Cell[] = [
  ...Array.from({ length: 16 }, (_, i) => ({ x: 3, y: i + 4 })),
  ...Array.from({ length: 14 }, (_, i) => ({ x: 4, y: i + 5 })),
  {x:18,y:4},{x:19,y:4},{x:16,y:5},{x:17,y:5},{x:18,y:5},{x:19,y:5},{x:20,y:5},
  {x:17,y:6},{x:18,y:6},{x:19,y:6},
];

/** New starting maps / campaigns are defined as data; the rules do not know their coordinates. */
export interface ScenarioDefinition {
  id: string;
  leader: { name: string; cell: Cell };
  residents: { name: string; cell: Cell; job: Job; specialty: keyof Person['skills'] }[];
  resourceGroups: { kind: Resource; cells: Cell[]; amount: number; foodKind?: FoodKind }[];
  waterCells: Cell[];
}
export const FRONTIER_SCENARIO: ScenarioDefinition = {
  id: 'frontier-001',
  leader: { name: '领袖 · 阿瑟', cell: { x: 11, y: 11 } },
  residents: [
    { name: '艾琳', cell: { x: 12, y: 11 }, job: 'wood', specialty: 'wood' },
    { name: '布莱恩', cell: { x: 11, y: 12 }, job: 'wood', specialty: 'stone' },
    { name: '米娅', cell: { x: 12, y: 12 }, job: 'stone', specialty: 'farm' },
    { name: '罗恩', cell: { x: 10, y: 12 }, job: 'build', specialty: 'build' },
    { name: '莉亚', cell: { x: 13, y: 10 }, job: 'idle', specialty: 'wood' },
  ],
  waterCells: WATER_CELLS,
  resourceGroups: [
    { kind: 'wood', amount: 110, cells: [{x:7,y:8},{x:8,y:7},{x:9,y:7},{x:5,y:14},{x:6,y:15},{x:17,y:8},{x:19,y:9},{x:17,y:16},{x:18,y:18},{x:8,y:20}] },
    { kind: 'stone', amount: 110, cells: [{x:7,y:18},{x:8,y:18},{x:19,y:13},{x:17,y:4},{x:5,y:5},{x:20,y:19}] },
    { kind: 'food', foodKind: 'berries', amount: 65, cells: [{x:13,y:5},{x:5,y:11}] },
    { kind: 'food', foodKind: 'fruit', amount: 80, cells: [{x:14,y:5},{x:15,y:19},{x:20,y:9}] },
    { kind: 'food', foodKind: 'fish', amount: 95, cells: [{x:3,y:10},{x:4,y:15},{x:18,y:5}] },
    { kind: 'food', foodKind: 'game', amount: 70, cells: [{x:8,y:4},{x:20,y:16}] },
  ],
};
