import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../src/domain/model/initialState.ts';
import { center } from '../src/domain/navigation/grid.ts';
import { resolveUnitAction } from '../src/game/animation/resolveUnitAction.ts';
import type { Building } from '../src/domain/model/types.ts';

const initialize = () => {
  const w = createInitialState();
  const p = w.persons.find(p => p.role === 'resident')!;
  p.path = [];
  p.order = { type: 'hold' };
  p.previousPosition = { ...p.position };
  return { w, p };
};

test('idle work assignment without a site remains idle', () => {
  const { w, p } = initialize();
  p.job = 'build';
  assert.equal(resolveUnitAction(p, w), 'idle');
});
test('movement takes priority over farming, construction and attack', () => {
  const { w, p } = initialize();
  p.path = [{ x: p.position.x + 4, y: p.position.y + 2 }];
  p.order = { type: 'attack', targetId: 'anything' };
  assert.equal(resolveUnitAction(p, w), 'walk');
});
test('wood, stone and food harvesting resolve by node data, not by a hard-coded resident role', () => {
  const { w, p } = initialize();
  for (const node of w.nodes.filter(n => n.amount > 0)) {
    p.position = center(node.cell);
    p.previousPosition = { ...p.position };
    p.order = { type: 'gather', nodeId: node.id };
    assert.equal(resolveUnitAction(p, w), node.kind);
  }
});
test('farm animation requires a completed farm and task proximity', () => {
  const { w, p } = initialize();
  const farm: Building = {
    id: 'farm-test', kind: 'farm', cell: { x: 8, y: 8 }, stage: 'construction',
    progress: 0.5, hp: 100, builderIds: [],
  };
  w.buildings.push(farm);
  p.position = center(farm.cell); p.previousPosition = { ...p.position };
  p.job = 'farm'; p.targetBuildingId = farm.id;
  assert.equal(resolveUnitAction(p, w), 'idle');
  farm.stage = 'complete';
  assert.equal(resolveUnitAction(p, w), 'farm');
  p.position.x += 150; p.previousPosition = { ...p.position };
  assert.equal(resolveUnitAction(p, w), 'idle');
});
test('construction animation stops when the foundation is completed', () => {
  const { w, p } = initialize();
  const site: Building = {
    id: 'site-test', kind: 'house', cell: { x: 8, y: 8 }, stage: 'foundation',
    progress: 0, hp: 100, builderIds: [],
  };
  w.buildings.push(site);
  p.position = center(site.cell); p.previousPosition = { ...p.position };
  p.job = 'build'; p.targetBuildingId = site.id;
  assert.equal(resolveUnitAction(p, w), 'build');
  site.stage = 'complete';
  assert.equal(resolveUnitAction(p, w), 'idle');
});
test('attack and health states are visually distinguishable', () => {
  const { w, p } = initialize();
  p.order = { type: 'attack', targetId: 'test-target' };
  assert.equal(resolveUnitAction(p, w), 'combat');
  p.life = 'downed';
  assert.equal(resolveUnitAction(p, w), 'downed');
  p.life = 'wounded';
  assert.equal(resolveUnitAction(p, w), 'wounded');
  p.life = 'prisoner';
  assert.equal(resolveUnitAction(p, w), 'prisoner');
});
test('animation action resolution never mutates simulation state', () => {
  const { w, p } = initialize();
  const before = JSON.stringify(w);
  resolveUnitAction(p, w);
  assert.equal(JSON.stringify(w), before);
});
