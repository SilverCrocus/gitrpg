import type { BossDefinition, BossInstance } from '../types';
import { BOSS_DEFINITIONS, BOSS_REWARDS, BOSS_SCALING } from '../config/classConfig';

// Re-export types and constants for backwards compatibility
export type { BossDefinition, BossInstance } from '../types';
export { BOSS_DEFINITIONS, BOSS_REWARDS } from '../config/classConfig';

export function createBossInstance(bossType: string, averagePlayerLevel: number): BossInstance {
  const definition = BOSS_DEFINITIONS[bossType];
  if (!definition) {
    throw new Error(`Unknown boss type: ${bossType}`);
  }

  // Scale boss stats with player level
  const levelScale = 1 + (averagePlayerLevel * BOSS_SCALING.levelScale);
  const bossLevel = Math.max(1, Math.floor(averagePlayerLevel * BOSS_SCALING.bossLevelMultiplier));

  return {
    definition,
    level: bossLevel,
    maxHp: Math.floor(definition.baseHp * levelScale),
    currentHp: Math.floor(definition.baseHp * levelScale),
    attack: Math.floor(definition.baseAttack * levelScale),
    defense: Math.floor(definition.baseDefense * levelScale),
    speed: Math.floor(definition.baseSpeed * levelScale)
  };
}

export function getBossEmoji(bossType: string): string {
  const emojis: Record<string, string> = {
    dragon: '🐉',
    golem: '🗿',
    shadow_knight: '⚔️',
    slime_king: '👑',
    necromancer: '💀',
    forest_guardian: '🌳'
  };
  return emojis[bossType] || '👹';
}
