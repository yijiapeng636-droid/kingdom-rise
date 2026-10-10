import Phaser from 'phaser';
import type { Person, WorldState } from '../../domain/model/types.ts';
import { maxHp } from '../../domain/progression/progression.ts';
import { resolveUnitAction } from '../animation/resolveUnitAction.ts';
import { UnitAnimator } from '../animation/UnitAnimator.ts';
import { VisualEffects } from '../animation/VisualEffects.ts';
import { ANIMATION, type UnitAction } from '../animation/animationConfig.ts';

/** Visual adapter only. Unit state and damage remain the responsibility of Simulation. */
export class UnitView {
  readonly node: Phaser.GameObjects.Container;
  private animator: UnitAnimator;
  private hp: Phaser.GameObjects.Graphics;
  private rank: Phaser.GameObjects.Text;
  private lastAction: UnitAction = 'idle';
  private particleTimer = 0;
  private previousLevel: number;
  private initialized = false;

  constructor(scene: Phaser.Scene, person: Person, private effects: VisualEffects) {
    this.animator = new UnitAnimator(scene);
    this.hp = scene.add.graphics();
    this.rank = scene.add.text(0, -45, '', {
      fontFamily: 'Arial, sans-serif', fontSize: '10px', color: '#f8f4d8',
      stroke: '#132322', strokeThickness: 3,
    }).setOrigin(0.5);
    this.node = scene.add.container(person.position.x, person.position.y,
      [this.animator.image, this.hp, this.rank]);
    this.previousLevel = person.level;
  }

  update(person: Person, world: Readonly<WorldState>, alpha: number, selected: boolean, gameDelta: number) {
    const pos = person.position, before = person.previousPosition;
    this.node.setPosition(before.x + (pos.x - before.x) * alpha, before.y + (pos.y - before.y) * alpha);
    this.node.setDepth(100 + Math.floor(this.node.y));
    const alive = person.life !== 'dead' && person.life !== 'released';
    this.node.setVisible(alive);
    if (!alive) return;

    const action = resolveUnitAction(person, world);
    const visualEvent = this.animator.update(person, action, gameDelta);
    if (this.initialized && visualEvent.attack) this.effects.attack(this.node, person.team === 'raiders');
    if (this.initialized && visualEvent.damage > 0) this.effects.damage(this.node, visualEvent.damage);
    if (this.initialized && person.level > this.previousLevel) this.effects.level(this.node);
    this.previousLevel = person.level;
    this.initialized = true;

    const working = action === 'wood' || action === 'stone' || action === 'food'
      || action === 'farm' || action === 'build';
    if (action !== this.lastAction) this.particleTimer = 0;
    this.lastAction = action;
    if (working && gameDelta > 0) {
      this.particleTimer += gameDelta;
      if (this.particleTimer >= ANIMATION.workParticlesSeconds) {
        this.particleTimer %= ANIMATION.workParticlesSeconds;
        this.effects.work(this.node, action);
      }
    }

    this.hp.clear();
    this.hp.fillStyle(0x061b1c, 0.85).fillRoundedRect(-14, -42, 28, 4, 2);
    this.hp.fillStyle(person.team === 'raiders' ? 0xff8072 : 0x7bd3a3)
      .fillRoundedRect(-13, -41, Math.max(0, 26 * person.hp / maxHp(person)), 2, 1);
    if (selected) this.hp.lineStyle(1.3, 0xffe1a1).strokeEllipse(0, 0, 29, 13);
    if (person.life === 'downed') this.rank.setText('✚ 倒地');
    else if (person.life === 'wounded') this.rank.setText('✚ 休养中');
    else if (person.life === 'prisoner') this.rank.setText('⛓ 俘虏');
    else this.rank.setText(person.role === 'leader' ? '✦ 领袖' : person.name);
    this.rank.setColor(person.role === 'leader' ? '#ffdf93'
      : person.team === 'raiders' ? '#ffbbb5' : '#f8f4d8');
  }
  destroy() { this.node.destroy(); }
}
