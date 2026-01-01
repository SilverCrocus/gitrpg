import { describe, it, expect } from 'vitest';
import {
  calculateBattleRewards,
  BATTLE_REWARDS
} from '../../src/services/battleService';

describe('battleService', () => {
  describe('calculateBattleRewards', () => {
    it('should give winner more rewards than loser', () => {
      const winnerLevel = 5;
      const loserLevel = 5;

      const winnerRewards = calculateBattleRewards(true, winnerLevel, loserLevel);
      const loserRewards = calculateBattleRewards(false, loserLevel, winnerLevel);

      expect(winnerRewards.xp).toBeGreaterThan(loserRewards.xp);
      expect(winnerRewards.gold).toBeGreaterThan(loserRewards.gold);
    });

    it('should give bonus for defeating higher level opponent', () => {
      const lowLevelRewards = calculateBattleRewards(true, 5, 3); // Beat lower level
      const highLevelRewards = calculateBattleRewards(true, 5, 10); // Beat higher level

      expect(highLevelRewards.xp).toBeGreaterThan(lowLevelRewards.xp);
    });

    it('should always give consolation prize to loser', () => {
      const loserRewards = calculateBattleRewards(false, 5, 5);

      expect(loserRewards.xp).toBeGreaterThan(0);
      expect(loserRewards.gold).toBeGreaterThan(0);
    });

    it('should not penalize winner for beating lower level opponent', () => {
      const rewards = calculateBattleRewards(true, 10, 3); // High level beats low level

      // Should still get base rewards even with no level bonus
      expect(rewards.xp).toBeGreaterThanOrEqual(BATTLE_REWARDS.winnerBaseXp);
      expect(rewards.gold).toBeGreaterThanOrEqual(BATTLE_REWARDS.winnerBaseGold);
    });

    it('should scale rewards with level difference', () => {
      const smallDiff = calculateBattleRewards(true, 5, 6); // 1 level difference
      const largeDiff = calculateBattleRewards(true, 5, 15); // 10 level difference

      expect(largeDiff.xp).toBeGreaterThan(smallDiff.xp);
      expect(largeDiff.gold).toBeGreaterThan(smallDiff.gold);
    });
  });

  describe('BATTLE_REWARDS', () => {
    it('should have defined base values', () => {
      expect(BATTLE_REWARDS.winnerBaseXp).toBeGreaterThan(0);
      expect(BATTLE_REWARDS.winnerBaseGold).toBeGreaterThan(0);
      expect(BATTLE_REWARDS.loserBaseXp).toBeGreaterThan(0);
    });

    it('should have loser rewards less than winner', () => {
      expect(BATTLE_REWARDS.loserBaseXp).toBeLessThan(BATTLE_REWARDS.winnerBaseXp);
      expect(BATTLE_REWARDS.loserBaseGold).toBeLessThan(BATTLE_REWARDS.winnerBaseGold);
    });
  });
});
