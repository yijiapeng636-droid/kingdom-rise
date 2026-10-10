import Phaser from 'phaser';
import type { BuildingKind, Cell, Person, Point, ResourceNode, WeatherKind, WorldState } from '../../domain/model/types.ts';
import { BALANCE } from '../config/balance.ts';
import { BUILDINGS } from '../config/buildings.ts';
import { center, distance, toCell, inBounds } from '../../domain/navigation/grid.ts';
import { validateBuild } from '../../application/Simulation.ts';
import { GameController } from '../../application/GameController.ts';
import { MapView, square } from '../map/MapView.ts';
import { UnitView } from '../entities/UnitView.ts';
import { BuildingView } from '../entities/BuildingView.ts';
import { CameraController } from '../camera/CameraController.ts';
import { VisualEffects } from '../animation/VisualEffects.ts';
import { HOLDING_CELL } from '../config/scenario.ts';

export interface SceneCallbacks {
  selection(ids: string[], buildingId: string | null): void;
  feedback(message: string, success: boolean): void;
  focusChanged(following: boolean): void;
  buildModeChanged(mode: BuildingKind | null): void;
}

const nodeStage = (node: ResourceNode) => node.amount <= 0 ? 0
  : node.amount / node.maxAmount <= 1 / 3 ? 1
  : node.amount / node.maxAmount <= 2 / 3 ? 2 : 3;

export class WorldScene extends Phaser.Scene {
  private units = new Map<string, UnitView>();
  private buildings = new Map<string, BuildingView>();
  private nodes = new Map<string, Phaser.GameObjects.Container>();
  private buildingStages = new Map<string, string>();
  private effects!: VisualEffects;
  private lastWorldTick = 0;
  private previousEncounterId: string | null = null;
  private previousWeather: WeatherKind | null = null;
  private weatherOverlay!: Phaser.GameObjects.Rectangle;
  private selected = new Set<string>();
  private overlay!: Phaser.GameObjects.Graphics;
  private dragOverlay!: Phaser.GameObjects.Graphics;
  private cameraControl!: CameraController;
  private buildMode: BuildingKind | null = null;
  private down: { x: number; y: number; wx: number; wy: number } | null = null;
  private draggingCamera = false;
  private cameraDragLast: { x: number; y: number } | null = null;
  private draggingSelection = false;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private map!: MapView;
  private ready = false;

  constructor(private controller: GameController, private callbacks: SceneCallbacks) { super({ key: 'WorldScene' }); }
  create() {
    this.map = new MapView(this, this.controller.getViewState().waterCells);
    const holding = center(HOLDING_CELL);
    const pen = this.add.graphics().setDepth(55);
    pen.fillStyle(0x3b3025, 0.5).fillRoundedRect(holding.x - 29, holding.y - 19, 58, 38, 5);
    pen.lineStyle(3, 0x8b6b45, 0.95).strokeRoundedRect(holding.x - 29, holding.y - 19, 58, 38, 5);
    for (let x = -20; x <= 20; x += 10) pen.lineBetween(holding.x + x, holding.y - 18, holding.x + x, holding.y + 18);
    this.add.text(holding.x, holding.y + 25, '收押区', { fontSize: '10px', color: '#d7bd8b', stroke: '#182720', strokeThickness: 3 }).setOrigin(0.5).setDepth(56);
    this.weatherOverlay = this.add.rectangle(this.map.width / 2, this.map.height / 2, this.map.width, this.map.height, 0x000000, 0).setDepth(49000);
    this.effects = new VisualEffects(this);
    this.previousEncounterId = this.controller.getViewState().encounter?.id ?? null;
    this.cameraControl = new CameraController(this.cameras.main, this.map.width, this.map.height);
    this.cameras.main.setBackgroundColor('#182c2b');
    this.cameras.main.setBounds(0, 0, this.map.width, this.map.height);
    this.cameras.main.setZoom(0.95);
    const leader = this.controller.getViewState().persons.find(p => p.role === 'leader');
    if (leader) this.cameraControl.focus(leader.position, true);
    this.overlay = this.add.graphics().setDepth(50000);
    this.dragOverlay = this.add.graphics().setDepth(60000);
    this.renderNodes(this.controller.getViewState());
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,ESC,F') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.on('pointerdown', this.pointerDown, this);
    this.input.on('pointermove', this.pointerMove, this);
    this.input.on('pointerup', this.pointerUp, this);
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: unknown, _x: number, dy: number) => this.cameraControl.zoom(dy > 0 ? -0.08 : 0.08));
    this.game.canvas.addEventListener('contextmenu', this.preventMenu);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.canvas.removeEventListener('contextmenu', this.preventMenu);
      this.effects.destroy();
    });
    this.ready = true;
  }
  private preventMenu = (ev: Event) => ev.preventDefault();
  setBuildMode(mode: BuildingKind | null) { this.buildMode = mode; }
  selectUnits(ids: string[]) {
    this.selected = new Set(ids);
    this.callbacks.selection(ids, null);
  }
  focusLeader() {
    if (!this.ready) return;
    const leader = this.controller.getViewState().persons.find(p => p.role === 'leader');
    if (leader) { this.cameraControl.focus(leader.position, true); this.callbacks.focusChanged(true); }
  }
  focusRaid() {
    if (!this.ready) return;
    const p = this.controller.getViewState().persons.find(p => p.role === 'raider' && p.life === 'active');
    if (p) { this.cameraControl.focus(p.position); this.callbacks.focusChanged(false); }
  }
  private issue(command: Parameters<GameController['command']>[0]) {
    const output = this.controller.command(command);
    this.callbacks.feedback(output.message, output.ok);
  }
  private pointerDown(pointer: Phaser.Input.Pointer) {
    const button = 'button' in pointer.event ? pointer.event.button : 0;
    if (button === 2) { this.rightClick(pointer); return; }
    if (button === 1 || (this.keys.SPACE.isDown && button === 0)) {
      this.draggingCamera = true; this.cameraDragLast = { x: pointer.x, y: pointer.y }; this.cameraControl.detach(); this.callbacks.focusChanged(false); return;
    }
    if (button !== 0) return;
    this.down = { x: pointer.x, y: pointer.y, wx: pointer.worldX, wy: pointer.worldY };
    this.draggingSelection = false;
  }
  private pointerMove(pointer: Phaser.Input.Pointer) {
    if (this.draggingCamera && pointer.isDown) {
      if (this.cameraDragLast) this.cameraControl.pan((this.cameraDragLast.x - pointer.x) / this.cameras.main.zoom, (this.cameraDragLast.y - pointer.y) / this.cameras.main.zoom);
      this.cameraDragLast = { x: pointer.x, y: pointer.y };
      return;
    }
    if (this.down && pointer.isDown && !this.buildMode) {
      const moving = Math.hypot(pointer.x - this.down.x, pointer.y - this.down.y);
      if (moving > 10) this.draggingSelection = true;
      this.dragOverlay.clear();
      if (this.draggingSelection) {
        this.dragOverlay.fillStyle(0x8cb99f, 0.12).fillRect(Math.min(this.down.wx, pointer.worldX), Math.min(this.down.wy, pointer.worldY), Math.abs(pointer.worldX - this.down.wx), Math.abs(pointer.worldY - this.down.wy));
        this.dragOverlay.lineStyle(1, 0xc9e6b1, 0.9).strokeRect(Math.min(this.down.wx, pointer.worldX), Math.min(this.down.wy, pointer.worldY), Math.abs(pointer.worldX - this.down.wx), Math.abs(pointer.worldY - this.down.wy));
      }
    }
  }
  private pointerUp(pointer: Phaser.Input.Pointer) {
    if (this.draggingCamera) { this.draggingCamera = false; this.cameraDragLast = null; return; }
    if (!this.down || ('button' in pointer.event && pointer.event.button !== 0)) return;
    const start = this.down; this.down = null; this.dragOverlay.clear();
    if (this.buildMode) {
      const cell = toCell({ x: pointer.worldX, y: pointer.worldY });
      if (inBounds(cell)) this.issue({ type: 'build', kind: this.buildMode, cell });
      return;
    }
    if (this.draggingSelection) {
      this.draggingSelection = false;
      const minX = Math.min(start.wx, pointer.worldX), minY = Math.min(start.wy, pointer.worldY);
      const maxX = Math.max(start.wx, pointer.worldX), maxY = Math.max(start.wy, pointer.worldY);
      const ids = this.controller.getViewState().persons.filter(p => p.team === 'settlement' && p.life === 'active' && p.position.x >= minX && p.position.x <= maxX && p.position.y >= minY && p.position.y <= maxY).map(p => p.id);
      this.selected = new Set(ids); this.callbacks.selection(ids, null);
      return;
    }
    const point = { x: pointer.worldX, y: pointer.worldY };
    const person = this.pickPerson(point, 'settlement');
    const building = this.controller.getViewState().buildings.find(b => distance(center(b.cell), point) < 23);
    if (person) {
      if (!('shiftKey' in pointer.event && pointer.event.shiftKey)) this.selected.clear();
      this.selected.add(person.id);
      this.callbacks.selection([...this.selected], null);
    } else {
      this.selected.clear(); this.callbacks.selection([], building?.id ?? null);
    }
  }
  private rightClick(pointer: Phaser.Input.Pointer) {
    if (this.buildMode) return;
    if (!this.selected.size) { this.callbacks.feedback('左键选中领袖或居民，再右键下达命令', false); return; }
    const point = { x: pointer.worldX, y: pointer.worldY };
    const enemy = this.pickPerson(point, 'raiders');
    const node = this.controller.getViewState().nodes.find(n => n.amount > 0 && distance(center(n.cell), point) < 22);
    const order = enemy ? { type: 'attack' as const, targetId: enemy.id } : node ? { type: 'gather' as const, nodeId: node.id } : { type: 'move' as const, destination: point };
    this.issue({ type: 'order', personIds: [...this.selected], order });
  }
  private pickPerson(p: Point, team: Person['team']): Person | undefined {
    return this.controller.getViewState().persons.filter(v => v.team === team && v.life === 'active' && distance({ x: v.position.x, y: v.position.y - 15 }, p) < 30).sort((a, b) => distance(a.position, p) - distance(b.position, p))[0];
  }
  private renderNodes(world: Readonly<WorldState>) {
    for (const n of world.nodes) {
      if (this.nodes.has(n.id)) continue;
      const loc = center(n.cell);
      const art = this.add.graphics();
      this.drawNode(art, n);
      const node = this.add.container(loc.x, loc.y, [art]).setDepth(60 + Math.floor(loc.y));
      node.setData('stage', nodeStage(n));
      this.nodes.set(n.id, node);
    }
  }
  private drawNode(g: Phaser.GameObjects.Graphics, n: ResourceNode) {
    g.clear();
    g.fillStyle(0x081b19, 0.3).fillEllipse(0, 8, 35, 13);
    const stage = nodeStage(n);
    if (stage === 0) {
      if (n.kind === 'wood') g.fillStyle(0x644e36).fillRoundedRect(-7, -2, 14, 10, 2);
      else if (n.kind === 'stone') g.fillStyle(0x667674).fillCircle(-8, 4, 5).fillCircle(5, 5, 4).fillCircle(12, 6, 3);
      else g.fillStyle(0x3f4f30, 0.8).fillEllipse(0, 4, 25, 10);
      return;
    }
    if (n.kind === 'wood') {
      g.fillStyle(0x644e36).fillRoundedRect(-4, -17, 8, 28, 2);
      g.fillStyle(0x1f493a).fillCircle(0, -23, 9 + stage * 2);
      if (stage >= 2) g.fillStyle(0x2e7451).fillCircle(-7, -29, 9 + stage);
      if (stage >= 3) {
        g.fillStyle(0x3a8c60).fillCircle(7, -27, 12);
        g.fillStyle(0x52885b, 0.8).fillCircle(1, -37, 8);
      }
    } else if (n.kind === 'stone') {
      g.fillStyle(0x788a88).fillTriangle(-20, 8, -11, -16, 3, -12);
      if (stage >= 2) g.fillStyle(0x9ca7a2).fillTriangle(-8, 10, 9, -21, 20, 7);
      if (stage >= 3) g.fillStyle(0x4f6868).fillTriangle(8, -20, 20, 8, 8, 8);
    } else if (n.foodKind === 'fruit') {
      g.fillStyle(0x654a31).fillRoundedRect(-3, -14, 6, 23, 2);
      g.fillStyle(0x35633e).fillCircle(0, -19, 10 + stage * 2);
      for (let i = 0; i < stage + 1; i++) g.fillStyle(0xd88d55).fillCircle(-8 + i * 6, -22 - i % 2 * 5, 3);
    } else if (n.foodKind === 'fish') {
      g.lineStyle(2, 0x83c5ce, 0.8).strokeEllipse(0, 3, 28 + stage * 3, 10 + stage);
      g.fillStyle(0x9ec6bd).fillEllipse(0, -2, 13 + stage * 2, 6 + stage);
      g.fillTriangle(-8, -2, -15, -8, -15, 4);
    } else if (n.foodKind === 'game') {
      g.fillStyle(0x9a7650).fillEllipse(0, -6, 21 + stage * 2, 11 + stage);
      g.fillCircle(13, -10, 6); g.lineStyle(2, 0x72543b).lineBetween(-6, 0, -9, 10).lineBetween(6, 0, 9, 10);
    } else {
      g.fillStyle(0x526f3a).fillEllipse(0, 1, 20 + stage * 4, 12 + stage * 2);
      for (let i = 0; i < stage * 2; i++) {
        g.fillStyle(i % 2 ? 0xca6554 : 0xd4af5e).fillCircle(-12 + (i * 7) % 27, -2 - (i * 5) % 10, 3);
      }
    }
  }
  private keyControls(delta: number) {
    const speed = 0.48 * delta / this.cameras.main.zoom;
    let dx = 0, dy = 0;
    if (this.keys.W.isDown || this.keys.UP.isDown) dy -= speed;
    if (this.keys.S.isDown || this.keys.DOWN.isDown) dy += speed;
    if (this.keys.A.isDown || this.keys.LEFT.isDown) dx -= speed;
    if (this.keys.D.isDown || this.keys.RIGHT.isDown) dx += speed;
    if (dx || dy) { this.cameraControl.pan(dx, dy); this.callbacks.focusChanged(false); }
    if (Phaser.Input.Keyboard.JustDown(this.keys.F)) this.focusLeader();
    if (Phaser.Input.Keyboard.JustDown(this.keys.ESC)) { this.buildMode = null; this.callbacks.buildModeChanged(null); this.callbacks.feedback('已退出建造模式', true); }
  }
  update(_time: number, delta: number) {
    if (!this.ready) return;
    this.controller.frame(delta);
    this.keyControls(delta);
    const world = this.controller.getViewState();
    // Driven by GAME seconds, not wall-clock. All gameplay animations freeze on pause.
    const gameDelta = world.paused || world.gameOver ? 0
      : Math.min(delta / 1000, 0.06) * world.speed;
    if (world.tick < this.lastWorldTick) {
      // Starting a new game invalidates visual-only caches, even when IDs are reused.
      for (const v of this.units.values()) v.destroy();
      for (const v of this.buildings.values()) v.destroy();
      this.units.clear(); this.buildings.clear(); this.buildingStages.clear();
      this.selected.clear();
      this.effects.destroy(); this.effects = new VisualEffects(this);
      this.previousEncounterId = null;
    }
    this.lastWorldTick = world.tick;
    this.cameraControl.update(world.persons.find(p => p.role === 'leader')?.position);
    if (world.encounter?.phase === 'active' && world.encounter.id !== this.previousEncounterId) {
      const raider = world.persons.find(p => world.encounter!.raiderIds.includes(p.id) && p.life === 'active');
      if (raider) this.effects.raid(raider.position);
    }
    this.previousEncounterId = world.encounter?.id ?? null;
    if (this.previousWeather !== world.weather) {
      const tint: Record<WeatherKind, [number, number]> = { clear: [0xf4cf83, 0.025], rain: [0x4e7d91, 0.12], storm: [0x23394d, 0.24], cold: [0xb8d7de, 0.12] };
      this.weatherOverlay.setFillStyle(...tint[world.weather]);
      this.previousWeather = world.weather;
    }
    for (const [id, view] of this.units) {
      if (!world.persons.some(p => p.id === id)) { view.destroy(); this.units.delete(id); }
    }
    for (const p of world.persons) {
      if (!this.units.has(p.id)) this.units.set(p.id, new UnitView(this, p, this.effects));
      this.units.get(p.id)!.update(p, world, this.controller.alpha, this.selected.has(p.id), gameDelta);
    }
    for (const b of world.buildings) {
      if (!this.buildings.has(b.id)) {
        this.buildings.set(b.id, new BuildingView(this, b));
        this.buildingStages.set(b.id, b.stage);
      }
      const previousStage = this.buildingStages.get(b.id);
      if (previousStage && previousStage !== 'complete' && b.stage === 'complete') {
        this.effects.finished(center(b.cell));
      }
      this.buildingStages.set(b.id, b.stage);
      this.buildings.get(b.id)!.update(b);
    }
    for (const [id, view] of this.buildings) {
      if (!world.buildings.some(b => b.id === id)) {
        view.destroy(); this.buildings.delete(id); this.buildingStages.delete(id);
      }
    }
    // Small ambient motion gives resource nodes presence, without affecting picking or physics.
    for (const [index, n] of world.nodes.entries()) {
      const view = this.nodes.get(n.id);
      if (!view) continue;
      const stage = nodeStage(n);
      if (view.getData('stage') !== stage) {
        this.drawNode(view.list[0] as Phaser.GameObjects.Graphics, n);
        view.setData('stage', stage);
      }
      const art = view.list[0] as Phaser.GameObjects.Graphics;
      art.setRotation(n.kind === 'wood' && n.amount > 0 ? Math.sin(world.time * 1.1 + index) * 0.027 : 0);
      art.y = n.kind === 'food' && n.amount > 0 ? Math.sin(world.time * 1.7 + index) * 0.7 : 0;
    }
    this.effects.update(gameDelta);
    this.drawOverlays(world);
  }
  private drawOverlays(world: Readonly<WorldState>) {
    this.overlay.clear();
    if (this.buildMode && this.input.activePointer) {
      const c: Cell = toCell({ x: this.input.activePointer.worldX, y: this.input.activePointer.worldY });
      if (inBounds(c)) {
        const valid = validateBuild(world as WorldState, this.buildMode, c).ok;
        const at = center(c);
        square(this.overlay, at.x, at.y, BALANCE.cellSize - 4, valid ? 0x86df9f : 0xf2786c, 0.48);
        this.overlay.lineStyle(2, valid ? 0xb2efba : 0xf6988c)
          .strokeRect(at.x - BALANCE.cellSize / 2 + 2, at.y - BALANCE.cellSize / 2 + 2, BALANCE.cellSize - 4, BALANCE.cellSize - 4);
      }
    }
    for (const p of world.persons) {
      if (!this.selected.has(p.id) || p.life !== 'active') continue;
      this.overlay.lineStyle(2, 0xf1d59a, 0.93).strokeEllipse(p.position.x, p.position.y, 31, 14);
      if (p.path.length) {
        this.overlay.lineStyle(1.5, 0xefcf8f, 0.45);
        let previous = p.position;
        for (const target of p.path) { this.overlay.lineBetween(previous.x, previous.y, target.x, target.y); previous = target; }
      }
    }
    if (world.encounter?.phase === 'active') for (const id of world.encounter.raiderIds) {
      const raider = world.persons.find(p => p.id === id);
      if (raider?.life === 'active') this.overlay.lineStyle(1, 0xf18e81, 0.65).strokeCircle(raider.position.x, raider.position.y - 14, 21);
    }
  }
}
