// Extension-local type definitions
// These mirror the main src/types but are kept local to avoid rootDir issues

export type CharacterClass = 'warrior' | 'mage' | 'rogue' | 'archer';

export interface CharacterStats {
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  critChance: number;
  critDamage: number;
}

export interface BattleAction {
  turn: number;
  timestamp: Date;
  actorId: string;
  actionType: 'attack' | 'spell' | 'defend';
  targetId: string;
  damage: number;
  isCrit: boolean;
  resultingHp: number;
}

export interface BattleRewards {
  xp: number;
  gold: number;
}
