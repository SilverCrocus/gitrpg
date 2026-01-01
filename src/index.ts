// GitRPG - Main Entry Point
// Exports all services and types for use by extensions, dashboard, and scripts

// Type exports (excluding utility functions that are duplicated in services)
export type {
  User,
  GitHubAccount,
  UserSettings,
  UserStats
} from './types/user';

export type {
  Character,
  CharacterClass,
  CharacterStats,
  CharacterClassConfig
} from './types/character';
export { CLASS_CONFIGS } from './types/character';

export type {
  Battle,
  BattleStatus,
  BattleParticipant,
  BattleAction,
  BattleRewards
} from './types/battle';

export type {
  Quest,
  QuestType,
  QuestStatus,
  QuestRequirement,
  QuestRewards,
  UserQuests
} from './types/quest';
export { DAILY_QUEST_TEMPLATES } from './types/quest';

export type {
  Worker,
  WorkerConfig
} from './types/worker';
export { WORKER_CONFIG } from './types/worker';

// Firebase initialization
export * from './services/firebase';

// User management
export * from './services/userService';

// Character system
export * from './services/characterService';

// Battle system
export * from './services/battleEngine';
export * from './services/battleService';

// Quest system
export * from './services/questService';

// Worker system
export * from './services/workerService';

// Git tracking
export * from './services/gitWatcher';
export * from './services/activityTracker';

// GitHub integration
export * from './services/githubAuth';
export * from './services/githubApi';
