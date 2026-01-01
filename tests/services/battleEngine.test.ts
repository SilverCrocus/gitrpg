import { describe, it, expect } from 'vitest';
import {
  BattleEngine,
  calculateDamage,
  determineTurnOrder,
  BattleFighter
} from '../../src/services/battleEngine';
import type { CharacterStats } from '../../src/types';

describe('battleEngine', () => {
  const createFighter = (overrides: Partial<BattleFighter> = {}): BattleFighter => ({
    id: 'fighter1',
    name: 'Test Fighter',
    class: 'warrior',
    level: 5,
    stats: {
      maxHp: 100,
      attack: 15,
      defense: 10,
      speed: 10,
      critChance: 0.1,
      critDamage: 1.5
    },
    currentHp: 100,
    ...overrides
  });

  describe('calculateDamage', () => {
    it('should calculate base damage correctly', () => {
      const attacker = createFighter({ stats: { ...createFighter().stats, attack: 20 } });
      const defender = createFighter({ stats: { ...createFighter().stats, defense: 10 } });

      const result = calculateDamage(attacker, defender, false);

      // Base damage = attack - (defense / 2) = 20 - 5 = 15
      expect(result.damage).toBeGreaterThanOrEqual(12); // With variance
      expect(result.damage).toBeLessThanOrEqual(18);
    });

    it('should apply crit multiplier on critical hit', () => {
      const attacker = createFighter({
        stats: { ...createFighter().stats, attack: 20, critDamage: 2.0 }
      });
      const defender = createFighter();

      const normalResult = calculateDamage(attacker, defender, false);
      const critResult = calculateDamage(attacker, defender, true);

      expect(critResult.damage).toBeGreaterThan(normalResult.damage);
      expect(critResult.isCrit).toBe(true);
    });

    it('should have minimum damage of 1', () => {
      const attacker = createFighter({ stats: { ...createFighter().stats, attack: 1 } });
      const defender = createFighter({ stats: { ...createFighter().stats, defense: 100 } });

      const result = calculateDamage(attacker, defender, false);

      expect(result.damage).toBeGreaterThanOrEqual(1);
    });
  });

  describe('determineTurnOrder', () => {
    it('should order by speed (faster first)', () => {
      const slow = createFighter({ id: 'slow', stats: { ...createFighter().stats, speed: 5 } });
      const fast = createFighter({ id: 'fast', stats: { ...createFighter().stats, speed: 20 } });

      const order = determineTurnOrder(slow, fast);

      expect(order[0].id).toBe('fast');
      expect(order[1].id).toBe('slow');
    });
  });

  describe('BattleEngine', () => {
    it('should complete a battle with a winner', () => {
      const fighter1 = createFighter({ id: 'p1', name: 'Player 1' });
      const fighter2 = createFighter({ id: 'p2', name: 'Player 2' });

      const engine = new BattleEngine(fighter1, fighter2);
      const result = engine.runBattle();

      expect(result.winner).toBeDefined();
      expect(result.actions.length).toBeGreaterThan(0);
      expect(result.winner.currentHp).toBeGreaterThan(0);
    });

    it('should record all battle actions', () => {
      const fighter1 = createFighter({ id: 'p1' });
      const fighter2 = createFighter({ id: 'p2' });

      const engine = new BattleEngine(fighter1, fighter2);
      const result = engine.runBattle();

      for (const action of result.actions) {
        expect(action.turn).toBeGreaterThan(0);
        expect(action.actorId).toBeDefined();
        expect(action.damage).toBeGreaterThanOrEqual(0);
      }
    });

    it('should have loser with 0 HP', () => {
      const fighter1 = createFighter({ id: 'p1' });
      const fighter2 = createFighter({ id: 'p2' });

      const engine = new BattleEngine(fighter1, fighter2);
      const result = engine.runBattle();

      expect(result.loser.currentHp).toBe(0);
    });

    it('should estimate animation duration based on actions', () => {
      const fighter1 = createFighter({ id: 'p1' });
      const fighter2 = createFighter({ id: 'p2' });

      const engine = new BattleEngine(fighter1, fighter2);
      const result = engine.runBattle();

      expect(result.duration).toBeGreaterThan(0);
      // Duration should scale with number of actions
      expect(result.duration).toBe(result.actions.length * 500);
    });
  });
});
