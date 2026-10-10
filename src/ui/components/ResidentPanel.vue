<script setup lang="ts">
import type { Job, Person } from '../../domain/model/types.ts';
import { maxHp, requiredXp } from '../../domain/progression/progression.ts';
const props = defineProps<{ residents: Person[]; selectedIds: string[] }>();
const emit = defineEmits<{ assign: [personId: string, job: Job]; select: [id: string] }>();
const jobs: { value: Job; label: string }[] = [
  { value: 'idle', label: '空闲' }, { value: 'wood', label: '伐木' }, { value: 'stone', label: '采石' },
  { value: 'farm', label: '务农' }, { value: 'forage', label: '捕鱼 / 狩猎 / 采果' },
  { value: 'build', label: '施工' }, { value: 'rest', label: '休息' },
];
const lifeName: Record<Person['life'], string> = { active: '健康', downed: '倒地', wounded: '休养', dead: '阵亡', prisoner: '被俘', released: '离开' };
</script>
<template>
  <div class="resident-list">
    <div v-for="person in props.residents" :key="person.id" class="resident" :class="{ active: selectedIds.includes(person.id), unavailable: person.life !== 'active' }">
      <button class="resident-heading" @click="emit('select',person.id)">
        <span class="avatar">{{ person.name.charAt(0) }}</span>
        <span class="resident-title"><strong>{{ person.name }}</strong><small>Lv.{{ person.level }} · {{ lifeName[person.life] }}</small></span>
        <span class="hp">{{ Math.ceil(person.hp) }}/{{ maxHp(person) }} ♥</span>
      </button>
      <div class="exp-track"><div :style="{ width: `${person.level === 10 ? 100 : person.exp / requiredXp(person.level) * 100}%` }"></div></div>
      <div class="assign-row">
        <span>工作岗位</span>
        <select :disabled="person.life !== 'active'" :value="person.job" @change="emit('assign',person.id,($event.target as HTMLSelectElement).value as Job)">
          <option v-for="job in jobs" :key="job.value" :value="job.value">{{ job.label }}</option>
        </select>
      </div>
    </div>
  </div>
</template>
<style scoped>
.resident-list{display:grid;gap:8px}.resident{padding:10px 11px;border:1px solid #304842;border-radius:9px;background:#192f2d;transition:background .15s,border-color .15s}.resident.active{border-color:#d2b374;background:#273a33}.resident.unavailable{opacity:.65}
.resident-heading{padding:0;border:0;background:none;display:flex;align-items:center;text-align:left;width:100%;color:inherit;cursor:pointer;gap:9px}.avatar{width:31px;height:31px;display:grid;place-items:center;color:#f2d394;background:#3c574d;border-radius:50%;font-family:serif}.resident-title{display:grid;gap:3px;min-width:0;flex:1}.resident-title strong{font-size:12px;font-weight:600}.resident-title small{font-size:10px;color:#8da9a0}.hp{font-size:9px;color:#d2b891}.exp-track{margin:9px 0 8px;height:3px;background:#354941;border-radius:4px;overflow:hidden}.exp-track div{height:100%;background:#cfaf6e}.assign-row{display:flex;align-items:center;justify-content:space-between;gap:8px;color:#819e94;font-size:11px}.assign-row select{background:#263e38;color:#e9e6d6;border:1px solid #426158;border-radius:5px;padding:4px 8px;font-size:11px;min-width:100px;cursor:pointer}
</style>
