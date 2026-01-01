import { doc, getDoc, setDoc, updateDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { getDb } from './firebase';
import type { Character, CharacterClass, CharacterStats } from '../types';
import { CLASS_CONFIGS } from '../types';
import { v4 as uuidv4 } from 'uuid';

const CHARACTERS_COLLECTION = 'characters';

export function calculateXpForLevel(level: number): number {
  // XP curve: each level requires 100 * level^1.5 XP
  return Math.floor(100 * Math.pow(level, 1.5));
}

export function calculateStatsForLevel(characterClass: CharacterClass, level: number): CharacterStats {
  const config = CLASS_CONFIGS[characterClass];
  const base = config.baseStats;
  const growth = config.statGrowth;
  const levelsGained = level - 1;

  return {
    maxHp: Math.floor(base.maxHp + growth.maxHp * levelsGained),
    attack: Math.floor(base.attack + growth.attack * levelsGained),
    defense: Math.floor(base.defense + growth.defense * levelsGained),
    speed: Math.floor(base.speed + growth.speed * levelsGained),
    critChance: Math.min(0.5, base.critChance + growth.critChance * levelsGained),
    critDamage: base.critDamage + growth.critDamage * levelsGained
  };
}

export async function createCharacter(
  userId: string,
  name: string,
  characterClass: CharacterClass
): Promise<Character> {
  const db = getDb();
  const characterId = uuidv4();
  const characterRef = doc(db, `users/${userId}/${CHARACTERS_COLLECTION}`, characterId);

  const character: Character = {
    id: characterId,
    userId,
    name,
    class: characterClass,
    level: 1,
    xp: 0,
    xpToNextLevel: calculateXpForLevel(2),
    stats: calculateStatsForLevel(characterClass, 1),
    equippedWeaponId: null,
    equippedArmorId: null,
    equippedSpellIds: [],
    createdAt: new Date(),
    updatedAt: new Date()
  };

  await setDoc(characterRef, {
    ...character,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return character;
}

export async function getCharacter(userId: string, characterId: string): Promise<Character | null> {
  const db = getDb();
  const characterRef = doc(db, `users/${userId}/${CHARACTERS_COLLECTION}`, characterId);
  const snapshot = await getDoc(characterRef);

  if (!snapshot.exists()) return null;
  return snapshot.data() as Character;
}

export async function getUserCharacters(userId: string): Promise<Character[]> {
  const db = getDb();
  const charactersRef = collection(db, `users/${userId}/${CHARACTERS_COLLECTION}`);
  const snapshot = await getDocs(charactersRef);

  return snapshot.docs.map(doc => doc.data() as Character);
}

export async function addXpToCharacter(
  userId: string,
  characterId: string,
  xpAmount: number
): Promise<{ levelsGained: number; goldEarned: number }> {
  const character = await getCharacter(userId, characterId);
  if (!character) throw new Error('Character not found');

  let currentXp = character.xp + xpAmount;
  let currentLevel = character.level;
  let levelsGained = 0;
  let goldEarned = 0;

  // Check for level ups
  while (currentXp >= character.xpToNextLevel) {
    currentXp -= character.xpToNextLevel;
    currentLevel++;
    levelsGained++;
    goldEarned += currentLevel * 50; // Gold reward per level
  }

  const db = getDb();
  const characterRef = doc(db, `users/${userId}/${CHARACTERS_COLLECTION}`, characterId);

  const newStats = calculateStatsForLevel(character.class, currentLevel);
  const newXpToNext = calculateXpForLevel(currentLevel + 1);

  await updateDoc(characterRef, {
    xp: currentXp,
    level: currentLevel,
    xpToNextLevel: newXpToNext,
    stats: newStats,
    updatedAt: serverTimestamp()
  });

  return { levelsGained, goldEarned };
}

export const CLASS_CHANGE_COST = 500;

export async function changeCharacterClass(
  userId: string,
  characterId: string,
  newClass: CharacterClass,
  userGold: number
): Promise<void> {
  if (userGold < CLASS_CHANGE_COST) {
    throw new Error(`Not enough gold. Need ${CLASS_CHANGE_COST}, have ${userGold}`);
  }

  const character = await getCharacter(userId, characterId);
  if (!character) throw new Error('Character not found');

  if (character.class === newClass) {
    throw new Error('Character is already this class');
  }

  const db = getDb();
  const characterRef = doc(db, `users/${userId}/${CHARACTERS_COLLECTION}`, characterId);

  // Recalculate stats for new class at current level
  const newStats = calculateStatsForLevel(newClass, character.level);

  await updateDoc(characterRef, {
    class: newClass,
    stats: newStats,
    updatedAt: serverTimestamp()
  });
}
