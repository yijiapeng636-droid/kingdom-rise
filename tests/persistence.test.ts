import test from 'node:test';
import assert from 'node:assert/strict';
import { GameController } from '../src/application/GameController.ts';
import { LocalSaveRepository } from '../src/persistence/localSaveRepository.ts';

/** Browser localStorage behaviour mocked at the boundary; no Phaser/Vue required. */
const values = new Map<string,string>();
Object.defineProperty(globalThis, 'localStorage', { configurable:true, value:{
  getItem(key: string) {return values.get(key) ?? null;},
  setItem(key: string,val: string) {values.set(key,val);},
  removeItem(key: string) {values.delete(key);},
} });
test('save + reload restores positions, buildings, levels, raids and date', () => {
  values.clear();
  const game = new GameController(new LocalSaveRepository());
  assert.equal(game.restored,false);
  game.command({type:'build',kind:'farm',cell:{x:14,y:12}});
  game.command({type:'raid'});
  for(let i=0;i<3000;i++) game.frame(50);
  const before=structuredClone(game.getViewState());
  assert.equal(game.save(),true);
  const loaded = new GameController(new LocalSaveRepository());
  assert.equal(loaded.restored,true);
  assert.deepEqual(loaded.getViewState(),before);
  assert.equal(loaded.getViewState().raidTriggered,true);
  loaded.newGame();
  assert.equal(loaded.getViewState().buildings.length,0);
  assert.equal(loaded.getViewState().raidTriggered,false);
});
test('invalid save safely falls back to new game', () => {
  values.clear();
  values.set('kingdom-rise-mvp.save.v3','{"schemaVersion":9}');
  const game = new GameController(new LocalSaveRepository());
  assert.equal(game.restored,false);
  assert.equal(game.getViewState().persons.length,6);
  values.clear();
});
test('version 1 saves migrate population, environment and grid fields', () => {
  values.clear();
  const legacy = { ...structuredClone(new GameController(new LocalSaveRepository()).getViewState()), schemaVersion: 1 };
  delete (legacy as Partial<typeof legacy>).waterCells;
  delete (legacy as Partial<typeof legacy>).weather;
  values.clear(); values.set('kingdom-rise-mvp.save.v1',JSON.stringify(legacy));
  const loaded = new GameController(new LocalSaveRepository()).getViewState();
  assert.equal(loaded.schemaVersion,3);
  assert.ok(loaded.waterCells.length>0);
  assert.ok(loaded.waterCells.every(cell => Number.isInteger(cell.x) && Number.isInteger(cell.y)));
  assert.equal(loaded.weather,'clear');
});
test('version 2 hex cells migrate to version 3 square cells', () => {
  values.clear();
  const current = structuredClone(new GameController(new LocalSaveRepository()).getViewState());
  const legacy = {
    ...current,
    schemaVersion: 2,
    waterCells: current.waterCells.map(cell => ({q:cell.x,r:cell.y})),
    nodes: current.nodes.map(node => ({...node,cell:{q:node.cell.x,r:node.cell.y}})),
    buildings: [{id:'legacy-house',kind:'house',cell:{q:14,r:12},stage:'complete',progress:1,hp:120,builderIds:[]}],
  };
  values.set('kingdom-rise-mvp.save.v2',JSON.stringify(legacy));
  const loaded = new GameController(new LocalSaveRepository()).getViewState();
  assert.equal(loaded.schemaVersion,3);
  assert.deepEqual(loaded.waterCells[0],current.waterCells[0]);
  assert.deepEqual(loaded.buildings[0].cell,{x:14,y:12});
});
