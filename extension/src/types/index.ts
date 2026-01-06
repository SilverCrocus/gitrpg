// =============================================================================
// GitRPG Type Definitions
// Consolidated type definitions for the GitRPG VS Code extension
// =============================================================================

// -----------------------------------------------------------------------------
// Core Game Types
// -----------------------------------------------------------------------------

/**
 * Character class options - determines base stats and play style
 */
export type CharacterClass = 'Warrior' | 'Mage' | 'Rogue' | 'Archer';

/**
 * Core stats shared by all characters and fighters
 */
export interface CharacterStats {
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  critChance: number;
  critDamage: number;
}

/**
 * Full character data including progression and economy
 */
export interface Character {
  name: string;
  class: CharacterClass;
  level: number;
  xp: number;
  xpToNextLevel: number;
  gold: number;
  stats: CharacterStats;
}

/**
 * Alias for backwards compatibility with existing code
 * @deprecated Use Character instead
 */
export type CharacterData = Character;

// -----------------------------------------------------------------------------
// Battle Types
// -----------------------------------------------------------------------------

/**
 * A fighter in battle - can be a player character or enemy
 */
export interface BattleFighter {
  id: string;
  name: string;
  class: CharacterClass;
  level: number;
  stats: CharacterStats;
  currentHp: number;
}

/**
 * Types of actions that can be taken in battle
 */
export type BattleActionType = 'attack' | 'spell' | 'defend';

/**
 * Record of a single action taken during battle
 */
export interface BattleAction {
  turn: number;
  timestamp: Date;
  actorId: string;
  actionType: BattleActionType;
  targetId: string;
  damage: number;
  isCrit: boolean;
  resultingHp: number;
}

/**
 * Rewards earned from winning a battle
 */
export interface BattleRewards {
  xp: number;
  gold: number;
}

/**
 * Result of damage calculation
 */
export interface DamageResult {
  damage: number;
  isCrit: boolean;
}

/**
 * Complete result of a battle
 */
export interface BattleResult {
  winner: BattleFighter;
  loser: BattleFighter;
  actions: BattleAction[];
  totalTurns: number;
  rewards: BattleRewards;
}

// -----------------------------------------------------------------------------
// Boss Types
// -----------------------------------------------------------------------------

/**
 * Static definition of a boss type
 */
export interface BossDefinition {
  id: string;
  name: string;
  baseHp: number;
  baseAttack: number;
  baseDefense: number;
  baseSpeed: number;
  specialTrait: string;
  description: string;
}

/**
 * A spawned boss instance with scaled stats
 */
export interface BossInstance {
  definition: BossDefinition;
  currentHp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  level: number;
}

// -----------------------------------------------------------------------------
// Economy Types - Quests
// -----------------------------------------------------------------------------

/**
 * Categories of quests
 */
export type QuestType = 'daily' | 'streak' | 'achievement' | 'social';

/**
 * Current status of a quest
 */
export type QuestStatus = 'active' | 'completed' | 'expired' | 'claimed';

/**
 * Types of requirements for quest completion
 */
export type QuestRequirementType =
  | 'commits'
  | 'lines_added'
  | 'files_changed'
  | 'streak_days'
  | 'battles_won'
  | 'reviews_given';

/**
 * Quest instance from database (matches Supabase schema)
 */
export interface Quest {
  id: string;
  user_id: string;
  quest_type: QuestType;
  title: string;
  description: string;
  requirement_type: QuestRequirementType;
  requirement_target: number;
  requirement_current: number;
  reward_xp: number;
  reward_gold: number;
  status: QuestStatus;
  expires_at: string | null;
  created_at: string;
  completed_at: string | null;
}

/**
 * Template for generating quests
 */
export interface QuestTemplate {
  title: string;
  description: string;
  type: QuestRequirementType;
  targetRange: [number, number];
  xp: number;
  gold: number;
}

// -----------------------------------------------------------------------------
// Economy Types - Workers
// -----------------------------------------------------------------------------

/**
 * Worker instance from database (matches Supabase schema)
 */
export interface Worker {
  id: string;
  user_id: string;
  level: number;
  gold_per_hour: number;
  purchased_at: string;
  last_collected_at: string;
}

/**
 * Configuration for worker economy calculations
 */
export interface WorkerConfig {
  baseCost: number;
  baseGoldPerHour: number;
  costMultiplier: number;
  upgradeCostMultiplier: number;
  outputMultiplier: number;
}

// -----------------------------------------------------------------------------
// State Types
// -----------------------------------------------------------------------------

/**
 * Statistics tracked for the current day
 */
export interface TodayStats {
  date: string; // YYYY-MM-DD format
  commits: number;
  linesAdded: number;
  linesRemoved: number;
  filesChanged: number;
  xpEarned: number;
}

/**
 * Git tracking state for preventing duplicate processing
 */
export interface TrackingState {
  lastCheckedAt: string; // ISO date string
  processedCommitHashes: string[]; // Prevent double-counting commits
}

/**
 * Complete local game state persisted in VS Code
 */
export interface LocalGameState {
  character: Character;
  todayStats: TodayStats;
  tracking: TrackingState;
  gitEmail: string | null;
}

// -----------------------------------------------------------------------------
// Activity Types
// -----------------------------------------------------------------------------

/**
 * Result of adding activity (commits, lines, etc.) to a character
 */
export interface ActivityResult {
  xpEarned: number;
  leveledUp: boolean;
  newLevel: number;
}
