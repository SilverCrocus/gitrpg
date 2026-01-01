import { describe, it, expect } from 'vitest';
import {
  calculateXpForLevel,
  calculateStatsForLevel,
  CLASS_CHANGE_COST
} from '../../src/services/characterService';
import { CLASS_CONFIGS } from '../../src/types';

describe('characterService', () => {
  describe('calculateXpForLevel', () => {
    it('should require more XP for higher levels', () => {
      const level2Xp = calculateXpForLevel(2);
      const level3Xp = calculateXpForLevel(3);
      const level10Xp = calculateXpForLevel(10);

      expect(level2Xp).toBeLessThan(level3Xp);
      expect(level3Xp).toBeLessThan(level10Xp);
    });

    it('should return reasonable values', () => {
      expect(calculateXpForLevel(2)).toBeGreaterThan(100);
      expect(calculateXpForLevel(2)).toBeLessThan(500);
      expect(calculateXpForLevel(10)).toBeGreaterThan(1000);
    });
  });

  describe('calculateStatsForLevel', () => {
    it('should return base stats at level 1', () => {
      const warriorStats = calculateStatsForLevel('warrior', 1);
      const config = CLASS_CONFIGS.warrior;

      expect(warriorStats.maxHp).toBe(config.baseStats.maxHp);
      expect(warriorStats.attack).toBe(config.baseStats.attack);
    });

    it('should increase stats with level', () => {
      const level1 = calculateStatsForLevel('mage', 1);
      const level10 = calculateStatsForLevel('mage', 10);

      expect(level10.maxHp).toBeGreaterThan(level1.maxHp);
      expect(level10.attack).toBeGreaterThan(level1.attack);
      expect(level10.speed).toBeGreaterThan(level1.speed);
    });

    it('should cap crit chance at 50%', () => {
      const level100 = calculateStatsForLevel('rogue', 100);
      expect(level100.critChance).toBeLessThanOrEqual(0.5);
    });

    it('should give different stats per class', () => {
      const warrior = calculateStatsForLevel('warrior', 5);
      const mage = calculateStatsForLevel('mage', 5);
      const rogue = calculateStatsForLevel('rogue', 5);

      // Warrior should have most HP
      expect(warrior.maxHp).toBeGreaterThan(mage.maxHp);
      expect(warrior.maxHp).toBeGreaterThan(rogue.maxHp);

      // Rogue should be fastest
      expect(rogue.speed).toBeGreaterThan(warrior.speed);
      expect(rogue.speed).toBeGreaterThan(mage.speed);
    });
  });

  describe('CLASS_CHANGE_COST', () => {
    it('should be 500 gold', () => {
      expect(CLASS_CHANGE_COST).toBe(500);
    });
  });
});
