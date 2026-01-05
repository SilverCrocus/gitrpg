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

// Quest types
export type QuestType = 'daily' | 'streak' | 'achievement' | 'social';
export type QuestStatus = 'active' | 'completed' | 'expired' | 'claimed';
export type QuestRequirementType = 'commits' | 'lines_added' | 'files_changed' | 'streak_days' | 'battles_won' | 'reviews_given';

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

export interface QuestTemplate {
  title: string;
  description: string;
  type: QuestRequirementType;
  targetRange: [number, number];
  xp: number;
  gold: number;
}

export const DAILY_QUEST_TEMPLATES: QuestTemplate[] = [
  { title: 'Commit Warrior', description: 'Make {target} commits today', type: 'commits', targetRange: [3, 10], xp: 50, gold: 25 },
  { title: 'Code Crafter', description: 'Add {target} lines of code', type: 'lines_added', targetRange: [50, 200], xp: 75, gold: 40 },
  { title: 'File Explorer', description: 'Modify {target} different files', type: 'files_changed', targetRange: [3, 8], xp: 40, gold: 20 },
];

// Worker types
export interface Worker {
  id: string;
  user_id: string;
  level: number;
  gold_per_hour: number;
  purchased_at: string;
  last_collected_at: string;
}

export const WORKER_CONFIG = {
  baseCost: 100,
  baseGoldPerHour: 5,
  costMultiplier: 1.15,
  upgradeCostMultiplier: 2.0,
  outputMultiplier: 1.5,
};
