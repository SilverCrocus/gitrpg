import { doc, setDoc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { getDb } from './firebase';
import type { Battle, BattleStatus, BattleParticipant, BattleRewards, BattleAction } from '../types';
import { BattleEngine, characterToBattleFighter, BattleResult } from './battleEngine';
import { getCharacter, addXpToCharacter } from './characterService';
import { getUser, updateUserGold } from './userService';
import { v4 as uuidv4 } from 'uuid';

const BATTLES_COLLECTION = 'battles';

export const BATTLE_REWARDS = {
  winnerBaseXp: 100,
  winnerBaseGold: 50,
  loserBaseXp: 25,
  loserBaseGold: 10,
  levelDifferenceMultiplier: 0.1 // 10% bonus per level difference
};

export interface BattleRewardsResult {
  xp: number;
  gold: number;
}

export function calculateBattleRewards(
  isWinner: boolean,
  yourLevel: number,
  opponentLevel: number
): BattleRewardsResult {
  const levelDiff = opponentLevel - yourLevel;
  const levelBonus = Math.max(0, levelDiff * BATTLE_REWARDS.levelDifferenceMultiplier);

  if (isWinner) {
    return {
      xp: Math.floor(BATTLE_REWARDS.winnerBaseXp * (1 + levelBonus)),
      gold: Math.floor(BATTLE_REWARDS.winnerBaseGold * (1 + levelBonus))
    };
  } else {
    return {
      xp: BATTLE_REWARDS.loserBaseXp,
      gold: BATTLE_REWARDS.loserBaseGold
    };
  }
}

export async function createBattleChallenge(
  challengerId: string,
  challengerCharacterId: string,
  opponentId: string,
  opponentCharacterId: string
): Promise<string> {
  const db = getDb();
  const battleId = uuidv4();

  // Get both characters
  const challengerChar = await getCharacter(challengerId, challengerCharacterId);
  const opponentChar = await getCharacter(opponentId, opponentCharacterId);

  if (!challengerChar || !opponentChar) {
    throw new Error('One or both characters not found');
  }

  const challengerUser = await getUser(challengerId);
  const opponentUser = await getUser(opponentId);

  const challenger: BattleParticipant = {
    userId: challengerId,
    userName: challengerUser?.displayName || 'Unknown',
    characterId: challengerCharacterId,
    characterName: challengerChar.name,
    characterClass: challengerChar.class,
    characterLevel: challengerChar.level,
    stats: challengerChar.stats,
    currentHp: challengerChar.stats.maxHp
  };

  const opponent: BattleParticipant = {
    userId: opponentId,
    userName: opponentUser?.displayName || 'Unknown',
    characterId: opponentCharacterId,
    characterName: opponentChar.name,
    characterClass: opponentChar.class,
    characterLevel: opponentChar.level,
    stats: opponentChar.stats,
    currentHp: opponentChar.stats.maxHp
  };

  const battle: Battle = {
    id: battleId,
    status: 'pending',
    player1: challenger,
    player2: opponent,
    actions: [],
    winnerId: null,
    createdAt: new Date(),
    completedAt: null,
    rewards: null
  };

  const battleRef = doc(db, BATTLES_COLLECTION, battleId);
  await setDoc(battleRef, {
    ...battle,
    createdAt: serverTimestamp()
  });

  return battleId;
}

export async function executeBattle(battleId: string): Promise<BattleResult> {
  const db = getDb();
  const battleRef = doc(db, BATTLES_COLLECTION, battleId);
  const battleSnap = await getDoc(battleRef);

  if (!battleSnap.exists()) {
    throw new Error('Battle not found');
  }

  const battle = battleSnap.data() as Battle;

  if (battle.status !== 'pending') {
    throw new Error('Battle already completed or in progress');
  }

  // Update status to in_progress
  await updateDoc(battleRef, { status: 'in_progress' });

  // Create battle fighters
  const fighter1 = characterToBattleFighter(
    battle.player1.userId,
    battle.player1.characterId,
    battle.player1.characterName,
    battle.player1.characterClass,
    battle.player1.characterLevel,
    battle.player1.stats
  );

  const fighter2 = characterToBattleFighter(
    battle.player2.userId,
    battle.player2.characterId,
    battle.player2.characterName,
    battle.player2.characterClass,
    battle.player2.characterLevel,
    battle.player2.stats
  );

  // Run battle
  const engine = new BattleEngine(fighter1, fighter2);
  const result = engine.runBattle();

  // Calculate rewards
  const winnerId = result.winner.id;
  const loserId = result.loser.id;

  const winnerIsPlayer1 = winnerId === battle.player1.userId;
  const winnerLevel = winnerIsPlayer1 ? battle.player1.characterLevel : battle.player2.characterLevel;
  const loserLevel = winnerIsPlayer1 ? battle.player2.characterLevel : battle.player1.characterLevel;

  const winnerRewards = calculateBattleRewards(true, winnerLevel, loserLevel);
  const loserRewards = calculateBattleRewards(false, loserLevel, winnerLevel);

  // Update battle record
  await updateDoc(battleRef, {
    status: 'completed',
    actions: result.actions,
    winnerId,
    completedAt: serverTimestamp(),
    rewards: {
      userId: winnerId,
      xpGained: winnerRewards.xp,
      goldGained: winnerRewards.gold
    }
  });

  // Award rewards to winner
  const winnerChar = winnerIsPlayer1 ? battle.player1 : battle.player2;
  await addXpToCharacter(winnerId, winnerChar.characterId, winnerRewards.xp);
  await updateUserGold(winnerId, winnerRewards.gold);

  // Award consolation to loser
  const loserChar = winnerIsPlayer1 ? battle.player2 : battle.player1;
  await addXpToCharacter(loserId, loserChar.characterId, loserRewards.xp);
  await updateUserGold(loserId, loserRewards.gold);

  return result;
}

export async function getBattle(battleId: string): Promise<Battle | null> {
  const db = getDb();
  const battleRef = doc(db, BATTLES_COLLECTION, battleId);
  const snapshot = await getDoc(battleRef);

  if (!snapshot.exists()) return null;
  return snapshot.data() as Battle;
}

export async function getUserBattles(userId: string, limit: number = 10): Promise<Battle[]> {
  const db = getDb();
  const battlesRef = collection(db, BATTLES_COLLECTION);

  // Get battles where user is player1 or player2
  const q1 = query(battlesRef, where('player1.userId', '==', userId));
  const q2 = query(battlesRef, where('player2.userId', '==', userId));

  const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

  const battles: Battle[] = [];
  snap1.forEach(doc => battles.push(doc.data() as Battle));
  snap2.forEach(doc => battles.push(doc.data() as Battle));

  // Sort by creation date descending and limit
  return battles
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}
