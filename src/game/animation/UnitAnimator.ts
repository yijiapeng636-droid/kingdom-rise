import Phaser from 'phaser';
import type { Person } from '../../domain/model/types.ts';
import { ANIMATION, type UnitAction } from './animationConfig.ts';

/** Programmatic placeholder art: leg steps, bob, swinging tools and a single attack swing.
 *  Replace this class with a sprite-sheet animator later; UnitView needn't change. */
export class UnitAnimator {
  readonly image: Phaser.GameObjects.Graphics;
  private action: UnitAction = 'idle';
  private actionTime = 0;
  private attackRemaining = 0;
  private hitRemaining = 0;
  private previousCooldown: number | undefined;
  private previousHp: number | undefined;
  private facing = 1;

  constructor(scene: Phaser.Scene) { this.image = scene.add.graphics(); }

  /** Returns a one-shot display event; no damage or resource calculations happen here. */
  update(person: Readonly<Person>, action: UnitAction, gameDelta: number): { attack: boolean; damage: number } {
    const dt = Math.max(0, Math.min(gameDelta, ANIMATION.maxVisualDelta * 2));
    const damaged = this.previousHp !== undefined && person.hp < this.previousHp
      ? Math.max(0, Math.round((this.previousHp - person.hp) * 10) / 10) : 0;
    const attacked = this.previousCooldown !== undefined && person.cooldown > this.previousCooldown + 0.15
      && person.order.type === 'attack' && action === 'combat';
    if (damaged) this.hitRemaining = ANIMATION.hitFlashSeconds;
    if (attacked) this.attackRemaining = ANIMATION.attackSwingSeconds;
    this.hitRemaining = Math.max(0, this.hitRemaining - dt);
    this.attackRemaining = Math.max(0, this.attackRemaining - dt);
    this.previousCooldown = person.cooldown;
    this.previousHp = person.hp;

    if (action !== this.action) { this.action = action; this.actionTime = 0; }
    this.actionTime += dt;
    if (person.position.x - person.previousPosition.x > 0.05) this.facing = 1;
    if (person.position.x - person.previousPosition.x < -0.05) this.facing = -1;
    this.draw(person);
    return { attack: attacked, damage: damaged };
  }

  private draw(p: Readonly<Person>) {
    const g = this.image;
    g.clear();
    const action = this.action;
    const cycle = this.actionTime * ANIMATION.cadence[action] * Math.PI * 2;
    const oscillation = Math.sin(cycle);
    const walking = action === 'walk';
    const working = ['wood', 'stone', 'food', 'farm', 'build'].includes(action);
    const incapacitated = ['downed', 'wounded', 'prisoner'].includes(action);
    const bounce = walking ? Math.abs(oscillation) * 2.7
      : working ? Math.max(0, oscillation) * 1.15
      : action === 'idle' ? Math.sin(cycle) * 0.65 : 0;
    const b = -bounce;
    const raider = p.team === 'raiders';
    const leader = p.role === 'leader';
    const suit = raider ? ANIMATION.palette.raider : leader ? ANIMATION.palette.leader : ANIMATION.palette.resident;
    const facing = this.facing;

    // Shadow remains on the ground while the character moves.
    g.fillStyle(0x051c19, 0.37).fillEllipse(0, 3, walking ? 24 : 21, 8);
    if (action === 'downed') {
      g.fillStyle(0x202a2a).fillRoundedRect(-17, -8, 33, 11, 4);
      g.fillStyle(suit).fillRoundedRect(-15, -10, 25, 10, 4);
      g.fillStyle(0xd5a981).fillCircle(15, -6, 6);
      g.lineStyle(2, 0xd7b9a0, 0.8).lineBetween(6, -17, 11, -17).lineBetween(8.5, -19.5, 8.5, -14.5);
      return;
    }

    const step = walking ? oscillation * 4.3 : 0;
    const leftFootX = -5 + step, rightFootX = 5 - step;
    const leftFootY = -1 - (walking ? Math.max(0, oscillation) * 3 : 0);
    const rightFootY = -1 - (walking ? Math.max(0, -oscillation) * 3 : 0);
    g.lineStyle(4, 0x283333).lineBetween(-4, -11 + b, leftFootX, leftFootY)
      .lineBetween(4, -11 + b, rightFootX, rightFootY);
    g.fillStyle(0x1d2928).fillRoundedRect(leftFootX - 3, leftFootY - 1, 6, 3, 1)
      .fillRoundedRect(rightFootX - 3, rightFootY - 1, 6, 3, 1);

    const lean = working ? oscillation * 1.3 : walking ? oscillation * 0.8 : 0;
    g.fillStyle(0x1b292a).fillRoundedRect(-8 + lean, -24 + b, 16, 20, 5);
    g.fillStyle(suit).fillRoundedRect(-7 + lean, -25 + b, 14, 17, 4);
    g.fillStyle(0xb9b091, 0.6).fillRect(-7 + lean, -12 + b, 14, 2);
    g.fillStyle(raider ? 0x996a61 : 0xd5a981).fillCircle(lean, -30 + b, 7);
    g.fillStyle(0x292b2c).fillRect(-5 + lean, -35 + b, 10, 4);

    if (leader) {
      g.fillStyle(0xf7e59c).fillTriangle(-6 + lean, -37 + b, -3 + lean, -45 + b, 0 + lean, -37 + b)
        .fillTriangle(0 + lean, -37 + b, 3 + lean, -45 + b, 7 + lean, -37 + b);
    }
    // Eye indicates travel direction; blink periodically while idle.
    if (!(action === 'idle' && this.actionTime % 4.3 > 4.1)) {
      g.fillStyle(0x252a27).fillCircle(3.2 * facing + lean, -30 + b, 1.1);
    }

    const shoulder = { x: 6 * facing + lean, y: -20 + b };
    const hand = { x: 9 * facing + lean, y: -13 + b };
    const attackProgress = this.attackRemaining > 0
      ? 1 - this.attackRemaining / ANIMATION.attackSwingSeconds : -1;

    if (action === 'food') {
      const reach = (oscillation + 1) * 4;
      g.lineStyle(4, raider ? 0x996a61 : 0xd5a981)
        .lineBetween(shoulder.x, shoulder.y, hand.x + reach * facing, hand.y - 12 - reach);
      g.fillStyle(0xe3ba66).fillCircle(hand.x + reach * facing, hand.y - 14 - reach, 3.5);
    } else if (working || action === 'combat' || leader) {
      let angle: number;
      let item: 'axe' | 'pick' | 'hoe' | 'hammer' | 'sword';
      switch (action) {
        case 'wood': item = 'axe'; angle = -1.1 + (oscillation + 1) * 0.86; break;
        case 'stone': item = 'pick'; angle = -1.35 + (oscillation + 1) * 0.89; break;
        case 'farm': item = 'hoe'; angle = 0.27 + oscillation * 0.53; break;
        case 'build': item = 'hammer'; angle = -1.4 + (oscillation + 1) * 0.92; break;
        default:
          item = 'sword';
          angle = attackProgress >= 0 ? -1.8 + attackProgress * 3.2 : -0.35 + Math.sin(cycle) * 0.07;
      }
      const hx = hand.x + Math.cos(angle) * 3 * facing;
      const hy = hand.y + Math.sin(angle) * 3;
      g.lineStyle(4, raider ? 0x996a61 : 0xd5a981).lineBetween(shoulder.x, shoulder.y, hx, hy);
      this.drawTool(g, item, hx, hy, angle, facing);
    } else {
      const armOffset = walking ? oscillation * 4 : 0;
      g.lineStyle(4, raider ? 0x996a61 : 0xd5a981)
        .lineBetween(shoulder.x, shoulder.y, hand.x, hand.y + armOffset);
    }
    g.lineStyle(4, raider ? 0x996a61 : 0xd5a981)
      .lineBetween(-7 * facing + lean, -20 + b, -9 * facing + lean, -12 + b + (walking ? -step : 0));
    if (incapacitated) {
      g.fillStyle(0x16231e, 0.33).fillRoundedRect(-11, -39, 23, 40, 5);
      if (action === 'prisoner') g.lineStyle(2, 0xb3b9a4).lineBetween(-8, -14, 9, -14);
    }
    if (this.hitRemaining > 0) {
      g.fillStyle(0xff8276, 0.45 * (this.hitRemaining / ANIMATION.hitFlashSeconds))
        .fillCircle(0, -23, 17);
    }
  }

  private drawTool(g: Phaser.GameObjects.Graphics, item: string, x: number, y: number, a: number, f: number) {
    // Positive facing flips the entire tool consistently with the character.
    const dx = Math.cos(a) * f, dy = Math.sin(a);
    const px = -dy, py = dx;
    const length = item === 'sword' ? 23 : 20;
    const tipX = x + dx * length, tipY = y + dy * length;
    g.lineStyle(item === 'sword' ? 3.4 : 2.8, item === 'sword' ? 0xe1e9d4 : 0x94724f)
      .lineBetween(x, y, tipX, tipY);
    if (item === 'sword') {
      g.lineStyle(3.5, 0xebcf8b).lineBetween(x + dx * 4 + px * 5, y + dy * 4 + py * 5,
        x + dx * 4 - px * 5, y + dy * 4 - py * 5);
      g.fillStyle(0xffffff).fillCircle(tipX, tipY, 1.5);
    } else if (item === 'hoe') {
      g.lineStyle(4, 0xa6b6a6).lineBetween(tipX, tipY, tipX + px * 10, tipY + py * 10);
    } else if (item === 'axe') {
      g.lineStyle(6, 0xa3bbbc).lineBetween(tipX - px * 5, tipY - py * 5,
        tipX + px * 5, tipY + py * 5);
      g.fillStyle(0xdbe5df).fillCircle(tipX + px * 5, tipY + py * 5, 2);
    } else if (item === 'pick') {
      g.lineStyle(3.4, 0xaebfbd).lineBetween(tipX - px * 10, tipY - py * 10,
        tipX + px * 10, tipY + py * 10);
    } else {
      g.lineStyle(7, 0xaeb9af).lineBetween(tipX - dx * 2 - px * 5, tipY - dy * 2 - py * 5,
        tipX - dx * 2 + px * 5, tipY - dy * 2 + py * 5);
    }
  }
  destroy() { this.image.destroy(); }
}
