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

export interface BossInstance {
  definition: BossDefinition;
  currentHp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  level: number;
}

export const BOSS_DEFINITIONS: Record<string, BossDefinition> = {
  dragon: {
    id: 'dragon',
    name: 'Ancient Dragon',
    baseHp: 500,
    baseAttack: 45,
    baseDefense: 20,
    baseSpeed: 30,
    specialTrait: 'Can land critical hits',
    description: 'A fearsome fire-breathing beast'
  },
  golem: {
    id: 'golem',
    name: 'Stone Golem',
    baseHp: 600,
    baseAttack: 25,
    baseDefense: 40,
    baseSpeed: 10,
    specialTrait: 'High defense, slow',
    description: 'An ancient stone guardian'
  },
  shadow_knight: {
    id: 'shadow_knight',
    name: 'Shadow Knight',
    baseHp: 450,
    baseAttack: 35,
    baseDefense: 30,
    baseSpeed: 35,
    specialTrait: 'Balanced and fast',
    description: 'A dark warrior from the void'
  },
  slime_king: {
    id: 'slime_king',
    name: 'Slime King',
    baseHp: 800,
    baseAttack: 15,
    baseDefense: 15,
    baseSpeed: 20,
    specialTrait: 'Massive HP pool',
    description: 'The royal blob of goo'
  },
  necromancer: {
    id: 'necromancer',
    name: 'Necromancer',
    baseHp: 400,
    baseAttack: 40,
    baseDefense: 15,
    baseSpeed: 25,
    specialTrait: 'Heals 50 HP every 3 turns',
    description: 'Master of dark magic'
  },
  forest_guardian: {
    id: 'forest_guardian',
    name: 'Forest Guardian',
    baseHp: 550,
    baseAttack: 30,
    baseDefense: 35,
    baseSpeed: 15,
    specialTrait: 'Nature\'s protector',
    description: 'Ancient spirit of the woods'
  }
};

export function createBossInstance(bossType: string, averagePlayerLevel: number): BossInstance {
  const definition = BOSS_DEFINITIONS[bossType];
  if (!definition) {
    throw new Error(`Unknown boss type: ${bossType}`);
  }

  // Scale boss stats with player level
  const levelScale = 1 + (averagePlayerLevel * 0.1);
  const bossLevel = Math.max(1, Math.floor(averagePlayerLevel * 1.2));

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

export const BOSS_REWARDS = {
  baseXp: 150,
  baseGold: 75,
  coopMultiplier: 1.5,
  levelBonusXp: 20,
  lossXp: 25,
  lossGold: 10
};
