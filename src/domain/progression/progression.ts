import type { Person } from '../model/types.ts';
import { BALANCE } from '../../game/config/balance.ts';
export const maxHp = (p: Pick<Person, 'role' | 'level'>) => BALANCE.maxHp[p.role] + (p.role === 'resident' ? 10 * (p.level - 1) : 0);
export const attack = (p: Pick<Person, 'role' | 'level'>) => BALANCE.attack[p.role] + (p.role === 'resident' ? 2 * (p.level - 1) : 0);
export const defense = (p: Pick<Person, 'role' | 'level'>) => BALANCE.defense[p.role] + (p.role === 'resident' ? Math.floor((p.level - 1) / 2) : 0);
export const workEfficiency = (p: Person, skill: keyof Person['skills']) => (1 + p.skills[skill] * 0.09) * (1 + (p.level - 1) * 0.05);
export const requiredXp = (level: number) => level * 50;
export function grantXp(p: Person, value: number): number {
  if (p.role !== 'resident' || value <= 0 || p.level >= 10) return 0;
  p.exp += value;
  let grown = 0;
  while (p.level < 10 && p.exp >= requiredXp(p.level)) {
    p.exp -= requiredXp(p.level);
    p.level++;
    grown++;
  }
  if (p.level === 10) p.exp = 0;
  return grown;
}
