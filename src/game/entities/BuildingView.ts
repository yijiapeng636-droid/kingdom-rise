import Phaser from 'phaser';
import type { Building } from '../../domain/model/types.ts';
import { BUILDINGS } from '../config/buildings.ts';
import { center } from '../../domain/navigation/grid.ts';

export class BuildingView {
  readonly node: Phaser.GameObjects.Container;
  private art: Phaser.GameObjects.Graphics;
  private last = '';
  constructor(scene: Phaser.Scene, b: Building) {
    const c = center(b.cell);
    this.art = scene.add.graphics();
    this.node = scene.add.container(c.x, c.y, [this.art]);
    this.node.setDepth(75 + Math.floor(c.y));
    this.update(b);
  }
  update(b: Building) {
    const status = `${b.stage}-${Math.floor(b.progress * 12)}-${Math.round(b.hp / 10)}`;
    if (status === this.last) return;
    this.last = status;
    const g = this.art; g.clear();
    g.fillStyle(0x152725, 0.55).fillEllipse(1, 10, 44, 20);
    if (b.stage === 'foundation') {
      g.fillStyle(0x9e8c69).fillRoundedRect(-16, -10, 32, 23, 3);
      g.lineStyle(2, 0xe2b770).strokeRect(-17, -11, 34, 25);
    } else if (b.kind === 'house') {
      g.fillStyle(0xb1a17e).fillRoundedRect(-18, -10, 36, 26, 3);
      g.fillStyle(0x563d37).fillTriangle(-23, -10, 0, -33, 23, -10);
      g.fillStyle(0x886347).fillRect(-4, 1, 8, 15);
      g.fillStyle(0xf4ce83).fillRect(9, -4, 6, 6);
    } else if (b.kind === 'farm') {
      g.fillStyle(0x6b583c).fillRoundedRect(-19, -14, 38, 30, 2);
      for (let i = 0; i < 4; i++) {
        g.lineStyle(3, 0x95b568).lineBetween(-12 + i * 8, -7, -12 + i * 8, 10);
        g.fillStyle(0xc0b95d).fillTriangle(-15 + i * 8, -5, -12 + i * 8, -15, -9 + i * 8, -5);
      }
    } else if (b.kind === 'warehouse') {
      g.fillStyle(0x9d8866).fillRoundedRect(-19, -14, 38, 30, 2);
      g.fillStyle(0x655047).fillTriangle(-23, -14, 0, -31, 23, -14);
      g.fillStyle(0x493f36).fillRect(-9, -6, 18, 22);
      g.lineStyle(2, 0xb9a07b).strokeRect(-9, -6, 18, 22).lineBetween(-9, -6, 9, 16);
    } else {
      g.fillStyle(0x614734).fillRoundedRect(-22, -16, 44, 31, 2);
      for (let i = 0; i < 5; i++) {
        g.fillStyle(i % 2 ? 0x99754e : 0x826141).fillRoundedRect(-21 + i * 9, -20 + i % 2 * 3, 8, 34, 2);
        g.fillStyle(0xc1a071).fillTriangle(-21 + i * 9, -20 + i % 2 * 3, -17 + i * 9, -28 + i % 2 * 3, -13 + i * 9, -20 + i % 2 * 3);
      }
    }
    if (b.stage !== 'complete') {
      g.fillStyle(0x202b27, 0.6).fillRect(-19, 18, 38, 5);
      g.fillStyle(0xedca79).fillRect(-19, 18, 38 * b.progress, 5);
      g.lineStyle(1.5, 0xe6c786).lineBetween(-22, -20, 22, 18).lineBetween(22, -20, -22, 18);
    } else if (b.hp < BUILDINGS[b.kind].maxHp) {
      g.fillStyle(0x121e1c).fillRect(-17, 19, 34, 4);
      g.fillStyle(0xe8ad7b).fillRect(-17, 19, 34 * b.hp / BUILDINGS[b.kind].maxHp, 4);
    }
  }
  destroy() { this.node.destroy(); }
}
