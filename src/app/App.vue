<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { GameBridge } from './gameBridge.ts';
import { createInitialState } from '../domain/model/initialState.ts';
import type { BuildingKind, GameCommand, Job, Person, WorldState } from '../domain/model/types.ts';
import { BALANCE } from '../game/config/balance.ts';
import { attack, defense, maxHp, requiredXp } from '../domain/progression/progression.ts';
import { jobName } from '../application/Simulation.ts';
import ResourceBar from '../ui/components/ResourceBar.vue';
import BuildPanel from '../ui/components/BuildPanel.vue';
import ResidentPanel from '../ui/components/ResidentPanel.vue';
import EncounterPanel from '../ui/components/EncounterPanel.vue';

const bridge = new GameBridge();
const state = ref<WorldState>(createInitialState());
const selectedIds = ref<string[]>([]);
const selectedBuildingId = ref<string | null>(null);
const buildMode = ref<BuildingKind | null>(null);
const followMode = ref(true);
const notice = ref('左键选择单位；右键下达移动、采集或攻击命令。');
const noticeGood = ref(true);
const activeTab = ref<'residents' | 'buildings'>('residents');
let stop: (() => void) | undefined;
let noticeTimeout: ReturnType<typeof setTimeout> | undefined;
const leader = computed(() => state.value.persons.find(p => p.role === 'leader'));
const residents = computed(() => state.value.persons.filter(p => p.role === 'resident'));
const selectedPerson = computed(() => state.value.persons.find(p => selectedIds.value.includes(p.id)));
const selectedBuilding = computed(() => state.value.buildings.find(b => b.id === selectedBuildingId.value));
const currentEnc = computed(() => state.value.encounter);
const hour = computed(() => Math.floor((state.value.time % BALANCE.daySeconds) / BALANCE.daySeconds * 24));
const population = computed(() => residents.value.filter(p => !['dead', 'released'].includes(p.life)).length);
const available = computed(() => residents.value.filter(p => p.life === 'active').length);
const alerts = computed(() => [...state.value.events].reverse().slice(0, 6));
const builtCount = computed(() => state.value.buildings.filter(b => b.stage === 'complete').length);
function toast(message: string, success = true) {
  notice.value = message; noticeGood.value = success;
  if (noticeTimeout) clearTimeout(noticeTimeout);
  noticeTimeout = setTimeout(() => { notice.value = '左键选中单位，右键移动 / 采集 / 攻击'; noticeGood.value = true; }, 4300);
}
function send(cmd: GameCommand) { const out = bridge.controller.command(cmd); toast(out.message, out.ok); }
function chooseBuild(kind: BuildingKind | null) { buildMode.value = kind; bridge.setBuildMode(kind); if (kind) { activeTab.value = 'buildings'; toast('请在地图上选择绿色格子放置建筑'); } }
function reset() {
  if (!window.confirm('确定新建营地吗？当前本地存档会被覆盖。')) return;
  bridge.controller.newGame(); chooseBuild(null); selectedIds.value = []; selectedBuildingId.value = null;
  bridge.followLeader(); followMode.value = true; toast('新营地已建立');
}
function selectResident(id: string) { selectedIds.value = [id]; selectedBuildingId.value = null; bridge.selectUnits([id]); }
function saveManually() { const saved = bridge.save(); toast(saved ? '存档已保存' : '保存失败，请检查浏览器存储权限', saved); }
function formatTime() { return `${String(hour.value).padStart(2, '0')}:00`; }
function activeStatus(p: Person): string {
  return p.life === 'wounded' ? '休养中' : p.life === 'downed' ? '倒地待救援' : p.life === 'dead' ? '已阵亡' : p.manualOrder ? '执行玩家命令' : p.role === 'resident' ? jobName(p.job) : '待命';
}
const beforeUnload = () => bridge.save();
onMounted(() => {
  stop = bridge.subscribe(s => { state.value = s; });
  bridge.mount('game-canvas', {
    selection(ids, buildingId) { selectedIds.value = ids; selectedBuildingId.value = buildingId; },
    feedback: toast,
    focusChanged(v) { followMode.value = v; },
    buildModeChanged(v) { buildMode.value = v; },
  });
  if (bridge.controller.restored) toast('已恢复上次营地存档');
  window.addEventListener('pagehide', beforeUnload);
});
onUnmounted(() => {
  if (noticeTimeout) clearTimeout(noticeTimeout);
  stop?.(); window.removeEventListener('pagehide', beforeUnload); bridge.destroy();
});
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand"><span class="brand-mark">♜</span><div><span class="eyebrow">KINGDOM RISE · MVP</span><strong>王国崛起 <small>／ 边境营地</small></strong></div></div>
      <ResourceBar :state="state" />
      <div class="top-controls">
        <div class="calendar"><span>第 {{ state.day }} 日</span><small>{{ formatTime() }} · {{ state.encounter?.phase==='active' ? '正在遭袭' : '边境警戒中' }}</small></div>
        <button class="icon-btn" @click="send({type:'pause',value:!state.paused})" :title="state.paused ? '继续':'暂停'">{{ state.paused ? '▶' : 'Ⅱ' }}</button>
        <button class="speed-btn" @click="send({type:'speed',value:state.speed===1?2:1})">{{ state.speed }}×</button>
        <button class="header-save" @click="saveManually()">保存</button>
      </div>
    </header>

    <div class="layout">
      <aside class="sidebar left">
        <section class="welcome"><span class="section-overline">前线指挥部 · CAMP COMMAND</span><h1>一片荒野，<br/>一个王国的起点。</h1><p>建造、生产、守护居民。所有变化都发生在同一片营地。</p></section>
        <section class="panel-section"><div class="section-heading"><h2>营地概况</h2><span class="caption">LIVE STATUS</span></div>
          <div class="metrics">
            <div class="metric"><small>在册居民</small><strong>{{ population }} <em>人</em></strong></div>
            <div class="metric"><small>可劳动</small><strong>{{ available }} <em>人</em></strong></div>
            <div class="metric"><small>完成建筑</small><strong>{{ builtCount }} <em>座</em></strong></div>
            <div class="metric"><small>在建工地</small><strong>{{ state.buildings.filter(b=>b.stage!=='complete').length }} <em>处</em></strong></div>
          </div>
          <div class="meter-group"><div class="meter-heading"><span>✧ 忠诚度</span><strong>{{ Math.round(state.loyalty) }} / 100</strong></div><div class="meter"><div :style="{width:state.loyalty+'%'}" :class="{danger:state.loyalty<35}"></div></div></div>
          <div class="meter-group"><div class="meter-heading"><span>✦ 繁荣度</span><strong>{{ Math.round(state.prosperity) }} / 100</strong></div><div class="meter"><div class="prosperity" :style="{width:state.prosperity+'%'}"></div></div></div>
        </section>
        <section class="panel-section"><div class="section-heading"><h2>行动指引</h2><span class="caption">OBJECTIVES</span></div>
          <div class="objectives">
            <div :class="{done:state.buildings.some(b=>b.kind==='house'&&b.stage==='complete')}"><span class="check">✓</span>建造一座住房</div>
            <div :class="{done:state.buildings.some(b=>b.kind==='farm'&&b.stage==='complete')}"><span class="check">✓</span>建设农田并安排务农</div>
            <div :class="{done:state.raidTriggered}"><span class="check">✓</span>抵御随机出现的强盗</div>
            <div :class="{done:state.encounter?.phase==='victory'}"><span class="check">✓</span>取得一次守卫胜利</div>
          </div>
        </section>
        <section class="panel-section log-section"><div class="section-heading"><h2>营地日志</h2><span class="caption">EVENT LOG</span></div><div class="event-log"><p v-for="ev in alerts" :key="ev.id" :class="ev.kind"><span>第 {{ Math.floor(ev.tick * BALANCE.fixedStep / BALANCE.daySeconds)+1 }} 日</span>{{ ev.message }}</p></div></section>
        <details class="dev-tools"><summary>开发者工具</summary><div><button @click="send({type:'raid'})" :disabled="state.encounter?.phase==='active'">触发袭击</button><button @click="send({type:'devWeather'})">切换天气</button><button @click="send({type:'devResources'})">补充物资</button><button @click="send({type:'devRefugee'})">触发难民</button><button @click="send({type:'devPrisoner'})">添加俘虏</button><button @click="send({type:'devRecruit'})">归顺度 +25</button></div></details>
        <div class="left-actions"><button @click="reset">↺ 新游戏</button></div>
      </aside>

      <main class="world-panel">
        <div id="game-canvas" class="game-canvas"></div>
        <div class="world-title"><span class="status-dot"></span> FRONTIER SETTLEMENT <span class="coords">24 × 24 HEX</span></div>
        <div class="camera-actions"><button @click="bridge.followLeader(); followMode=true" :class="{active:followMode}" title="跟随领袖">⌖ <span>跟随领袖</span></button><button @click="bridge.focusRaid()" title="查看袭击位置">◎ <span>战场定位</span></button></div>
        <div class="world-bottom"><span :class="{error:!noticeGood}">{{ noticeGood ? '◇' : '!' }} {{ notice }}</span><span>WASD 移动镜头 · 滚轮缩放 · F 跟随</span></div>
        <div v-if="state.paused" class="paused-overlay">Ⅱ <span>模拟已暂停</span></div>
        <div v-if="state.gameOver" class="gameover"><strong>王国陨落</strong><p>领袖阵亡，营地故事就此结束。</p><button @click="reset">重新开始</button></div>
      </main>

      <aside class="sidebar right">
        <div class="sidebar-tabs"><button :class="{selected:activeTab==='residents'}" @click="activeTab='residents';chooseBuild(null)">居民管理</button><button :class="{selected:activeTab==='buildings'}" @click="activeTab='buildings'">营地建造</button></div>
        <div class="right-scroll">
          <section class="panel-section" v-if="activeTab==='residents'"><div class="section-heading"><h2>居民与岗位</h2><span class="caption">{{ available }} AVAILABLE</span></div><p class="section-desc">每个居民有独立等级与技能。真正劳动、参战后才能成长。</p><ResidentPanel :residents="residents" :selected-ids="selectedIds" @select="selectResident" @assign="(id,job)=>send({type:'assign',personId:id,job})" /></section>
          <section class="panel-section refugee-card" v-if="state.refugee"><div class="section-heading"><h2>难民请求</h2><span class="caption">POPULATION</span></div><p><strong>{{ state.refugee.name }}</strong> 希望加入聚落，成为新的居民。</p><div><button @click="send({type:'rejectRefugee'})">拒绝</button><button class="accept" @click="send({type:'acceptRefugee'})">接纳</button></div></section>
          <section class="panel-section" v-else><div class="section-heading"><h2>营地设施</h2><span class="caption">CONSTRUCTION</span></div><BuildPanel :active="buildMode" :state="state" @change="chooseBuild" /><div class="construction-list" v-if="state.buildings.length"><h3>当前建筑</h3><div v-for="b in state.buildings" :key="b.id">{{ b.kind==='house'?'住房':b.kind==='farm'?'农田':b.kind==='warehouse'?'仓库':'木栅栏' }} <span>{{ b.stage==='complete'?'已完成':Math.floor(b.progress*100)+'%' }}</span></div></div></section>
          <section class="panel-section" v-if="selectedPerson || selectedBuilding"><div class="section-heading"><h2>当前选中</h2><span class="caption">INSPECT</span></div>
            <template v-if="selectedPerson"><div class="detail-title">{{ selectedPerson.name }} <span>{{ activeStatus(selectedPerson) }}</span></div><div class="detail-grid"><span>生命值</span><strong>{{ Math.ceil(selectedPerson.hp) }} / {{ maxHp(selectedPerson) }}</strong><span>攻击 / 防御</span><strong>{{ attack(selectedPerson) }} / {{ defense(selectedPerson) }}</strong><span>等级经验</span><strong>Lv.{{ selectedPerson.level }} · {{ selectedPerson.exp.toFixed(0) }} / {{ selectedPerson.level===10?'MAX':requiredXp(selectedPerson.level) }}</strong><span>战斗贡献</span><strong>{{ selectedPerson.combatContribution.toFixed(0) }}</strong></div></template>
            <template v-else-if="selectedBuilding"><div class="detail-title">{{ selectedBuilding.kind }}<span>{{ selectedBuilding.stage }}</span></div><div class="detail-grid"><span>进度</span><strong>{{ Math.floor(selectedBuilding.progress*100) }}%</strong><span>耐久</span><strong>{{ Math.round(selectedBuilding.hp) }}</strong></div></template>
          </section>
          <section class="panel-section" v-if="currentEnc"><div class="section-heading"><h2>袭击通报</h2><span class="caption">COMBAT REPORT</span></div><EncounterPanel :encounter="currentEnc" :persons="state.persons" @loot="send({type:'claimLoot'})" @release="id=>send({type:'releasePrisoner',personId:id})" @recruit="id=>send({type:'recruitPrisoner',personId:id})" @focus="bridge.focusRaid()" /></section>
          <section class="panel-section controls-help"><div class="section-heading"><h2>操作说明</h2></div><p><kbd>左键</kbd> 选择单位 / 框选多个单位</p><p><kbd>右键</kbd> 空地移动、点击资源采集、点击敌人攻击</p><p><kbd>中键拖拽</kbd> 或 <kbd>W A S D</kbd> 浏览地图</p><p><kbd>滚轮</kbd> 缩放 · <kbd>F</kbd> 跟随领袖 · <kbd>Esc</kbd> 退出建造</p></section>
        </div>
      </aside>
    </div>
    <footer class="footer">王国崛起 / BROWSER MVP <span>固定步长模拟 · 本地自动存档 · 单机原型</span></footer>
  </div>
</template>
