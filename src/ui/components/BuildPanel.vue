<script setup lang="ts">
import type { BuildingKind, Stock, WorldState } from '../../domain/model/types.ts';
import { BUILDINGS, BUILDING_KINDS } from '../../game/config/buildings.ts';
const props = defineProps<{ active: BuildingKind | null; state: WorldState }>();
const emit = defineEmits<{ change: [kind: BuildingKind | null] }>();
const symbols: Record<BuildingKind, string> = { house: '⌂', farm: '❀', warehouse: '▤', palisade: '▥' };
function price(cost: Stock) { return (['wood', 'stone', 'food'] as const).filter(k => cost[k] > 0).map(k => `${k === 'wood' ? '木' : k === 'stone' ? '石' : '粮'} ${cost[k]}`).join(' · '); }
function affordable(cost: Stock) { return (['wood', 'stone', 'food'] as const).every(k => props.state.resources[k] >= cost[k]); }
</script>
<template>
  <div class="build-grid">
    <button v-for="kind in BUILDING_KINDS" :key="kind" class="build-card" :class="{ chosen: active === kind, unaffordable: !affordable(BUILDINGS[kind].cost) }" @click="emit('change', active === kind ? null : kind)">
      <span class="symbol">{{ symbols[kind] }}</span>
      <span class="description"><strong>{{ BUILDINGS[kind].name }}</strong><small>{{ BUILDINGS[kind].description }}</small><em>{{ price(BUILDINGS[kind].cost) }}</em></span>
    </button>
  </div>
  <p class="hint" v-if="active">已选择 {{ BUILDINGS[active].name }}：地图上绿色区域可建造，点击放置；再次点击建筑或按 Esc 退出。</p>
  <p class="hint" v-else>选择一种设施，在地图格子上放置工地，然后把居民岗位设为「施工」。</p>
</template>
<style scoped>
.build-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.build-card{text-align:left;display:flex;gap:8px;align-items:flex-start;min-height:91px;padding:12px 9px;background:#192f2d;border:1px solid #344a43;border-radius:10px;color:#ebecde;cursor:pointer}.build-card:hover{border-color:#84a48a}.build-card.chosen{border-color:#e1be7c;background:#3c4235;box-shadow:0 0 0 1px #d2b57955}.build-card.unaffordable em{color:#d1786e}.symbol{font-size:25px;color:#d8bd7b;line-height:1}.description{display:flex;flex-direction:column;gap:5px;min-width:0}.description strong{font-size:12px}.description small{font-size:10px;color:#91aba1;line-height:1.5}.description em{font-size:10px;color:#e5b980;font-style:normal}.hint{font-size:11px;color:#91a99e;line-height:1.65;margin:10px 0 0}
</style>
