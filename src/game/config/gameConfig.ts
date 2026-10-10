import Phaser from 'phaser';
import type { GameController } from '../../application/GameController.ts';
import { WorldScene, type SceneCallbacks } from '../scenes/WorldScene.ts';
export function createPhaserGame(parent: string, controller: GameController, callbacks: SceneCallbacks) {
  const scene = new WorldScene(controller, callbacks);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#152b29',
    render: { pixelArt: false, antialias: true },
    scale: { mode: Phaser.Scale.RESIZE, width: 1000, height: 650 },
    scene: [scene],
    audio: { noAudio: true },
  });
  return { game, scene };
}
