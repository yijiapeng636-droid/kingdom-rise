/** Visual-only tuning. None of these settings change simulation rules or saves. */
export type UnitAction =
  | 'idle' | 'walk' | 'wood' | 'stone' | 'food' | 'farm' | 'build'
  | 'combat' | 'downed' | 'wounded' | 'prisoner';

export const ANIMATION = {
  // Frequency in cycles per game-second (driven by simulation speed, stopped on pause).
  cadence: {
    idle: 0.65, walk: 2.5, wood: 1.55, stone: 1.4, food: 1.3,
    farm: 1.05, build: 1.7, combat: 0.7,
    downed: 0, wounded: 0.25, prisoner: 0.35,
  } satisfies Record<UnitAction, number>,
  attackSwingSeconds: 0.36,
  maxVisualDelta: 0.06,
  hitFlashSeconds: 0.16,
  workParticlesSeconds: 0.4,
  showParticles: true,
  palette: {
    leader: 0xf0c56c,
    resident: 0x86c2a8,
    raider: 0xb8554a,
    wood: 0x83c88b,
    stone: 0xd3dcce,
    food: 0xebc679,
    build: 0xeec487,
    hit: 0xff8f75,
  },
} as const;
