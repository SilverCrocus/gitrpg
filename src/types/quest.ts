export type QuestType = 'daily' | 'streak' | 'achievement' | 'social';
export type QuestStatus = 'active' | 'completed' | 'expired';

export interface QuestRequirement {
  type: 'commits' | 'lines_added' | 'files_changed' | 'streak_days' | 'battles_won' | 'reviews_given';
  target: number;
  current: number;
}

export interface Quest {
  id: string;
  type: QuestType;
  title: string;
  description: string;
  requirement: QuestRequirement;
  rewards: QuestRewards;
  expiresAt: Date | null; // null for achievements
  status: QuestStatus;
}

export interface QuestRewards {
  xp: number;
  gold: number;
}

export interface UserQuests {
  userId: string;
  activeQuests: Quest[];
  completedQuestIds: string[];
  lastDailyRefresh: Date;
}

// Quest templates for daily generation
export const DAILY_QUEST_TEMPLATES = [
  { title: 'Commit Warrior', description: 'Make {target} commits today', type: 'commits' as const, targetRange: [3, 10], xp: 50, gold: 25 },
  { title: 'Code Crafter', description: 'Add {target} lines of code', type: 'lines_added' as const, targetRange: [50, 200], xp: 75, gold: 40 },
  { title: 'File Explorer', description: 'Modify {target} different files', type: 'files_changed' as const, targetRange: [3, 8], xp: 40, gold: 20 },
];
