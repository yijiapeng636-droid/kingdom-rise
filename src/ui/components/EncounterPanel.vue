<script setup lang="ts">
import { computed } from 'vue';
import type { Encounter, Person } from '../../domain/model/types.ts';
const props = defineProps<{ encounter: Encounter | null; persons: Person[] }>();
const emit = defineEmits<{ loot: []; release: [personId: string]; recruit: [personId: string]; focus: [] }>();
const personName = (id: string) => props.persons.find(p => p.id === id)?.name ?? id;
const person = (id: string) => props.persons.find(p => p.id === id);
const captiveIds = computed(() => props.persons.filter(p => p.life === 'prisoner').map(p => p.id));
</script>
<template>
  <div v-if="encounter" class="encounter" :class="encounter.phase">
    <div class="encounter-status"><span class="dot"></span><strong>{{ encounter.phase === 'active' ? '营地遭到袭击！' : encounter.phase === 'victory' ? '防御成功' : '防线被突破' }}</strong></div>
    <template v-if="encounter.phase === 'active'">
      <p>强盗 {{ encounter.raiderIds.filter(id=>persons.some(p=>p.id===id && p.life==='active')).length }} / {{ encounter.raiderIds.length }} 人仍在战斗。选中己方单位并右键攻击。</p>
      <button class="primary-btn" @click="emit('focus')">定位袭击位置 ↗</button>
    </template>
    <template v-else>
      <p>阵亡 {{ encounter.casualties.length }} 人 · 伤员 {{ encounter.injured.length }} 人 · 俘虏 {{ encounter.prisoners.length }} 人</p>
      <div v-if="encounter.phase === 'victory'" class="spoils">
        <span>待领战利品：木 {{ encounter.loot.wood }} · 石 {{ encounter.loot.stone }} · 食 {{ encounter.loot.food }}</span>
        <button class="primary-btn" :disabled="encounter.lootClaimed" @click="emit('loot')">{{ encounter.lootClaimed ? '已全部领取' : '领取战利品' }}</button>
        <div v-for="id in captiveIds" :key="id">
          <div v-if="person(id)?.life==='prisoner'" class="captive">
            <div class="captive-head"><span>⛓ {{ personName(id) }}</span><strong>{{ Math.floor(person(id)?.recruitProgress ?? 0) }}%</strong></div>
            <div class="recruit-track"><div :style="{width:(person(id)?.recruitProgress ?? 0)+'%'}"></div></div>
            <div class="captive-actions"><button @click="emit('release',id)">释放</button><button class="recruit" :disabled="(person(id)?.recruitProgress ?? 0)<100" @click="emit('recruit',id)">招募</button></div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
<style scoped>
.encounter{border:1px solid #855f47;background:#3c312b;border-radius:10px;padding:12px}.encounter.victory{border-color:#6a856a;background:#283a31}.encounter-status{display:flex;align-items:center;gap:8px;color:#f5c99b;font-size:13px}.encounter.victory .encounter-status{color:#badd9b}.dot{width:8px;height:8px;border-radius:50%;background:#df886e;box-shadow:0 0 8px #da8068}.encounter.victory .dot{background:#a1c48e;box-shadow:0 0 8px #a1c48e}.encounter p{font-size:11px;color:#c2b5a6;line-height:1.7;margin:9px 0}.primary-btn{background:#d6b878;color:#1e2d28;border:0;border-radius:5px;padding:7px 11px;cursor:pointer;font-weight:bold;font-size:11px}.primary-btn:disabled{opacity:.6;cursor:default}.spoils{display:grid;gap:9px;color:#baccb9;font-size:11px}.captive{display:grid;gap:7px;padding:9px 0;border-top:1px solid #42604c}.captive-head,.captive-actions{display:flex;align-items:center;justify-content:space-between}.captive-head strong{color:#d9c080;font-size:10px}.recruit-track{height:5px;background:#1d2f28;border-radius:4px;overflow:hidden}.recruit-track div{height:100%;background:linear-gradient(90deg,#718a62,#d0bd70)}.captive-actions{justify-content:flex-end;gap:6px}.captive button{color:#f2d6a0;background:#3d5344;border:1px solid #67806c;border-radius:4px;padding:4px 9px;cursor:pointer}.captive button.recruit{background:#d0b46f;color:#203128}.captive button:disabled{opacity:.35;cursor:not-allowed;filter:grayscale(1)}
</style>
