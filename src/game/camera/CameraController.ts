import Phaser from 'phaser';
import type { Point } from '../../domain/model/types.ts';

export class CameraController {
  private following = true;
  constructor(private camera: Phaser.Cameras.Scene2D.Camera, private width: number, private height: number) {}
  isFollowing() { return this.following; }
  focus(target: Point, follow = false) {
    this.following = follow;
    const { width, height, zoom } = this.camera;
    this.camera.centerOn(target.x, target.y);
    this.camera.setBounds(0, 0, this.width, this.height);
    this.camera.setScroll(
      Math.max(0, Math.min(this.width - width / zoom, this.camera.scrollX)),
      Math.max(0, Math.min(this.height - height / zoom, this.camera.scrollY)),
    );
  }
  detach() { this.following = false; }
  pan(dx: number, dy: number) {
    this.following = false;
    this.camera.scrollX = Math.max(0, Math.min(this.width - this.camera.width / this.camera.zoom, this.camera.scrollX + dx));
    this.camera.scrollY = Math.max(0, Math.min(this.height - this.camera.height / this.camera.zoom, this.camera.scrollY + dy));
  }
  zoom(delta: number) {
    this.camera.setZoom(Phaser.Math.Clamp(this.camera.zoom + delta, 0.55, 1.7));
    this.camera.setBounds(0, 0, this.width, this.height);
  }
  update(target: Point | undefined) {
    if (this.following && target) this.focus(target, true);
  }
}
