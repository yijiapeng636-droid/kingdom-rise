import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/domain/model/initialState.ts';
import { execute, spawnRaid, step, validateBuild } from '../src/application/Simulation.ts';
import { center, distance, findPath, toCell, distanceCell } from '../src/domain/navigation/grid.ts';
import { attack, defense, grantXp, maxHp } from '../src/domain/progression/progression.ts';
import { collectAttacks, applyAttacks } from '../src/domain/combat/CombatSystem.ts';
import { capacity } from '../src/domain/rules/inventory.ts';
import { BALANCE } from '../src/game/config/balance.ts';

function progress(w: ReturnType<typeof createInitialState>, seconds: number) {
  for (let i = 0; i < seconds / BALANCE.fixedStep; i++) step(w, BALANCE.fixedStep);
}
test('initial state matches document and square-grid round trip', () => {
  const w = createInitialState();
  assert.deepEqual(w.resources, { wood: 20, stone: 10, food: 30 });
  assert.equal(w.persons.length, 6);
  assert.equal(w.day, 1);
  assert.equal(w.loyalty, 70);
  assert.equal(w.prosperity, 20);
  for (const c of [{x:0,y:0},{x:12,y:12},{x:23,y:23}]) assert.deepEqual(toCell(center(c)), c);
  assert.ok(Math.abs(distanceCell({x:0,y:0},{x:5,y:2}) - (3 + 2 * Math.SQRT2)) < 0.001);
});
test('building validates affordability and occupied cells, cannot double charge', () => {
  const w = createInitialState();
  const cell = { x: 14, y: 12 };
  assert.equal(validateBuild(w, 'house', cell).ok, true);
  assert.equal(execute(w, {type:'build',kind:'house',cell}).ok, true);
  assert.equal(w.resources.wood, 12);
  assert.equal(w.resources.stone, 8);
  assert.equal(execute(w, {type:'build',kind:'farm',cell}).ok, false);
  assert.equal(w.resources.wood, 12);
  assert.equal(w.buildings.length, 1);
});
test('workers construct buildings, farm food and earn experience', () => {
  const w = createInitialState();
  assert.ok(execute(w,{type:'build',kind:'farm',cell:{x:14,y:12}}).ok);
  const builder = w.persons.find(p => p.id === 'resident-4')!;
  const farmer = w.persons.find(p => p.id === 'resident-3')!;
  execute(w, { type:'assign', personId:farmer.id, job:'farm' });
  progress(w, 48);
  assert.equal(w.buildings[0].stage,'complete');
  assert.ok(builder.exp > 0 || builder.level > 1);
  assert.ok(farmer.exp > 0 || farmer.level > 1);
  assert.ok(w.resources.food > 30,`food ${w.resources.food}`);
});
test('growth formulas and overflow progression preserve health', () => {
  const p = createInitialState().persons[1];
  p.hp = 47;
  assert.equal(grantXp(p,165), 2);
  assert.equal(p.level, 3);
  assert.equal(p.exp, 15);
  assert.equal(p.hp,47);
  assert.equal(maxHp(p), 120);
  assert.equal(attack(p), 12);
  assert.equal(defense(p), 3);
});
test('clock, pause and fixed timestep do not depend on rendering', () => {
  const a = createInitialState(), b = createInitialState();
  for (let i = 0; i < 240; i++) step(a,0.05);
  for (let i = 0; i < 120; i++) { step(b,0.05); step(b,0.05); }
  assert.deepEqual(a,b);
  a.paused = true; const time = a.time;
  step(a,0.05);
  assert.equal(a.time,time);
});
test('an active raid cannot double spawn; simultaneous attacks use collected intents', () => {
  const w = createInitialState();
  spawnRaid(w); spawnRaid(w);
  assert.equal(w.persons.filter(p=>p.role==='raider').length,3);
  assert.ok(w.encounter);
  const leader = w.persons[0], raider = w.persons.find(p=>p.role==='raider')!;
  leader.position = {...raider.position};
  leader.order = {type:'attack',targetId:raider.id};
  raider.order = {type:'attack',targetId:leader.id};
  const hits = collectAttacks(w);
  assert.equal(hits.length,2);
  applyAttacks(w,hits,()=>{});
  assert.ok(leader.hp < maxHp(leader));
  assert.ok(raider.hp < maxHp(raider));
});
test('raids recur after victory through random scheduling or developer trigger', () => {
  const w = createInitialState();
  assert.equal(execute(w,{type:'raid'}).ok,true);
  assert.equal(execute(w,{type:'raid'}).ok,false);
  const firstId=w.encounter!.id;
  assert.ok(w.raidAt>w.time);
  for(const p of w.persons.filter(p=>w.encounter!.raiderIds.includes(p.id))){p.life='downed';p.hp=0;}
  step(w,BALANCE.fixedStep);
  assert.equal(w.encounter!.phase,'victory');
  w.time=w.raidAt;
  step(w,BALANCE.fixedStep);
  assert.equal(w.encounter!.phase,'active');
  assert.notEqual(w.encounter!.id,firstId);
  for(const p of w.persons.filter(p=>w.encounter!.raiderIds.includes(p.id))){p.life='downed';p.hp=0;}
  step(w,BALANCE.fixedStep);
  assert.equal(execute(w,{type:'raid'}).ok,true);
});
test('once-only loot and prisoner release with stable person IDs', () => {
  const w = createInitialState();
  spawnRaid(w);
  for (const p of w.persons.filter(p=>p.role==='raider')) { p.life='downed'; p.hp=0; }
  progress(w,0.1);
  assert.equal(w.encounter!.phase,'victory');
  assert.equal(w.encounter!.prisoners.length,2);
  const id = w.encounter!.prisoners[0];
  assert.equal(execute(w,{type:'releasePrisoner',personId:id}).ok,true);
  assert.equal(w.persons.find(p=>p.id===id)?.life,'released');
  assert.equal(w.persons.filter(p=>p.id===id).length,1);
  const before = w.resources.food;
  assert.equal(execute(w,{type:'claimLoot'}).ok,true);
  assert.ok(w.resources.food>=before);
  assert.equal(execute(w,{type:'claimLoot'}).ok,false);
});
test('A* can approach blocked harvesting nodes and avoid buildings', () => {
  const w = createInitialState();
  const target = w.nodes.find(n=>n.kind==='wood')!;
  const p = w.persons[0];
  const path = findPath(w,p.position,center(target.cell));
  assert.ok(path?.length);
  assert.ok(distanceCell(toCell(path!.at(-1)!),target.cell)<=Math.SQRT2);
});
test('square-grid pathfinding allows diagonals but cannot cut blocked corners', () => {
  const w = createInitialState();
  w.nodes = []; w.buildings = [];
  w.waterCells = [{x:1,y:0},{x:0,y:1}];
  assert.equal(findPath(w,center({x:0,y:0}),center({x:1,y:1}),false),null);
  w.waterCells = [];
  assert.deepEqual(findPath(w,center({x:0,y:0}),center({x:1,y:1}),false),[center({x:1,y:1})]);
});
test('automatic raid spawns at its seeded random time', () => {
  const w = createInitialState();
  // Remove inhabitants' tasks to test just the clock.
  for (const p of w.persons) p.job = 'idle';
  assert.ok(w.raidAt >= BALANCE.daySeconds * BALANCE.raidWindowDays[0]);
  assert.ok(w.raidAt <= BALANCE.daySeconds * BALANCE.raidWindowDays[1]);
  progress(w, w.raidAt + 0.1);
  assert.equal(w.raidTriggered,true);
  assert.ok(w.encounter);
  assert.equal(w.persons.filter(p=>p.role==='raider').length,3);
});
test('active people separate instead of occupying the same point', () => {
  const w = createInitialState();
  for (const p of w.persons) p.job='idle';
  const a = w.persons[1], b = w.persons[2];
  b.position = {...a.position}; b.previousPosition = {...a.position};
  step(w, BALANCE.fixedStep);
  assert.ok(distance(a.position,b.position) >= BALANCE.separationDistance - 0.01);
});
test('raiders reserve distinct attack positions around one defender', () => {
  const w = createInitialState();
  const defender = w.persons[0];
  defender.hp = 10_000;
  for (const p of w.persons.slice(1)) p.life = 'released';
  spawnRaid(w);
  step(w, BALANCE.fixedStep);
  const raiders = w.persons.filter(p => p.role === 'raider');
  assert.ok(raiders.every(p => p.order.type === 'attack' && p.order.targetId === defender.id));
  const destinations = raiders.map(p => p.path.at(-1)).filter(point => point !== undefined);
  assert.equal(destinations.length, raiders.length);
  assert.equal(new Set(destinations.map(point => `${Math.round(point.x)},${Math.round(point.y)}`)).size, raiders.length);
  progress(w, 10);
  for (let i = 0; i < raiders.length; i++) {
    for (let j = i + 1; j < raiders.length; j++) {
      assert.ok(distance(raiders[i].position, raiders[j].position) >= BALANCE.separationDistance - 0.01);
    }
  }
});
test('captives move to the holding area and can only be recruited at full readiness', () => {
  const w = createInitialState();
  spawnRaid(w);
  for (const p of w.persons.filter(p=>p.role==='raider')) { p.life='downed'; p.hp=0; }
  step(w, BALANCE.fixedStep);
  const prisoner = w.persons.find(p=>p.life==='prisoner')!;
  assert.ok(distance(prisoner.position,center({x:10,y:9})) < 20);
  prisoner.recruitProgress=99;
  assert.equal(execute(w,{type:'recruitPrisoner',personId:prisoner.id}).ok,false);
  prisoner.recruitProgress=100;
  assert.equal(execute(w,{type:'recruitPrisoner',personId:prisoner.id}).ok,true);
  assert.equal(prisoner.role,'resident');
  assert.equal(prisoner.team,'settlement');
});
test('refugee offers provide a non-combat population source', () => {
  const w=createInitialState();
  const before=w.persons.filter(p=>p.role==='resident').length;
  assert.equal(execute(w,{type:'devRefugee'}).ok,true);
  assert.ok(w.refugee);
  assert.equal(execute(w,{type:'acceptRefugee'}).ok,true);
  assert.equal(w.persons.filter(p=>p.role==='resident').length,before+1);
});
test('diverse food sources grant an extra loyalty bonus at upkeep', () => {
  const w=createInitialState();
  w.loyalty=50; w.foodVariety=['grain','fish','fruit'];
  w.upkeepTimer=BALANCE.upkeepEvery-BALANCE.fixedStep;
  step(w,BALANCE.fixedStep);
  assert.equal(w.loyalty,53);
  assert.deepEqual(w.foodVariety,[]);
});
test('weather changes over simulation time and fish nodes sit on reachable water', () => {
  const w=createInitialState();
  w.weatherUntil=0;
  step(w,BALANCE.fixedStep);
  assert.notEqual(w.weather,'clear');
  const fish=w.nodes.find(n=>n.foodKind==='fish')!;
  assert.ok(w.waterCells.some(c=>c.x===fish.cell.x&&c.y===fish.cell.y));
  assert.ok(findPath(w,w.persons[0].position,center(fish.cell)));
});
test('rain buffs fishing output and water rejects construction', () => {
  const clear=createInitialState(), rainy=createInitialState();
  const fishClear=clear.nodes.find(n=>n.foodKind==='fish')!, fishRain=rainy.nodes.find(n=>n.foodKind==='fish')!;
  for (const [world,node] of [[clear,fishClear],[rainy,fishRain]] as const) {
    for (const p of world.persons) p.job='idle';
    const leader=world.persons[0]; leader.position=center(node.cell); leader.previousPosition={...leader.position};
    leader.order={type:'gather',nodeId:node.id}; leader.manualOrder=true; world.resources.food=0;
  }
  rainy.weather='rain';
  progress(clear,3.1); progress(rainy,3.1);
  assert.ok(rainy.resources.food>clear.resources.food);
  assert.equal(validateBuild(clear,'house',clear.waterCells[0]).ok,false);
});
test('resources remain within configured cap', () => {
  const w = createInitialState();
  assert.equal(capacity(w),80);
  progress(w,200);
  for (const n of Object.values(w.resources)) assert.ok(n>=0 && n<=80);
});
test('only depleted resource nodes regenerate', () => {
  const w = createInitialState();
  for (const p of w.persons) p.job='idle';
  const partial = w.nodes[0], depleted = w.nodes[1];
  partial.amount = 40;
  depleted.amount = 0;
  progress(w, BALANCE.nodeRegenEvery + 0.1);
  assert.equal(partial.amount, 40);
  assert.ok(depleted.amount > 0);
});
test('workers do not keep gathering when that stock is full', () => {
  const w = createInitialState();
  const worker = w.persons.find(p => p.role === 'resident' && p.job === 'wood')!;
  w.resources.wood = capacity(w);
  step(w, BALANCE.fixedStep);
  assert.deepEqual(worker.order, { type: 'hold' });
  assert.equal(worker.targetNodeId, null);
});
test('default AI can finish an entire first raid without scene animation', () => {
  const w = createInitialState();
  spawnRaid(w);
  progress(w,45);
  assert.equal(w.encounter?.phase,'victory');
  assert.equal(w.encounter!.raiderIds.length,3);
  assert.equal(w.encounter!.combatXpGranted,true);
});
test('rescue wounded defenders and recover on the same simulation clock', () => {
  const w = createInitialState();
  spawnRaid(w);
  const resident = w.persons.find(p => p.role === 'resident')!;
  resident.life = 'downed'; resident.hp=0;
  for (const p of w.persons.filter(p=>p.role==='raider')) {p.life='downed';p.hp=0;}
  step(w,0.05);
  assert.equal(w.encounter!.phase,'victory');
  assert.equal(resident.life,'wounded');
  assert.equal(w.encounter!.injured.includes(resident.id),true);
  progress(w,121);
  assert.equal(resident.life,'active');
  assert.ok(resident.hp>0);
});
test('food shortage decreases loyalty once per upkeep cycle', () => {
  const w = createInitialState();
  w.resources.food=0;
  for(const p of w.persons) p.job='idle';
  progress(w,61);
  assert.equal(w.loyalty,62);
  assert.equal(w.resources.food,0);
});
