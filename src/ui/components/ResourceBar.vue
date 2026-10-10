<script setup lang="ts">
import type { WorldState } from '../../domain/model/types.ts';
import { capacity } from '../../domain/rules/inventory.ts';
defineProps<{ state: WorldState }>();
const fmt = (value: number) => Number(value.toFixed(1)).toString();
const weatherName = { clear: '☀ 晴朗', rain: '☂ 降雨', storm: 'ϟ 暴风雨', cold: '❄ 寒潮' };
const weatherEffect = { clear: '生产正常', rain: '农渔 +25% · 其他 -15%', storm: '生产 -35% · 移速 -25%', cold: '狩猎 +25% · 其他 -15%' };
</script>
<template>
  <div class="resources">
    <div class="resource"><span class="resource-icon wood">▰</span><div><small>木材</small><strong>{{ fmt(state.resources.wood) }} <em>/ {{ capacity(state) }}</em></strong></div></div>
    <div class="resource"><span class="resource-icon stone">◆</span><div><small>石料</small><strong>{{ fmt(state.resources.stone) }} <em>/ {{ capacity(state) }}</em></strong></div></div>
    <div class="resource"><span class="resource-icon food">✿</span><div><small>食物</small><strong>{{ fmt(state.resources.food) }} <em>/ {{ capacity(state) }}</em></strong></div></div>
    <div class="weather"><small>天气</small><strong>{{ weatherName[state.weather] }}</strong><em>{{ weatherEffect[state.weather] }} · 食谱 {{ state.foodVariety.length }} 种</em></div>
  </div>
</template>
<style scoped>
.resources { display:flex; flex-wrap:wrap; gap:18px; align-items:center; }
.resource { display:flex; gap:9px; align-items:center; min-width:98px; }
.resource div { display:flex; flex-direction:column; gap:1px; }
.resource small { color:#a7bab0; letter-spacing:1px; font-size:10px; }
.resource strong { font-family:Georgia,serif; color:#f5e4b4; font-size:18px; font-weight:normal; white-space:nowrap; }
.resource em {font: normal 10px sans-serif; color:#748b81;}
.resource-icon {width:28px;height:28px;display:grid;place-items:center;border:1px solid #496156;background:#223a34;border-radius:7px;font-size:15px;}
.wood {color:#d5ab6f}.stone{color:#a7c5cc}.food{color:#aace83}
.weather{display:grid;gap:1px;padding-left:13px;border-left:1px solid #40574e}.weather small{color:#8fa79c;font-size:9px}.weather strong{color:#d6e2d7;font-size:12px}.weather em{font-style:normal;color:#86a496;font-size:9px}
</style>
