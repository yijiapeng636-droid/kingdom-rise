import type { Building, BuildingKind, Cell, CommandResult, FoodKind, GameCommand, Job, Order, Person, Point, WeatherKind, WorldState } from '../domain/model/types.ts';
import { BUILDINGS } from '../game/config/buildings.ts';
import { BALANCE } from '../game/config/balance.ts';
import { center, distance, findPath, inBounds, isBlocked, key, neighbors, toCell } from '../domain/navigation/grid.ts';
import { addStock, canAfford, capacity, spend } from '../domain/rules/inventory.ts';
import { applyAttacks, collectAttacks } from '../domain/combat/CombatSystem.ts';
import { DefaultResidentPolicy, type ResidentPolicy } from '../domain/ai/ResidentPolicy.ts';
import { createPerson } from '../domain/model/initialState.ts';
import { grantXp, maxHp, workEfficiency } from '../domain/progression/progression.ts';
import { HOLDING_CELL, REFUGEE_CELL } from '../game/config/scenario.ts';

export function event(w: WorldState, kind: string, message: string) {
  w.events.push({ id: w.events.at(-1)?.id ? w.events.at(-1)!.id + 1 : 1, tick: w.tick, kind, message });
  if (w.events.length > 40) w.events.shift();
}
const result = (ok: boolean, message: string): CommandResult => ({ ok, message });
const round = (n: number) => Math.round(n * 10) / 10;
const random = (w: WorldState) => ((w.rngSeed = (Math.imul(w.rngSeed, 1664525) + 1013904223) >>> 0) / 0x100000000);
const weatherName: Record<WeatherKind, string> = { clear: '晴朗', rain: '降雨', storm: '暴风雨', cold: '寒潮' };
const foodName: Record<FoodKind, string> = { grain: '谷物', berries: '浆果', fruit: '水果', fish: '鱼', game: '猎物' };
const refugeeNames = ['诺拉', '伊森', '赛拉', '凯尔', '露西', '奥文', '菲恩', '艾达'];
function recordFood(w: WorldState, kind: FoodKind) {
  if (!w.foodVariety.includes(kind)) w.foodVariety.push(kind);
}
function workMultiplier(w: WorldState, foodKind?: FoodKind): number {
  if (w.weather === 'storm') return 0.65;
  if (w.weather === 'rain') return foodKind === 'fish' || foodKind === 'grain' ? 1.25 : 0.85;
  if (w.weather === 'cold') return foodKind === 'game' ? 1.25 : 0.85;
  return 1;
}
function scheduleRefugee(w: WorldState) {
  w.refugeeAt = w.time + BALANCE.refugeeEvery[0] + random(w) * (BALANCE.refugeeEvery[1] - BALANCE.refugeeEvery[0]);
}
function scheduleRaid(w: WorldState) {
  w.raidAt = w.time + BALANCE.daySeconds * (BALANCE.raidIntervalDays[0] + random(w) * (BALANCE.raidIntervalDays[1] - BALANCE.raidIntervalDays[0]));
}
function offerRefugee(w: WorldState) {
  if (w.refugee) return;
  w.refugee = { id: `refugee-${++w.idCounter}`, name: refugeeNames[Math.floor(random(w) * refugeeNames.length)], expiresAt: w.time + BALANCE.daySeconds };
  event(w, 'info', `一名难民 ${w.refugee.name} 请求加入营地。`);
}
function placePrisoner(p: Person, index: number) {
  const origin = center(HOLDING_CELL);
  const angle = index * Math.PI;
  p.position = { x: origin.x + Math.cos(angle) * 9, y: origin.y + Math.sin(angle) * 6 };
  p.previousPosition = { ...p.position }; p.path = []; p.order = { type: 'hold' };
  p.manualOrder = false; p.recruitProgress = 0;
}
function changeWeather(w: WorldState) {
  const choices: WeatherKind[] = ['clear', 'rain', 'storm', 'cold'];
  const available = choices.filter(kind => kind !== w.weather);
  w.weather = available[Math.floor(random(w) * available.length)];
  w.weatherUntil = w.time + BALANCE.weatherEvery;
  event(w, 'weather', `天气转为${weatherName[w.weather]}。`);
}
function attackPosition(w: WorldState, attacker: Person, target: Person): Point {
  const positions = neighbors(toCell(target.position)).filter(cell => !isBlocked(w, cell));
  if (!positions.length) return target.position;
  const raidIndex = w.encounter?.raiderIds.indexOf(attacker.id) ?? -1;
  const allies = w.persons
    .filter(p => p.life === 'active' && p.team === attacker.team)
    .sort((a, b) => a.id.localeCompare(b.id));
  const index = raidIndex >= 0 ? raidIndex : allies.findIndex(p => p.id === attacker.id);
  return center(positions[Math.max(0, index) % positions.length]);
}
export function validateBuild(w: WorldState, kind: BuildingKind, cell: Cell): CommandResult {
  if (!inBounds(cell)) return result(false, '建造位置超出地图');
  if (w.waterCells.some(water => key(water) === key(cell))) return result(false, '不能在水域施工');
  if (w.buildings.some(b => key(b.cell) === key(cell))) return result(false, '这里已有建筑');
  if (w.nodes.some(n => n.amount > 0 && key(n.cell) === key(cell))) return result(false, '请避开资源点');
  if (w.persons.some(p => p.life === 'active' && distance(p.position, center(cell)) < 18)) return result(false, '请避开单位位置');
  if (cell.x < 2 || cell.y < 2 || cell.x > 21 || cell.y > 21) return result(false, '不能在地图边界施工');
  if (!canAfford(w, BUILDINGS[kind].cost)) return result(false, '资源不足，无法施工');
  // Keep at least one reachable entrance for construction.
  if (!neighbors(cell).some(n => !isBlocked(w, n))) return result(false, '施工地点周围没有入口');
  const test = { ...w, buildings: [...w.buildings, { id: 'preview', kind, cell, stage: 'foundation', progress: 0, hp: 1, builderIds: [] }] } as WorldState;
  if (!w.persons.some(p => p.role === 'resident' && p.life === 'active' && findPath(test, p.position, center(cell)))) return result(false, '没有可到达工地的道路');
  return result(true, '可建造');
}
function setOrder(w: WorldState, p: Person, order: Order, manual = false): boolean {
  if (p.life !== 'active') return false;
  let point: Point | undefined;
  let attackTarget: Point | undefined;
  if (order.type === 'move') point = order.destination;
  if (order.type === 'gather') point = w.nodes.find(n => n.id === order.nodeId && n.amount > 0)?.cell && center(w.nodes.find(n => n.id === order.nodeId)!.cell);
  if (order.type === 'attack') {
    const targetPerson = w.persons.find(x => x.id === order.targetId && x.life === 'active' && x.team !== p.team);
    attackTarget = targetPerson?.position ?? (p.team === 'raiders' ? w.buildings.find(b => b.id === order.targetId && b.hp > 0)?.cell && center(w.buildings.find(b => b.id === order.targetId)!.cell) : undefined);
    point = targetPerson ? attackPosition(w, p, targetPerson) : attackTarget;
  }
  if (order.type !== 'hold' && !point) return false;
  if (point && !inBounds(toCell(point))) return false;
  const rangeTarget = order.type === 'attack' ? attackTarget : point;
  if (point && rangeTarget && distance(p.position, rangeTarget) > (order.type === 'attack' ? BALANCE.attackRange[p.role] : 25)) {
    const path = findPath(w, p.position, point);
    if (!path) return false;
    p.path = path;
  } else p.path = [];
  p.order = order;
  p.manualOrder = manual;
  if (order.type === 'move' && !p.path.length && manual) { p.order = { type: 'hold' }; p.manualOrder = false; }
  p.workTimer = 0;
  return true;
}
function setupJob(w: WorldState, p: Person, policy: ResidentPolicy) {
  const intention = policy.chooseSettlementAction(p, w);
  if (intention.type === 'idle') {
    p.order = { type: 'hold' }; p.path = []; p.targetBuildingId = null; p.targetNodeId = null;
    return;
  }
  const targetBuildingId = intention.type === 'workBuilding' ? intention.buildingId : null;
  const targetNodeId = intention.type === 'gather' ? intention.nodeId : null;
  const taskOrder: Order = intention.type === 'gather' ? { type: 'gather', nodeId: intention.nodeId }
    : { type: 'move', destination: center(w.buildings.find(b => b.id === intention.buildingId)!.cell) };
  const same = p.targetBuildingId === targetBuildingId && p.targetNodeId === targetNodeId;
  if (!same || (p.path.length === 0 && !isAtTask(w, p))) {
    setOrder(w, p, taskOrder, false);
    p.targetBuildingId = targetBuildingId;
    p.targetNodeId = targetNodeId;
  }
}
function isAtTask(w: WorldState, p: Person): boolean {
  const t = p.targetNodeId ? w.nodes.find(n => n.id === p.targetNodeId) : w.buildings.find(b => b.id === p.targetBuildingId);
  return !!t && distance(p.position, center(t.cell)) < BALANCE.interactionRange;
}

export function execute(w: WorldState, command: GameCommand): CommandResult {
  if (command.type === 'pause') { w.paused = command.value; return result(true, command.value ? '已暂停' : '继续游戏'); }
  if (command.type === 'speed') { w.speed = command.value; return result(true, `速度设置为 ${command.value}×`); }
  if (w.gameOver) return result(false, '本局已结束，请开始新游戏');
  if (command.type === 'build') {
    const checked = validateBuild(w, command.kind, command.cell);
    if (!checked.ok) return checked;
    spend(w, BUILDINGS[command.kind].cost);
    const b: Building = { id: `building-${++w.idCounter}`, kind: command.kind, cell: command.cell, progress: 0, stage: 'foundation', hp: BUILDINGS[command.kind].maxHp, builderIds: [] };
    w.buildings.push(b);
    event(w, 'build', `${BUILDINGS[b.kind].name} 已规划，指派施工居民后开始建造。`);
    return result(true, `${BUILDINGS[b.kind].name} 工地已设立`);
  }
  if (command.type === 'assign') {
    const p = w.persons.find(p => p.id === command.personId && p.role === 'resident');
    if (!p || p.life !== 'active') return result(false, '只有健康、在营的居民可以分配岗位');
    p.job = command.job; p.manualOrder = false; p.targetNodeId = null; p.targetBuildingId = null;
    p.workTimer = 0; p.aiTimer = 0; p.path = []; p.order = { type: 'hold' };
    event(w, 'job', `${p.name} 已安排：${jobName(command.job)}`);
    return result(true, '岗位已更新');
  }
  if (command.type === 'order') {
    const units = w.persons.filter(p => command.personIds.includes(p.id) && p.team === 'settlement' && p.life === 'active');
    if (!units.length) return result(false, '请选择可以行动的己方单位');
    let issued = 0;
    for (const p of units) {
      const order = command.order;
      if (order.type === 'gather' && !w.nodes.some(n => n.id === order.nodeId && n.amount > 0)) continue;
      if (order.type === 'attack' && !w.persons.some(x => x.id === order.targetId && x.team === 'raiders' && x.life === 'active')) continue;
      if (setOrder(w, p, command.order, true)) { p.targetBuildingId = null; p.targetNodeId = null; issued++; }
    }
    return result(issued > 0, issued ? `已下达指令 · ${issued} 个单位` : '目标不可达或无效');
  }
  if (command.type === 'raid') {
    if (w.encounter?.phase === 'active') return result(false, '当前袭击仍在进行');
    spawnRaid(w); return result(true, '侦察兵发来警报：强盗已经出现！');
  }
  if (command.type === 'claimLoot') {
    const encounter = w.encounter;
    if (!encounter || encounter.phase !== 'victory') return result(false, '没有可领取的战利品');
    if (encounter.lootClaimed) return result(false, '战利品已领取');
    let amount = 0;
    for (const kind of ['wood', 'stone', 'food'] as const) {
      const gained = addStock(w, kind, encounter.loot[kind]);
      encounter.loot[kind] = round(encounter.loot[kind] - gained);
      amount += gained;
    }
    encounter.lootClaimed = Object.values(encounter.loot).every(v => v <= 0);
    if (amount) event(w, 'loot', `战利品已入库，共 ${round(amount)} 份物资。`);
    return result(amount > 0, amount > 0 ? (encounter.lootClaimed ? '已全部领取' : '仓库已满，剩余物资可稍后领取') : '仓库已满，暂时无法领取');
  }
  if (command.type === 'releasePrisoner') {
    const p = w.persons.find(p => p.id === command.personId && p.life === 'prisoner');
    if (!p) return result(false, '找不到该俘虏');
    p.life = 'released'; p.captorFactionId = null;
    event(w, 'combat', `${p.name} 已被释放。`);
    return result(true, '俘虏已释放');
  }
  if (command.type === 'recruitPrisoner') {
    const p = w.persons.find(p => p.id === command.personId && p.life === 'prisoner');
    if (!p) return result(false, '找不到该俘虏');
    if (p.recruitProgress < 100) return result(false, '归顺度尚未达到 100%');
    p.life = 'active'; p.team = 'settlement'; p.role = 'resident'; p.job = 'idle'; p.captorFactionId = null;
    p.hp = Math.max(1, Math.ceil(maxHp(p) * 0.7)); p.aiTimer = 0;
    event(w, 'population', `${p.name} 已归顺并成为居民。`);
    return result(true, `${p.name} 已加入营地`);
  }
  if (command.type === 'acceptRefugee') {
    if (!w.refugee) return result(false, '当前没有待处理的难民请求');
    const offer = w.refugee;
    const p = createPerson(offer.id, offer.name, 'resident', REFUGEE_CELL);
    w.persons.push(p); w.refugee = null; scheduleRefugee(w);
    event(w, 'population', `${p.name} 被接纳为新居民。`);
    return result(true, `${p.name} 已加入营地`);
  }
  if (command.type === 'rejectRefugee') {
    if (!w.refugee) return result(false, '当前没有待处理的难民请求');
    const name = w.refugee.name; w.refugee = null; scheduleRefugee(w);
    event(w, 'info', `${name} 离开了营地。`);
    return result(true, '已拒绝难民请求');
  }
  if (command.type === 'devResources') {
    for (const kind of ['wood', 'stone', 'food'] as const) addStock(w, kind, 40);
    return result(true, '开发者：物资已补充');
  }
  if (command.type === 'devWeather') { changeWeather(w); return result(true, `开发者：${weatherName[w.weather]}`); }
  if (command.type === 'devRefugee') { offerRefugee(w); return result(true, '开发者：难民请求已触发'); }
  if (command.type === 'devPrisoner') {
    if (w.persons.filter(p => p.life === 'prisoner').length >= BALANCE.prisonerCapacity) return result(false, '收押区已满');
    const p = createPerson(`prisoner-${++w.idCounter}`, `俘虏 ${w.idCounter}`, 'raider', HOLDING_CELL);
    p.life = 'prisoner'; p.captorFactionId = 'settlement'; placePrisoner(p, w.persons.filter(x => x.life === 'prisoner').length);
    w.persons.push(p);
    if (!w.encounter) w.encounter = { id: `dev-${w.idCounter}`, phase: 'victory', raiderIds: [p.id], defenderIds: [], casualties: [], injured: [], prisoners: [p.id], loot: {wood:0,stone:0,food:0}, lootClaimed: true, combatXpGranted: true, startedAt: w.time, endedAt: w.time };
    else { w.encounter.raiderIds.push(p.id); w.encounter.prisoners.push(p.id); }
    return result(true, '开发者：测试俘虏已加入收押区');
  }
  if (command.type === 'devRecruit') {
    const prisoners = w.persons.filter(p => p.life === 'prisoner');
    if (!prisoners.length) return result(false, '没有俘虏');
    for (const p of prisoners) p.recruitProgress = Math.min(100, p.recruitProgress + 25);
    return result(true, '开发者：俘虏归顺度 +25%');
  }
  return result(false, '未知命令');
}
export function jobName(job: Job) {
  return ({ idle: '空闲', wood: '伐木', stone: '采石', farm: '务农', forage: '觅食', build: '施工', rest: '休息' } as Record<Job, string>)[job];
}

export function spawnRaid(w: WorldState) {
  if (w.encounter?.phase === 'active') return;
  w.raidTriggered = true;
  const edge = Math.floor(random(w) * 4), offset = 4 + Math.floor(random(w) * 16);
  const spawn: Cell[][] = [
    [{x:0,y:offset-1},{x:0,y:offset},{x:1,y:offset}],
    [{x:23,y:offset-1},{x:23,y:offset},{x:22,y:offset}],
    [{x:offset-1,y:0},{x:offset,y:0},{x:offset,y:1}],
    [{x:offset-1,y:23},{x:offset,y:23},{x:offset,y:22}],
  ];
  const entry = spawn[edge];
  const raiders = Array.from({ length: BALANCE.raiders }, (_, i) => {
    const p = createPerson(`raider-${++w.idCounter}`, `强盗 ${i + 1}`, 'raider', entry[i % entry.length]);
    p.aiTimer = 0; return p;
  });
  w.persons.push(...raiders);
  w.encounter = { id: `raid-${w.idCounter}`, phase: 'active', raiderIds: raiders.map(p => p.id),
    defenderIds: w.persons.filter(p => p.team === 'settlement').map(p => p.id), casualties: [], injured: [], prisoners: [],
    loot: { wood: 3, stone: 1, food: raiders.length * 2 }, lootClaimed: false,
    combatXpGranted: false, startedAt: w.time, endedAt: null };
  scheduleRaid(w);
  event(w, 'warning', `⚔ 强盗从${['西部','东部','北部','南部'][edge]}边境袭来！可框选居民，右键攻击。`);
}
function movePerson(w: WorldState, p: Person, dt: number) {
  if (!p.path.length) return;
  const weatherSpeed = w.weather === 'storm' ? 0.75 : w.weather === 'rain' || w.weather === 'cold' ? 0.9 : 1;
  let budget = BALANCE.moveSpeed[p.role] * weatherSpeed * dt;
  while (p.path.length && budget > 0) {
    const target = p.path[0];
    const dist = distance(p.position, target);
    if (dist <= BALANCE.separationDistance) { p.path.shift(); continue; }
    const step = Math.min(dist, budget);
    p.position.x += (target.x - p.position.x) / dist * step;
    p.position.y += (target.y - p.position.y) / dist * step;
    budget -= step;
    if (step >= dist - 0.01) { p.position = { ...target }; p.path.shift(); }
  }
  if (!p.path.length && p.order.type === 'move' && p.manualOrder) {
    p.order = { type: 'hold' }; p.manualOrder = false; p.aiTimer = 0;
  }
}
function separatePeople(w: WorldState) {
  const people = w.persons.filter(p => p.life === 'active');
  for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) {
    const a = people[i], b = people[j];
    const dx = b.position.x - a.position.x, dy = b.position.y - a.position.y;
    const dist = Math.hypot(dx, dy);
    if (dist >= BALANCE.separationDistance) continue;
    const mover = a.path.length ? a : b.path.length ? b : null;
    const target = mover?.path[0];
    const moveX = target && mover ? target.x - mover.position.x : 0;
    const moveY = target && mover ? target.y - mover.position.y : 0;
    const moveLength = Math.hypot(moveX, moveY);
    const nx = moveLength > 0.01 ? -moveY / moveLength : dist > 0.01 ? dx / dist : (i + j) % 2 ? 1 : -1;
    const ny = moveLength > 0.01 ? moveX / moveLength : dist > 0.01 ? dy / dist : 0;
    const push = (BALANCE.separationDistance - dist) / 2;
    const nextA = { x: a.position.x - nx * push, y: a.position.y - ny * push };
    const nextB = { x: b.position.x + nx * push, y: b.position.y + ny * push };
    if (inBounds(toCell(nextA))) a.position = nextA;
    if (inBounds(toCell(nextB))) b.position = nextB;
  }
}
function decision(w: WorldState, p: Person, policy: ResidentPolicy) {
  if (p.role === 'raider') {
    const enemies = w.persons.filter(e => e.team === 'settlement' && e.life === 'active');
    const target = enemies.sort((a, b) => distance(a.position, p.position) - distance(b.position, p.position))[0];
    const walls = w.buildings.filter(b => b.kind === 'palisade' && b.hp > 0);
    const nearWall = walls.sort((a, b) => distance(center(a.cell), p.position) - distance(center(b.cell), p.position))[0];
    const chosen = nearWall && target && distance(center(nearWall.cell), p.position) < distance(target.position, p.position) - 15 ? nearWall.id : target?.id;
    if (chosen) {
      if (p.order.type !== 'attack' || p.order.targetId !== chosen) setOrder(w, p, { type: 'attack', targetId: chosen });
      else if (target && distance(p.position, target.position) > BALANCE.attackRange[p.role] && !p.path.length) setOrder(w, p, { type: 'attack', targetId: chosen });
    }
    return;
  }
  if (p.manualOrder) {
    const current = p.order;
    if (current.type === 'attack' && !w.persons.some(e => e.id === current.targetId && e.life === 'active')) {
      p.manualOrder = false; p.order = { type: 'hold' }; p.path = [];
    } else if (current.type === 'gather' && !w.nodes.some(n => n.id === current.nodeId && n.amount > 0)) {
      p.manualOrder = false; p.order = { type: 'hold' }; p.path = [];
    } else if (p.order.type === 'attack') {
      const target = w.persons.find(e => e.id === (p.order as {targetId: string}).targetId);
      if (target && distance(p.position, target.position) > BALANCE.attackRange[p.role] && !p.path.length) setOrder(w, p, { type: 'attack', targetId: target.id }, true);
    }
    return;
  }
  const defenseOrder = policy.chooseCombatOrder(p, w);
  if (defenseOrder) {
    if (p.order.type !== 'attack' || p.order.targetId !== (defenseOrder as {targetId: string}).targetId || (!p.path.length && distance(p.position, w.persons.find(e => e.id === (defenseOrder as {targetId: string}).targetId)!.position) > BALANCE.attackRange[p.role])) {
      setOrder(w, p, defenseOrder, false);
    }
    return;
  }
  if (p.role === 'resident') setupJob(w, p, policy);
}
function produce(w: WorldState, p: Person, dt: number) {
  if (p.life !== 'active' || p.path.length) { p.workTimer = 0; return; }
  if (p.order.type === 'gather') {
    const node = w.nodes.find(n => n.id === (p.order as {nodeId: string}).nodeId && n.amount > 0);
    if (!node || distance(p.position, center(node.cell)) > BALANCE.interactionRange) return;
    p.workTimer += dt;
    const every = p.role === 'leader' ? 3 : BALANCE.productionEvery;
    while (p.workTimer >= every) {
      p.workTimer -= every;
      const base = p.role === 'leader' ? 2.5 : (BALANCE.work[p.job as 'wood' | 'stone']?.amount ?? 2);
      const foodKind = node.kind === 'food' ? node.foodKind ?? 'berries' : undefined;
      const earned = Math.min(node.amount, base * workMultiplier(w, foodKind) * (p.role === 'leader' ? 1 : workEfficiency(p, node.kind === 'wood' ? 'wood' : node.kind === 'stone' ? 'stone' : 'farm')));
      const gained = addStock(w, node.kind, earned);
      if (gained <= 0) {
        p.order = { type: 'hold' }; p.manualOrder = false; p.targetNodeId = null; p.workTimer = 0;
        break;
      }
      node.amount = round(node.amount - gained);
      if (foodKind) recordFood(w, foodKind);
      if (gained > 0) levelFromWork(w, p);
      if (node.amount <= 0) { event(w, 'resource', `${node.kind === 'wood' ? '林木' : node.kind === 'stone' ? '石矿' : '野果'} 已采尽，等待再生。`); break; }
    }
  } else if (p.role === 'resident' && p.job === 'farm' && p.targetBuildingId && !p.manualOrder) {
    const b = w.buildings.find(b => b.id === p.targetBuildingId && b.stage === 'complete' && b.kind === 'farm');
    if (!b || distance(p.position, center(b.cell)) > BALANCE.interactionRange) return;
    p.workTimer += dt;
    while (p.workTimer >= BALANCE.productionEvery) {
      p.workTimer -= BALANCE.productionEvery;
      if (addStock(w, 'food', (BALANCE.work.farm?.amount ?? 3) * workEfficiency(p, 'farm') * workMultiplier(w, 'grain')) > 0) {
        recordFood(w, 'grain'); levelFromWork(w, p);
      }
    }
  }
}
function levelFromWork(w: WorldState, p: Person) {
  const levels = grantXp(p, BALANCE.workXp);
  if (levels) event(w, 'level', `✨ ${p.name} 升至 ${p.level} 级！`);
}
function construct(w: WorldState, p: Person, dt: number) {
  if (p.role !== 'resident' || p.life !== 'active' || p.job !== 'build' || p.manualOrder || p.path.length || !p.targetBuildingId) return;
  const b = w.buildings.find(b => b.id === p.targetBuildingId && b.stage !== 'complete');
  if (!b || distance(p.position, center(b.cell)) > BALANCE.interactionRange) return;
  b.progress = Math.min(1, b.progress + dt * workEfficiency(p, 'build') * workMultiplier(w) / BUILDINGS[b.kind].buildSeconds);
  b.stage = b.progress < 0.15 ? 'foundation' : b.progress < 1 ? 'construction' : 'complete';
  if (!b.builderIds.includes(p.id)) b.builderIds.push(p.id);
  if (b.stage === 'complete') {
    for (const id of b.builderIds) {
      const builder = w.persons.find(x => x.id === id);
      if (builder && grantXp(builder, BALANCE.buildXp)) event(w, 'level', `✨ ${builder.name} 升级了！`);
    }
    event(w, 'build', `✔ ${BUILDINGS[b.kind].name} 已竣工！`);
    for (const worker of w.persons.filter(v => v.targetBuildingId === b.id)) {
      worker.targetBuildingId = null; worker.path = []; worker.order = { type: 'hold' }; worker.aiTimer = 0;
    }
  }
}
function tickHealth(w: WorldState, p: Person, dt: number) {
  if (p.life === 'downed') {
    p.downedTimer += dt;
    if (p.downedTimer >= BALANCE.downedSeconds) {
      p.life = 'dead'; p.path = [];
      event(w, 'combat', `☠ ${p.name} 因伤势过重阵亡。`);
      if (p.role === 'leader') { w.gameOver = true; event(w, 'warning', '领袖阵亡，本局结束。'); }
    }
  } else if (p.life === 'wounded') {
    p.recoveryTimer += dt;
    if (p.recoveryTimer >= BALANCE.recoverSeconds) {
      p.life = 'active'; p.hp = Math.max(p.hp, Math.ceil(maxHp(p) * 0.7)); p.recoveryTimer = 0;
      event(w, 'info', `${p.name} 已结束休养并重返岗位。`);
    }
  } else if (p.life === 'prisoner') {
    const dietBonus = Math.min(0.25, w.foodVariety.length * 0.05);
    p.recruitProgress = Math.min(100, p.recruitProgress + dt * 100 / BALANCE.recruitSeconds * (0.8 + w.loyalty / 250 + dietBonus));
  }
}
function endEncounter(w: WorldState) {
  const encounter = w.encounter;
  if (!encounter || encounter.phase !== 'active') return;
  const raiders = encounter.raiderIds.map(id => w.persons.find(p => p.id === id)).filter((p): p is Person => !!p);
  const leader = w.persons.find(p => p.role === 'leader');
  const settled = raiders.every(p => p.life !== 'active');
  const defeated = !leader || leader.life === 'dead' || !w.persons.some(p => p.team === 'settlement' && p.life === 'active');
  if (!settled && !defeated) return;
  encounter.phase = settled ? 'victory' : 'defeat'; encounter.endedAt = w.time;
  if (settled) {
    for (const defender of w.persons.filter(p => p.team === 'settlement' && p.life === 'downed')) {
      defender.life = 'wounded'; defender.recoveryTimer = 0; defender.hp = Math.ceil(maxHp(defender) * 0.3);
      encounter.injured.push(defender.id);
    }
    encounter.casualties = w.persons.filter(p => p.team === 'settlement' && p.life === 'dead').map(p => p.id);
    for (const p of raiders.filter(p => p.life === 'downed')) {
      if (w.persons.filter(x => x.life === 'prisoner').length < BALANCE.prisonerCapacity) {
        p.life = 'prisoner'; p.captorFactionId = 'settlement';
        placePrisoner(p, w.persons.filter(x => x.life === 'prisoner' && x.id !== p.id).length);
        encounter.prisoners.push(p.id);
      } else { p.life = 'released'; }
    }
    if (!encounter.combatXpGranted) {
      for (const defender of w.persons.filter(p => p.team === 'settlement' && p.role === 'resident')) {
        if (defender.combatContribution > 0) {
          const lv = grantXp(defender, Math.max(5, Math.ceil(defender.combatContribution * BALANCE.combatXpPerDamage)));
          if (lv) event(w, 'level', `${defender.name} 在战斗中升至 ${defender.level} 级。`);
        }
      }
      encounter.combatXpGranted = true;
    }
    w.loyalty = Math.max(0, w.loyalty - encounter.casualties.length * 5 + 4);
    event(w, 'victory', `🏆 袭击已击退！救回 ${encounter.injured.length} 名伤员，收押 ${encounter.prisoners.length} 名俘虏。`);
  } else {
    for (const p of raiders.filter(p => p.life === 'active')) { p.life = 'released'; p.path = []; }
    w.loyalty = Math.max(0, w.loyalty - 15);
    event(w, 'warning', '营地守军溃败！领袖若倒地，仍可能因失救而阵亡。');
  }
}
function upkeep(w: WorldState) {
  const consumers = w.persons.filter(p => p.team === 'settlement' && ['active', 'wounded', 'downed'].includes(p.life)).length;
  const prisoners = w.persons.filter(p => p.life === 'prisoner').length;
  const required = consumers * BALANCE.upkeepPerPerson + prisoners;
  const eaten = Math.min(w.resources.food, required);
  w.resources.food = round(w.resources.food - eaten);
  if (eaten < required) {
    w.loyalty = Math.max(0, w.loyalty - 8);
    event(w, 'warning', `粮食短缺（缺 ${round(required - eaten)}），忠诚度下降！`);
  } else {
    const varietyBonus = Math.max(0, w.foodVariety.length - 1);
    w.loyalty = Math.min(100, w.loyalty + 1 + varietyBonus);
    if (varietyBonus >= 2) event(w, 'population', `丰富饮食（${w.foodVariety.map(kind => foodName[kind]).join('、')}）使忠诚度额外提升 ${varietyBonus}。`);
  }
  w.foodVariety = [];
}
export function step(w: WorldState, dt: number, policy: ResidentPolicy = new DefaultResidentPolicy()) {
  if (w.paused || w.gameOver) return;
  w.tick++; w.time += dt; w.day = Math.floor(w.time / BALANCE.daySeconds) + 1;
  if (w.encounter?.phase !== 'active' && w.time >= w.raidAt) spawnRaid(w);
  if (w.time >= w.weatherUntil) changeWeather(w);
  if (w.refugee && w.time >= w.refugee.expiresAt) { event(w, 'info', `${w.refugee.name} 没有等到答复，离开了营地。`); w.refugee = null; scheduleRefugee(w); }
  if (!w.refugee && w.time >= w.refugeeAt) offerRefugee(w);
  for (const p of w.persons) {
    p.previousPosition = { ...p.position };
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.aggroTimer = Math.max(0, p.aggroTimer - dt);
    tickHealth(w, p, dt);
    if (p.life !== 'active') continue;
    p.aiTimer -= dt;
    if (p.aiTimer <= 0) { decision(w, p, policy); p.aiTimer = 0.5; }
    movePerson(w, p, dt);
    produce(w, p, dt);
    construct(w, p, dt);
  }
  separatePeople(w);
  applyAttacks(w, collectAttacks(w), (kind, message) => event(w, kind, message));
  endEncounter(w);
  w.upkeepTimer += dt;
  if (w.upkeepTimer >= BALANCE.upkeepEvery) { w.upkeepTimer -= BALANCE.upkeepEvery; upkeep(w); }
  w.regenerationTimer += dt;
  if (w.regenerationTimer >= BALANCE.nodeRegenEvery) {
    w.regenerationTimer -= BALANCE.nodeRegenEvery;
    for (const n of w.nodes) if (n.amount <= 0) n.amount = n.maxAmount;
  }
  w.prosperity = Math.min(100, BALANCE.startProsperity + w.buildings.filter(b => b.stage === 'complete').reduce((s, b) => s + BUILDINGS[b.kind].prosperity, 0));
}
