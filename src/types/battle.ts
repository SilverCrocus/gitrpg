import type { CharacterStats, CharacterClass } from './character';

export type BattleStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface BattleParticipant {
  userId: string;
  userName: string;
  characterId: string;
  characterName: string;
  characterClass: CharacterClass;
  characterLevel: number;
  stats: CharacterStats;
  currentHp: number;
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

export interface Battle {
  id: string;
  status: BattleStatus;
  player1: BattleParticipant;
  player2: BattleParticipant;
  actions: BattleAction[];
  winnerId: string | null;
  createdAt: Date;
  completedAt: Date | null;
  rewards: BattleRewards | null;
}

export interface BattleRewards {
  userId: string;
  xpGained: number;
  goldGained: number;
}
