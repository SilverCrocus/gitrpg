import type { CharacterStats, CharacterClass, BattleAction } from '../types';

export interface BattleFighter {
  id: string;
  name: string;
  class: CharacterClass;
  level: number;
  stats: CharacterStats;
  currentHp: number;
}

export interface DamageResult {
  damage: number;
  isCrit: boolean;
}

export interface BattleResult {
  winner: BattleFighter;
  loser: BattleFighter;
  actions: BattleAction[];
  totalTurns: number;
  rewards: {
    xp: number;
    gold: number;
  };
}

// Damage formula: base = attack - (defense/2), with 10% variance
export function calculateDamage(
  attacker: BattleFighter,
  defender: BattleFighter,
  isCrit: boolean
): DamageResult {
  const baseDamage = attacker.stats.attack - (defender.stats.defense / 2);
  const variance = 0.9 + Math.random() * 0.2; // 90% to 110%
  let damage = Math.floor(baseDamage * variance);

  if (isCrit) {
    damage = Math.floor(damage * attacker.stats.critDamage);
  }

  // Minimum damage is 1
  damage = Math.max(1, damage);

  return { damage, isCrit };
}

export function rollCrit(critChance: number): boolean {
  return Math.random() < critChance;
}

export function determineTurnOrder(
  fighter1: BattleFighter,
  fighter2: BattleFighter
): [BattleFighter, BattleFighter] {
  // Higher speed goes first, with small random factor
  const speed1 = fighter1.stats.speed + Math.random() * 2;
  const speed2 = fighter2.stats.speed + Math.random() * 2;

  return speed1 >= speed2 ? [fighter1, fighter2] : [fighter2, fighter1];
}

export class BattleEngine {
  private fighter1: BattleFighter;
  private fighter2: BattleFighter;
  private actions: BattleAction[] = [];
  private turn: number = 0;

  constructor(fighter1: BattleFighter, fighter2: BattleFighter) {
    // Clone fighters to avoid mutating originals
    this.fighter1 = { ...fighter1, stats: { ...fighter1.stats } };
    this.fighter2 = { ...fighter2, stats: { ...fighter2.stats } };
  }

  runBattle(): BattleResult {
    while (this.fighter1.currentHp > 0 && this.fighter2.currentHp > 0) {
      this.turn++;
      this.executeTurn();

      // Safety limit to prevent infinite loops
      if (this.turn > 100) {
        break;
      }
    }

    // Determine winner: if both have HP > 0 (timeout), compare HP percentages
    let winner: BattleFighter;
    let loser: BattleFighter;

    if (this.fighter1.currentHp <= 0) {
      winner = this.fighter2;
      loser = this.fighter1;
    } else if (this.fighter2.currentHp <= 0) {
      winner = this.fighter1;
      loser = this.fighter2;
    } else {
      // Timeout: determine winner by HP percentage
      const hpPercent1 = this.fighter1.currentHp / this.fighter1.stats.maxHp;
      const hpPercent2 = this.fighter2.currentHp / this.fighter2.stats.maxHp;
      winner = hpPercent1 >= hpPercent2 ? this.fighter1 : this.fighter2;
      loser = hpPercent1 >= hpPercent2 ? this.fighter2 : this.fighter1;
    }

    // Calculate rewards based on enemy level
    const levelDiff = loser.level - winner.level;
    const levelBonus = Math.max(0, levelDiff * 0.1); // 10% bonus per level difference

    const baseXp = 50 + (loser.level * 10);
    const baseGold = 25 + (loser.level * 5);

    return {
      winner,
      loser,
      actions: this.actions,
      totalTurns: this.turn,
      rewards: {
        xp: Math.floor(baseXp * (1 + levelBonus)),
        gold: Math.floor(baseGold * (1 + levelBonus))
      }
    };
  }

  private executeTurn(): void {
    const [first, second] = determineTurnOrder(this.fighter1, this.fighter2);

    // First fighter attacks
    this.executeAttack(first, second);

    // Check if battle is over
    if (second.currentHp <= 0) return;

    // Second fighter attacks
    this.executeAttack(second, first);
  }

  private executeAttack(attacker: BattleFighter, defender: BattleFighter): void {
    const isCrit = rollCrit(attacker.stats.critChance);
    const { damage } = calculateDamage(attacker, defender, isCrit);

    defender.currentHp = Math.max(0, defender.currentHp - damage);

    this.actions.push({
      turn: this.turn,
      timestamp: new Date(),
      actorId: attacker.id,
      actionType: 'attack',
      targetId: defender.id,
      damage,
      isCrit,
      resultingHp: defender.currentHp
    });
  }

  getActions(): BattleAction[] {
    return this.actions;
  }
}
