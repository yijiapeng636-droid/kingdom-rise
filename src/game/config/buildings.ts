import type { BuildingKind, Stock } from '../../domain/model/types.ts';

export interface BuildingDefinition {
  name: string;
  cost: Stock;
  buildSeconds: number;
  maxHp: number;
  population: number;
  capacity: number;
  prosperity: number;
  blocksMovement: boolean;
  description: string;
}
export const BUILDINGS: Record<BuildingKind, BuildingDefinition> = {
  house: { name: '住房', cost: { wood: 8, stone: 2, food: 0 }, buildSeconds: 16, maxHp: 120, population: 3, capacity: 0, prosperity: 4, blocksMovement: true, description: '增加居民容量和繁荣度' },
  farm: { name: '农田', cost: { wood: 5, stone: 0, food: 0 }, buildSeconds: 11, maxHp: 85, population: 0, capacity: 0, prosperity: 3, blocksMovement: false, description: '需要务农居民持续生产食物' },
  warehouse: { name: '仓库', cost: { wood: 6, stone: 0, food: 0 }, buildSeconds: 14, maxHp: 125, population: 0, capacity: 80, prosperity: 2, blocksMovement: true, description: '扩充三类资源的存储上限' },
  palisade: { name: '木栅栏', cost: { wood: 4, stone: 0, food: 0 }, buildSeconds: 8, maxHp: 165, population: 0, capacity: 0, prosperity: 0, blocksMovement: true, description: '阻挡道路，能承受强盗攻击' },
};
export const BUILDING_KINDS = Object.keys(BUILDINGS) as BuildingKind[];
