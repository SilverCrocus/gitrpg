export type CharacterClass = 'warrior' | 'mage' | 'rogue' | 'archer';

export type AnimationName = 'idle' | 'walk' | 'attack' | 'hurt' | 'death' | 'victory';

export interface AnimationConfig {
  frames: number;
  frameRate: number;
  loop: boolean;
}

export interface CharacterSpriteProps {
  /** Character class determines which sprite set to load */
  characterClass: CharacterClass;

  /** Static pose to display (ignored if animation is set) */
  pose?: AnimationName;

  /** Animation to play (overrides pose) */
  animation?: AnimationName;

  /** Size in pixels (SVG scales cleanly) */
  size?: number;

  /** Frame rate override (default from animation config) */
  frameRate?: number;

  /** Callback when non-looping animation completes */
  onAnimationComplete?: () => void;

  /** Custom colors (future: for equipment recoloring) */
  colors?: {
    armorPrimary?: string;
    armorSecondary?: string;
  };
}

export const ANIMATION_CONFIG: Record<CharacterClass, Record<AnimationName, AnimationConfig>> = {
  warrior: {
    idle: { frames: 3, frameRate: 4, loop: true },
    walk: { frames: 6, frameRate: 8, loop: true },
    attack: { frames: 6, frameRate: 12, loop: false },
    hurt: { frames: 3, frameRate: 6, loop: false },
    death: { frames: 6, frameRate: 6, loop: false },
    victory: { frames: 3, frameRate: 4, loop: true },
  },
  mage: {
    idle: { frames: 3, frameRate: 4, loop: true },
    walk: { frames: 6, frameRate: 8, loop: true },
    attack: { frames: 6, frameRate: 12, loop: false },
    hurt: { frames: 3, frameRate: 6, loop: false },
    death: { frames: 6, frameRate: 6, loop: false },
    victory: { frames: 3, frameRate: 4, loop: true },
  },
  rogue: {
    idle: { frames: 3, frameRate: 4, loop: true },
    walk: { frames: 6, frameRate: 8, loop: true },
    attack: { frames: 6, frameRate: 12, loop: false },
    hurt: { frames: 3, frameRate: 6, loop: false },
    death: { frames: 6, frameRate: 6, loop: false },
    victory: { frames: 3, frameRate: 4, loop: true },
  },
  archer: {
    idle: { frames: 3, frameRate: 4, loop: true },
    walk: { frames: 6, frameRate: 8, loop: true },
    attack: { frames: 6, frameRate: 12, loop: false },
    hurt: { frames: 3, frameRate: 6, loop: false },
    death: { frames: 6, frameRate: 6, loop: false },
    victory: { frames: 3, frameRate: 4, loop: true },
  },
};
