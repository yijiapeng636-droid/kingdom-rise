import type { WorldState } from '../model/types.ts';
import { attack, defense } from '../progression/progression.ts';
import { BALANCE } from '../../game/config/balance.ts';
import { center, distance } from '../navigation/grid.ts';

export interface AttackIntent { attackerId: string; targetId: string; damage: number }
export function collectAttacks(w: WorldState): AttackIntent[] {
  const hits: AttackIntent[] = [];
  for (const p of w.persons) {
    if (p.life !== 'active' || p.order.type !== 'attack' || p.cooldown > 0) continue;
    const targetId = p.order.targetId;
    const person = w.persons.find(x => x.id === targetId && x.life === 'active' && x.team !== p.team);
    const wall = p.team === 'raiders' ? w.buildings.find(x => x.id === targetId && x.hp > 0) : undefined;
    const targetPosition = person?.position ?? (wall ? center(wall.cell) : undefined);
    if (!targetPosition || distance(p.position, targetPosition) > BALANCE.attackRange[p.role]) continue;
    hits.push({ attackerId: p.id, targetId, damage: Math.max(1, attack(p) - (person ? defense(person) : 3)) });
    p.cooldown = BALANCE.attackInterval[p.role];
  }
  return hits;
}
/** Attacks are captured before application; two mutually lethal attacks both count. */
export function applyAttacks(w: WorldState, attacks: AttackIntent[], event: (kind: string, message: string) => void): void {
  for (const hit of attacks) {
    const attacker = w.persons.find(p => p.id === hit.attackerId);
    const p = w.persons.find(p => p.id === hit.targetId);
    if (p && p.life === 'active') {
      const applied = Math.min(p.hp, hit.damage);
      p.hp = Math.max(0, p.hp - hit.damage);
      if (attacker && attacker.team === 'settlement' && p.team === 'raiders') attacker.combatContribution += applied;
      p.aggroTimer = 4;
      if (p.hp === 0) {
        p.life = 'downed'; p.downedTimer = 0; p.path = []; p.order = { type: 'hold' }; p.manualOrder = false;
        event('combat', `${p.name} 倒地！`);
      }
    } else {
      const b = w.buildings.find(b => b.id === hit.targetId);
      if (b && b.hp > 0) {
        b.hp = Math.max(0, b.hp - hit.damage);
        if (b.hp === 0) {
          w.buildings = w.buildings.filter(v => v.id !== b.id);
          event('combat', `${b.kind === 'palisade' ? '木栅栏' : '建筑'}被摧毁！`);
        }
      }
    }
  }
}
