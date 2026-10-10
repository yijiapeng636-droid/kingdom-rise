import type { BuildingKind, WorldState } from '../domain/model/types.ts';
import { GameController } from '../application/GameController.ts';
import { createPhaserGame } from '../game/config/gameConfig.ts';
import type { SceneCallbacks } from '../game/scenes/WorldScene.ts';

/** Thin adapter: Vue emits commands, Phaser emits input commands; neither modifies state. */
export class GameBridge {
  readonly controller = new GameController();
  private scene: ReturnType<typeof createPhaserGame> | null = null;
  mount(parent: string, callbacks: SceneCallbacks) {
    this.scene = createPhaserGame(parent, this.controller, callbacks);
  }
  subscribe(listener: (state: WorldState) => void) { return this.controller.subscribe(listener); }
  setBuildMode(mode: BuildingKind | null) { this.scene?.scene.setBuildMode(mode); }
  selectUnits(ids: string[]) { this.scene?.scene.selectUnits(ids); }
  followLeader() { this.scene?.scene.focusLeader(); }
  focusRaid() { this.scene?.scene.focusRaid(); }
  save() { return this.controller.save(); }
  destroy() { this.save(); this.scene?.game.destroy(true); this.scene = null; }
}
