// Character class configurations and game constants
// This file centralizes all game configuration to make balancing and updates easier

import {
  CharacterClass,
  CharacterStats,
  QuestTemplate,
  WorkerConfig,
  BossDefinition,
} from '../types/index';

// Re-export CharacterClass for convenience
export type { CharacterClass };

// ============================================================================
// CHARACTER CLASS BASE STATS
// ============================================================================

/**
 * Base stats for each character class at level 1.
 * These stats scale with level using calculateStatsForLevel().
 *
 * Warrior: Tank with high HP and defense, lower speed
 * Mage: Glass cannon with high attack and crit damage, low defense
 * Rogue: Fast and deadly with highest crit chance, balanced otherwise
 * Archer: Balanced ranged fighter with good speed and crit damage
 */
export const CLASS_BASE_STATS: Record<CharacterClass, CharacterStats> = {
  Warrior: {
    maxHp: 120,
    attack: 15,
    defense: 12,
    speed: 8,
    critChance: 0.1,
    critDamage: 1.5,
  },
  Mage: {
    maxHp: 80,
    attack: 18,
    defense: 6,
    speed: 10,
    critChance: 0.15,
    critDamage: 1.8,
  },
  Rogue: {
    maxHp: 90,
    attack: 14,
    defense: 8,
    speed: 15,
    critChance: 0.25,
    critDamage: 2.0,
  },
  Archer: {
    maxHp: 85,
    attack: 16,
    defense: 7,
    speed: 12,
    critChance: 0.2,
    critDamage: 1.7,
  },
};

// ============================================================================
// LEVELING SYSTEM
// ============================================================================

/**
 * Level scaling configuration.
 * XP requirement increases by XP_GROWTH_RATE each level.
 */
export const LEVEL_CONFIG = {
  /** Base XP required to reach level 2 */
  baseXp: 100,
  /** Multiplier for XP requirements per level (1.5 = 50% increase per level) */
  xpGrowthRate: 1.5,
  /** HP increase per level (10% of base per level) */
  hpGrowthRate: 0.1,
  /** Attack/Defense increase per level (8% of base per level) */
  statGrowthRate: 0.08,
  /** Gold reward multiplier on level up (50 * level) */
  goldPerLevel: 50,
} as const;

/**
 * Calculate XP required to reach a specific level.
 * Formula: 100 * 1.5^(level-1)
 *
 * @param level - The target level (1+)
 * @returns XP required to reach that level from the previous level
 */
export function xpForLevel(level: number): number {
  return Math.floor(LEVEL_CONFIG.baseXp * Math.pow(LEVEL_CONFIG.xpGrowthRate, level - 1));
}

/**
 * Calculate stats for a character at a specific level.
 * HP scales at 10% per level, attack/defense at 8% per level.
 * Speed, critChance, and critDamage remain constant.
 *
 * @param baseStats - The base stats for the character's class
 * @param level - The character's current level
 * @returns Calculated stats for that level
 */
export function calculateStatsForLevel(baseStats: CharacterStats, level: number): CharacterStats {
  return {
    maxHp: Math.floor(baseStats.maxHp * (1 + (level - 1) * LEVEL_CONFIG.hpGrowthRate)),
    attack: Math.floor(baseStats.attack * (1 + (level - 1) * LEVEL_CONFIG.statGrowthRate)),
    defense: Math.floor(baseStats.defense * (1 + (level - 1) * LEVEL_CONFIG.statGrowthRate)),
    speed: baseStats.speed,
    critChance: baseStats.critChance,
    critDamage: baseStats.critDamage,
  };
}

// ============================================================================
// XP CALCULATION
// ============================================================================

/**
 * XP rewards for different git activities.
 * Lines are capped to prevent gaming via large auto-generated files.
 */
export const XP_CONFIG = {
  /** XP earned per commit */
  xpPerCommit: 10,
  /** XP earned per line added */
  xpPerLineAdded: 0.5,
  /** XP earned per line removed */
  xpPerLineRemoved: 0.25,
  /** XP earned per file changed */
  xpPerFile: 2,
  /** Maximum lines counted per commit to prevent gaming */
  maxLinesPerCommit: 500,
} as const;

// ============================================================================
// DAILY QUEST TEMPLATES
// ============================================================================

/**
 * Templates for randomly generated daily quests.
 * {target} in description is replaced with the actual target number.
 * targetRange specifies [min, max] for random target selection.
 */
export const DAILY_QUEST_TEMPLATES: QuestTemplate[] = [
  {
    title: 'Commit Warrior',
    description: 'Make {target} commits today',
    type: 'commits',
    targetRange: [3, 10],
    xp: 50,
    gold: 25,
  },
  {
    title: 'Code Crafter',
    description: 'Add {target} lines of code',
    type: 'lines_added',
    targetRange: [50, 200],
    xp: 75,
    gold: 40,
  },
  {
    title: 'File Explorer',
    description: 'Modify {target} different files',
    type: 'files_changed',
    targetRange: [3, 8],
    xp: 40,
    gold: 20,
  },
];

// ============================================================================
// WORKER CONFIGURATION
// ============================================================================

/**
 * Configuration for the worker (gold generator) system.
 * Workers generate passive gold income over time.
 *
 * baseCost: Base cost to purchase first worker
 * baseGoldPerHour: Gold generated per hour at level 1
 * costMultiplier: Cost multiplier for each additional worker (exponential)
 * upgradeCostMultiplier: Cost multiplier for upgrading a worker's level
 * outputMultiplier: Gold output multiplier per worker level
 */
export const WORKER_CONFIG: WorkerConfig = {
  baseCost: 100,
  baseGoldPerHour: 5,
  costMultiplier: 1.15,
  upgradeCostMultiplier: 2.0,
  outputMultiplier: 1.5,
};

// ============================================================================
// BOSS DEFINITIONS
// ============================================================================

/**
 * All available boss types and their base stats.
 * Bosses scale with average player level when spawned.
 */
export const BOSS_DEFINITIONS: Record<string, BossDefinition> = {
  dragon: {
    id: 'dragon',
    name: 'Ancient Dragon',
    baseHp: 500,
    baseAttack: 45,
    baseDefense: 20,
    baseSpeed: 30,
    specialTrait: 'Can land critical hits',
    description: 'A fearsome fire-breathing beast',
  },
  golem: {
    id: 'golem',
    name: 'Stone Golem',
    baseHp: 600,
    baseAttack: 25,
    baseDefense: 40,
    baseSpeed: 10,
    specialTrait: 'High defense, slow',
    description: 'An ancient stone guardian',
  },
  shadow_knight: {
    id: 'shadow_knight',
    name: 'Shadow Knight',
    baseHp: 450,
    baseAttack: 35,
    baseDefense: 30,
    baseSpeed: 35,
    specialTrait: 'Balanced and fast',
    description: 'A dark warrior from the void',
  },
  slime_king: {
    id: 'slime_king',
    name: 'Slime King',
    baseHp: 800,
    baseAttack: 15,
    baseDefense: 15,
    baseSpeed: 20,
    specialTrait: 'Massive HP pool',
    description: 'The royal blob of goo',
  },
  necromancer: {
    id: 'necromancer',
    name: 'Necromancer',
    baseHp: 400,
    baseAttack: 40,
    baseDefense: 15,
    baseSpeed: 25,
    specialTrait: 'Heals 50 HP every 3 turns',
    description: 'Master of dark magic',
  },
  forest_guardian: {
    id: 'forest_guardian',
    name: 'Forest Guardian',
    baseHp: 550,
    baseAttack: 30,
    baseDefense: 35,
    baseSpeed: 15,
    specialTrait: "Nature's protector",
    description: 'Ancient spirit of the woods',
  },
};

/**
 * Rewards configuration for boss battles.
 */
export const BOSS_REWARDS = {
  /** Base XP reward for defeating a boss */
  baseXp: 150,
  /** Base gold reward for defeating a boss */
  baseGold: 75,
  /** Multiplier for cooperative (multi-player) boss kills */
  coopMultiplier: 1.5,
  /** Additional XP per boss level */
  levelBonusXp: 20,
  /** Consolation XP for losing a boss battle */
  lossXp: 25,
  /** Consolation gold for losing a boss battle */
  lossGold: 10,
} as const;

/**
 * Boss scaling configuration.
 */
export const BOSS_SCALING = {
  /** Stats scale by this factor per player level */
  levelScale: 0.1,
  /** Boss level is this multiplier of average player level */
  bossLevelMultiplier: 1.2,
} as const;
