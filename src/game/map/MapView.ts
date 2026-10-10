import Phaser from 'phaser';
import { BALANCE } from '../config/balance.ts';
import type { Cell } from '../../domain/model/types.ts';
import { center, key, worldSize } from '../../domain/navigation/grid.ts';

/** Generates placeholder terrain at boot. Swap to a Tiled JSON adapter later. */
export class MapView {
  readonly width: number;
  readonly height: number;
  constructor(scene: Phaser.Scene, waterCells: readonly Cell[]) {
    const size = worldSize(); this.width = size.x; this.height = size.y;
    const water = new Set(waterCells.map(key));
    const base = scene.add.graphics().setDepth(-1000);
    base.fillStyle(0x193a32).fillRect(0, 0, this.width, this.height);
    for (let y = 0; y < BALANCE.mapSize; y++) for (let x = 0; x < BALANCE.mapSize; x++) {
      const p = center({ x, y });
      const h = (x * 97 + y * 133 + x * y * 23) % 11;
      const central = Math.abs(x - 11) + Math.abs(y - 11) < 5;
      let color = central ? [0x65705a, 0x727761, 0x767c67][h % 3] : [0x315947, 0x395f4b, 0x345a48, 0x38634b, 0x40664f][h % 5];
      if (water.has(key({ x, y }))) color = h % 3 ? 0x356c77 : 0x397d83;
      square(base, p.x, p.y, BALANCE.cellSize - 1, color);
      // Fine details keep the terrain legible without external assets.
      if (!central && h === 4) {
        base.fillStyle(0x56836a, 0.27).fillCircle(p.x - 6, p.y + 4, 3);
        base.fillCircle(p.x + 8, p.y - 5, 2);
      }
    }
    const plaza = center({ x: 11, y: 11 });
    const glow = scene.add.graphics().setDepth(-899);
    glow.lineStyle(3, 0xd0bf88, 0.5).strokeCircle(plaza.x, plaza.y, 47);
    glow.lineStyle(1, 0xd0bf88, 0.23).strokeCircle(plaza.x, plaza.y, 62);
    scene.add.text(plaza.x, plaza.y + 56, '营 地 广 场', { fontSize: '13px', fontFamily: 'serif', color: '#e3d6a0', stroke: '#182720', strokeThickness: 3 }).setOrigin(0.5).setDepth(-850);
  }
}
export function square(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number, color: number, alpha = 1) {
  g.fillStyle(color, alpha).fillRect(x - size / 2, y - size / 2, size, size);
  g.lineStyle(0.65, 0x213b31, 0.2).strokeRect(x - size / 2, y - size / 2, size, size);
}
