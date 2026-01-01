export type CharacterClass = 'warrior' | 'mage' | 'rogue' | 'archer';

export interface CharacterStats {
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  critChance: number;
  critDamage: number;
}

export interface Character {
  id: string;
  userId: string;
  name: string;
  class: CharacterClass;
  level: number;
  xp: number;
  xpToNextLevel: number;
  stats: CharacterStats;
  equippedWeaponId: string | null;
  equippedArmorId: string | null;
  equippedSpellIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CharacterClassConfig {
  name: CharacterClass;
  displayName: string;
  description: string;
  baseStats: CharacterStats;
  statGrowth: CharacterStats; // stats gained per level
  spriteSheet: string;
}

export const CLASS_CONFIGS: Record<CharacterClass, CharacterClassConfig> = {
  warrior: {
    name: 'warrior',
    displayName: 'Warrior',
    description: 'High HP and attack, can take and deal heavy damage',
    baseStats: { maxHp: 120, attack: 15, defense: 12, speed: 8, critChance: 0.05, critDamage: 1.5 },
    statGrowth: { maxHp: 12, attack: 2, defense: 1.5, speed: 0.5, critChance: 0.005, critDamage: 0.02 },
    spriteSheet: 'warrior.png'
  },
  mage: {
    name: 'mage',
    displayName: 'Mage',
    description: 'Low HP but devastating spell power',
    baseStats: { maxHp: 70, attack: 20, defense: 5, speed: 10, critChance: 0.1, critDamage: 2.0 },
    statGrowth: { maxHp: 6, attack: 3, defense: 0.5, speed: 1, critChance: 0.01, critDamage: 0.05 },
    spriteSheet: 'mage.png'
  },
  rogue: {
    name: 'rogue',
    displayName: 'Rogue',
    description: 'Fast and deadly, strikes first with high crit chance',
    baseStats: { maxHp: 85, attack: 14, defense: 7, speed: 18, critChance: 0.2, critDamage: 2.5 },
    statGrowth: { maxHp: 8, attack: 1.5, defense: 0.8, speed: 2, critChance: 0.015, critDamage: 0.08 },
    spriteSheet: 'rogue.png'
  },
  archer: {
    name: 'archer',
    displayName: 'Archer',
    description: 'Balanced fighter with consistent damage output',
    baseStats: { maxHp: 90, attack: 16, defense: 8, speed: 14, critChance: 0.12, critDamage: 1.8 },
    statGrowth: { maxHp: 9, attack: 2, defense: 1, speed: 1.5, critChance: 0.008, critDamage: 0.04 },
    spriteSheet: 'archer.png'
  }
};
