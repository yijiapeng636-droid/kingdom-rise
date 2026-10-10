import type { CommandResult, GameCommand, WorldState } from '../domain/model/types.ts';
import { createInitialState } from '../domain/model/initialState.ts';
import { BALANCE } from '../game/config/balance.ts';
import { execute, step } from './Simulation.ts';
import { LocalSaveRepository, type SaveRepository } from '../persistence/localSaveRepository.ts';

/** The only writer of WorldState; UI and renderer receive snapshots/read-only views. */
export class GameController {
  private state: WorldState;
  private listeners = new Set<(state: WorldState) => void>();
  private accumulator = 0;
  private publishTimer = 0;
  private saveTimer = 0;
  private repository: SaveRepository;
  public alpha = 0;
  public restored = false;

  constructor(repo: SaveRepository = new LocalSaveRepository()) {
    this.repository = repo;
    const restored = repo.load();
    this.restored = !!restored;
    this.state = restored ?? createInitialState(undefined, Date.now() >>> 0);
  }
  getViewState(): Readonly<WorldState> { return this.state; }
  subscribe(listener: (state: WorldState) => void): () => void {
    this.listeners.add(listener);
    listener(structuredClone(this.state));
    return () => this.listeners.delete(listener);
  }
  private publish() {
    if (!this.listeners.size) return;
    const immutableSnapshot = structuredClone(this.state);
    for (const cb of this.listeners) cb(immutableSnapshot);
  }
  command(command: GameCommand): CommandResult {
    const res = execute(this.state, command);
    if (res.ok) { this.publish(); this.save(); }
    return res;
  }
  frame(deltaMilliseconds: number) {
    const elapsed = Math.min(0.25, Math.max(0, deltaMilliseconds / 1000));
    if (!this.state.paused && !this.state.gameOver) this.accumulator += elapsed * this.state.speed;
    let iterations = 0;
    while (this.accumulator >= BALANCE.fixedStep && iterations++ < 12) {
      step(this.state, BALANCE.fixedStep);
      this.accumulator -= BALANCE.fixedStep;
    }
    if (iterations >= 12) this.accumulator = Math.min(this.accumulator, BALANCE.fixedStep);
    this.alpha = this.accumulator / BALANCE.fixedStep;
    this.publishTimer += elapsed;
    this.saveTimer += elapsed;
    if (this.publishTimer >= 0.15) { this.publish(); this.publishTimer = 0; }
    if (this.saveTimer >= 6) { this.save(); this.saveTimer = 0; }
  }
  save() { return this.repository.save(this.state); }
  newGame() {
    this.repository.clear(); this.state = createInitialState(undefined, Date.now() >>> 0);
    this.accumulator = 0; this.alpha = 0; this.restored = false;
    this.publish(); this.save();
  }
}
