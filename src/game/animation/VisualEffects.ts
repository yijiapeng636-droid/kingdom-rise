import Phaser from 'phaser';
import type { Point } from '../../domain/model/types.ts';
import { ANIMATION, type UnitAction } from './animationConfig.ts';

type Particle = {
  x: number; y: number; vx: number; vy: number;
  age: number; duration: number; radius: number; color: number;
};
type FloatLabel = { object: Phaser.GameObjects.Text; x: number; y: number; age: number; duration: number };

/** One light-weight particle canvas for the whole world. No tweens or timers that run during pause. */
export class VisualEffects {
  private graphics: Phaser.GameObjects.Graphics;
  private particles: Particle[] = [];
  private labels: FloatLabel[] = [];

  constructor(private scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(40000);
  }
  private emit(at: Point, count: number, color: number, strength = 1) {
    if (!ANIMATION.showParticles) return;
    for (let i = 0; i < count; i++) {
      // VFX randomness never touches the simulation RNG or persistent data.
      const rad = Math.random() * Math.PI * 2;
      const velocity = (18 + Math.random() * 35) * strength;
      this.particles.push({
        x: at.x, y: at.y, vx: Math.cos(rad) * velocity,
        vy: -Math.abs(Math.sin(rad) * velocity) - 8,
        age: 0, duration: 0.35 + Math.random() * 0.4,
        radius: 1 + Math.random() * 2.2, color,
      });
    }
    if (this.particles.length > 250) this.particles.splice(0, this.particles.length - 250);
  }
  work(position: Point, action: UnitAction) {
    const color = action === 'wood' ? ANIMATION.palette.wood : action === 'stone' ? ANIMATION.palette.stone
      : action === 'farm' || action === 'food' ? ANIMATION.palette.food : ANIMATION.palette.build;
    this.emit({ x: position.x + 7, y: position.y - 12 }, 2, color, 0.5);
  }
  attack(position: Point, isRaider: boolean) {
    this.emit({ x: position.x + 10, y: position.y - 22 }, 6,
      isRaider ? ANIMATION.palette.hit : 0xffe19c, 0.8);
  }
  damage(position: Point, amount: number) {
    this.emit({ x: position.x, y: position.y - 20 }, 9, ANIMATION.palette.hit, 1.1);
    this.label({ x: position.x, y: position.y - 37 }, `-${amount}`, '#ffc0a6', 0.85);
  }
  finished(position: Point) {
    this.emit({ x: position.x, y: position.y - 19 }, 28, ANIMATION.palette.build, 1.5);
    this.label({ x: position.x, y: position.y - 38 }, '建造完成!', '#ffdf91', 1.5);
  }
  raid(position: Point) {
    this.emit(position, 28, ANIMATION.palette.hit, 2);
    this.label({ x: position.x, y: position.y - 38 }, '⚔ 敌袭！', '#ff9c83', 1.8);
  }
  level(position: Point) {
    this.emit({ x: position.x, y: position.y - 24 }, 15, 0x90dba9, 1.2);
    this.label({ x: position.x, y: position.y - 52 }, '升级！', '#bdf3bb', 1.3);
  }
  private label(position: Point, content: string, color: string, duration: number) {
    const object = this.scene.add.text(position.x, position.y, content, {
      fontFamily: 'Arial, sans-serif', fontSize: '12px', fontStyle: 'bold', color,
      stroke: '#152725', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(40001);
    this.labels.push({ object, x: position.x, y: position.y, age: 0, duration });
  }
  update(gameDelta: number) {
    const dt = Math.max(0, Math.min(gameDelta, 0.15));
    const g = this.graphics;
    g.clear();
    this.particles = this.particles.filter(p => {
      p.age += dt;
      if (p.age >= p.duration) return false;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 25 * dt;
      const opacity = Math.max(0, 1 - p.age / p.duration);
      g.fillStyle(p.color, opacity).fillCircle(p.x, p.y, p.radius * (0.4 + opacity * 0.6));
      return true;
    });
    this.labels = this.labels.filter(label => {
      label.age += dt;
      if (label.age >= label.duration) { label.object.destroy(); return false; }
      const progress = label.age / label.duration;
      label.object.setY(label.y - progress * 22).setAlpha(1 - progress);
      return true;
    });
  }
  destroy() {
    this.graphics.destroy();
    for (const label of this.labels) label.object.destroy();
    this.labels = []; this.particles = [];
  }
}
