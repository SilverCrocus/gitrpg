import { describe, it, expect } from 'vitest';
import {
  calculateWorkerPurchaseCost,
  calculateWorkerOutput,
  calculatePendingGold,
  WORKER_BASE_COST,
  WORKER_BASE_OUTPUT,
  WORKER_COST_MULTIPLIER,
  WORKER_OUTPUT_MULTIPLIER
} from '../../src/services/workerService';

describe('workerService', () => {
  describe('calculateWorkerPurchaseCost', () => {
    it('should return base cost for first worker', () => {
      const cost = calculateWorkerPurchaseCost(0); // 0 workers owned
      expect(cost).toBe(WORKER_BASE_COST);
    });

    it('should increase cost with more workers', () => {
      const cost1 = calculateWorkerPurchaseCost(0);
      const cost5 = calculateWorkerPurchaseCost(4);
      const cost10 = calculateWorkerPurchaseCost(9);

      expect(cost5).toBeGreaterThan(cost1);
      expect(cost10).toBeGreaterThan(cost5);
    });

    it('should apply multiplier correctly', () => {
      const cost0 = calculateWorkerPurchaseCost(0);
      const cost1 = calculateWorkerPurchaseCost(1);

      // Second worker should cost base * multiplier
      const expectedCost1 = Math.floor(WORKER_BASE_COST * WORKER_COST_MULTIPLIER);
      expect(cost1).toBe(expectedCost1);
    });
  });

  describe('calculateWorkerOutput', () => {
    it('should return base output for level 1 worker', () => {
      const output = calculateWorkerOutput(1);
      expect(output).toBe(WORKER_BASE_OUTPUT);
    });

    it('should increase output with level', () => {
      const level1 = calculateWorkerOutput(1);
      const level5 = calculateWorkerOutput(5);

      expect(level5).toBeGreaterThan(level1);
    });

    it('should apply output multiplier correctly', () => {
      const level1 = calculateWorkerOutput(1);
      const level2 = calculateWorkerOutput(2);

      // Level 2 should produce base * output multiplier
      const expectedLevel2 = Math.floor(WORKER_BASE_OUTPUT * WORKER_OUTPUT_MULTIPLIER);
      expect(level2).toBe(expectedLevel2);
    });
  });

  describe('calculatePendingGold', () => {
    it('should calculate gold based on hours elapsed', () => {
      const lastCollected = new Date();
      lastCollected.setHours(lastCollected.getHours() - 2); // 2 hours ago

      const gold = calculatePendingGold(WORKER_BASE_OUTPUT, lastCollected);

      // 2 hours * 5 gold/hour = 10 gold
      expect(gold).toBeGreaterThanOrEqual(9);
      expect(gold).toBeLessThanOrEqual(11);
    });

    it('should return 0 for just collected', () => {
      const gold = calculatePendingGold(WORKER_BASE_OUTPUT, new Date());
      expect(gold).toBe(0);
    });

    it('should scale with gold per hour', () => {
      const lastCollected = new Date();
      lastCollected.setHours(lastCollected.getHours() - 1); // 1 hour ago

      const gold5 = calculatePendingGold(5, lastCollected);
      const gold10 = calculatePendingGold(10, lastCollected);

      // gold10 should be approximately 2x gold5
      expect(gold10).toBeGreaterThan(gold5);
      expect(gold10).toBeLessThanOrEqual(gold5 * 2 + 1); // Allow for rounding
    });

    it('should handle longer time periods', () => {
      const lastCollected = new Date();
      lastCollected.setHours(lastCollected.getHours() - 24); // 24 hours ago

      const gold = calculatePendingGold(WORKER_BASE_OUTPUT, lastCollected);

      // 24 hours * 5 gold/hour = 120 gold
      expect(gold).toBeGreaterThanOrEqual(119);
      expect(gold).toBeLessThanOrEqual(121);
    });
  });

  describe('constants', () => {
    it('should have base cost of 100', () => {
      expect(WORKER_BASE_COST).toBe(100);
    });

    it('should have base output of 5 gold per hour', () => {
      expect(WORKER_BASE_OUTPUT).toBe(5);
    });

    it('should have cost multiplier greater than 1', () => {
      expect(WORKER_COST_MULTIPLIER).toBeGreaterThan(1);
    });

    it('should have output multiplier greater than 1', () => {
      expect(WORKER_OUTPUT_MULTIPLIER).toBeGreaterThan(1);
    });
  });
});
