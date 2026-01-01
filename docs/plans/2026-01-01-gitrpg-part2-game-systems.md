# GitRPG Implementation Plan - Part 2: Game Systems

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Prerequisites:** Complete Part 1 (Foundation) first. Part 2 builds on the backend, extension, git tracking, and sprite systems.

**Goal:** Implement game mechanics - battle system, quests, workers, and web dashboard.

**Architecture:** Battle engine runs auto-battles with animation playback, quest system generates dailies, worker system runs idle gold generation, web dashboard provides full stats view.

---

## Parallel Workstream Overview (Part 2)

| Workstream | Tasks | Can Run In Parallel With | Dependencies |
|------------|-------|--------------------------|--------------|
| **E: Battle System** | 8-11 | F, G | Part 1 complete |
| **F: Quest & Worker** | 12-15 | E, G | Part 1 complete |
| **G: Web Dashboard** | 16-19 | E, F | Part 1 complete |
| **H: Integration** | 20-22 | None | E, F, G complete |

**Recommended Agent Allocation:**
- 2 code-executor agents per workstream E-G (6 total)
- 1 code-reviewer agent per workstream (3 total)
- 2 agents for integration workstream H
- Total: 11 agents for Part 2

**Combined Total: 23 agents across Parts 1 & 2**

---

## Workstream E: Battle System

### Task 8: Battle Engine Core

**Files:**
- Create: `src/services/battleEngine.ts`
- Test: `tests/services/battleEngine.test.ts`

**Step 1: Write failing test**

```typescript
// tests/services/battleEngine.test.ts
import { describe, it, expect } from 'vitest';
import {
  BattleEngine,
  calculateDamage,
  determineTurnOrder,
  BattleFighter
} from '../../src/services/battleEngine';
import { CharacterStats } from '../../src/types';

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
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- tests/services/battleEngine.test.ts
```

Expected: FAIL - module not found

**Step 3: Write implementation**

```typescript
// src/services/battleEngine.ts
import { CharacterClass, CharacterStats, BattleAction } from '../types';

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
  duration: number; // estimated duration in ms for animation
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
    const startTime = Date.now();

    while (this.fighter1.currentHp > 0 && this.fighter2.currentHp > 0) {
      this.turn++;
      this.executeTurn();

      // Safety limit
      if (this.turn > 100) {
        break;
      }
    }

    const winner = this.fighter1.currentHp > 0 ? this.fighter1 : this.fighter2;
    const loser = this.fighter1.currentHp > 0 ? this.fighter2 : this.fighter1;

    // Estimate animation duration: ~500ms per action
    const duration = this.actions.length * 500;

    return {
      winner,
      loser,
      actions: this.actions,
      totalTurns: this.turn,
      duration
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

// Convert character to battle fighter
export function characterToBattleFighter(
  oderId: string,
  characterId: string,
  characterName: string,
  characterClass: CharacterClass,
  level: number,
  stats: CharacterStats
): BattleFighter {
  return {
    id: oderId,
    name: characterName,
    class: characterClass,
    level,
    stats,
    currentHp: stats.maxHp
  };
}
```

**Step 4: Run tests**

```bash
npm test -- tests/services/battleEngine.test.ts
```

Expected: All tests pass

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add battle engine with damage calculation and turn order"
```

---

### Task 9: Battle Service (Firebase Integration)

**Files:**
- Create: `src/services/battleService.ts`
- Test: `tests/services/battleService.test.ts`

**Step 1: Write failing test**

```typescript
// tests/services/battleService.test.ts
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
  });

  describe('BATTLE_REWARDS', () => {
    it('should have defined base values', () => {
      expect(BATTLE_REWARDS.winnerBaseXp).toBeGreaterThan(0);
      expect(BATTLE_REWARDS.winnerBaseGold).toBeGreaterThan(0);
      expect(BATTLE_REWARDS.loserBaseXp).toBeGreaterThan(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- tests/services/battleService.test.ts
```

Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/services/battleService.ts
import { doc, setDoc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { getDb } from './firebase';
import { Battle, BattleStatus, BattleParticipant, BattleRewards, BattleAction } from '../types';
import { BattleEngine, characterToBattleFighter, BattleResult } from './battleEngine';
import { getCharacter } from './characterService';
import { getUser, updateUserGold } from './userService';
import { addXpToCharacter } from './characterService';
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

  const challenger: BattleParticipant = {
    oderId: challengerId,
    odeName: (await getUser(challengerId))?.displayName || 'Unknown',
    characterId: challengerCharacterId,
    characterName: challengerChar.name,
    characterClass: challengerChar.class,
    characterLevel: challengerChar.level,
    stats: challengerChar.stats,
    currentHp: challengerChar.stats.maxHp
  };

  const opponent: BattleParticipant = {
    oderId: opponentId,
    odeName: (await getUser(opponentId))?.displayName || 'Unknown',
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
    battle.player1.oderId,
    battle.player1.characterId,
    battle.player1.characterName,
    battle.player1.characterClass,
    battle.player1.characterLevel,
    battle.player1.stats
  );

  const fighter2 = characterToBattleFighter(
    battle.player2.oderId,
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

  const winnerIsPlayer1 = winnerId === battle.player1.oderId;
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
      oderId: winnerId,
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
  const q1 = query(battlesRef, where('player1.oderId', '==', oderId));
  const q2 = query(battlesRef, where('player2.oderId', '==', oderId));

  const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

  const battles: Battle[] = [];
  snap1.forEach(doc => battles.push(doc.data() as Battle));
  snap2.forEach(doc => battles.push(doc.data() as Battle));

  // Sort by creation date descending and limit
  return battles
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}
```

**Step 4: Run tests**

```bash
npm test -- tests/services/battleService.test.ts
```

Expected: All tests pass

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add battle service with rewards and Firebase integration"
```

---

### Task 10: Battle Animation Player (Webview)

**Files:**
- Create: `extension/src/webview/battlePlayer.ts`
- Create: `extension/src/webview/battleUI.ts`

**Step 1: Create extension/src/webview/battlePlayer.ts**

```typescript
import { BattleAction } from '../../../src/types';
import { SpriteAnimator } from '../sprites/spriteAnimator';

export interface BattleAnimationConfig {
  actionDuration: number; // ms per action
  damagePauseDuration: number;
  victoryDuration: number;
}

export const DEFAULT_BATTLE_CONFIG: BattleAnimationConfig = {
  actionDuration: 800,
  damagePauseDuration: 300,
  victoryDuration: 2000
};

export type BattleAnimationState = 'idle' | 'attacking' | 'hurt' | 'victory' | 'defeat';

export interface FighterAnimationState {
  id: string;
  state: BattleAnimationState;
  currentHp: number;
  maxHp: number;
  position: { x: number; y: number };
  facing: 'left' | 'right';
}

export class BattleAnimationPlayer {
  private actions: BattleAction[];
  private currentActionIndex: number = 0;
  private config: BattleAnimationConfig;
  private fighter1State: FighterAnimationState;
  private fighter2State: FighterAnimationState;
  private isPlaying: boolean = false;
  private onUpdate: (state: BattleAnimationPlayer) => void;
  private onComplete: () => void;

  constructor(
    actions: BattleAction[],
    fighter1: { id: string; maxHp: number },
    fighter2: { id: string; maxHp: number },
    onUpdate: (state: BattleAnimationPlayer) => void,
    onComplete: () => void,
    config: BattleAnimationConfig = DEFAULT_BATTLE_CONFIG
  ) {
    this.actions = actions;
    this.config = config;
    this.onUpdate = onUpdate;
    this.onComplete = onComplete;

    this.fighter1State = {
      id: fighter1.id,
      state: 'idle',
      currentHp: fighter1.maxHp,
      maxHp: fighter1.maxHp,
      position: { x: 100, y: 200 },
      facing: 'right'
    };

    this.fighter2State = {
      id: fighter2.id,
      state: 'idle',
      currentHp: fighter2.maxHp,
      maxHp: fighter2.maxHp,
      position: { x: 400, y: 200 },
      facing: 'left'
    };
  }

  play(): void {
    this.isPlaying = true;
    this.playNextAction();
  }

  pause(): void {
    this.isPlaying = false;
  }

  skip(): void {
    // Jump to final state
    const lastAction = this.actions[this.actions.length - 1];
    if (lastAction) {
      this.applyFinalState();
      this.onComplete();
    }
  }

  private playNextAction(): void {
    if (!this.isPlaying || this.currentActionIndex >= this.actions.length) {
      this.showVictoryAnimation();
      return;
    }

    const action = this.actions[this.currentActionIndex];
    this.animateAction(action);
  }

  private animateAction(action: BattleAction): void {
    const attacker = this.getFighterState(action.actorId);
    const defender = this.getFighterState(action.targetId);

    if (!attacker || !defender) return;

    // Attacker attacks
    attacker.state = 'attacking';
    this.onUpdate(this);

    setTimeout(() => {
      // Defender takes damage
      attacker.state = 'idle';
      defender.state = 'hurt';
      defender.currentHp = action.resultingHp;
      this.onUpdate(this);

      setTimeout(() => {
        defender.state = defender.currentHp > 0 ? 'idle' : 'defeat';
        this.onUpdate(this);

        this.currentActionIndex++;
        setTimeout(() => this.playNextAction(), 200);
      }, this.config.damagePauseDuration);
    }, this.config.actionDuration / 2);
  }

  private showVictoryAnimation(): void {
    const winner = this.fighter1State.currentHp > 0 ? this.fighter1State : this.fighter2State;
    winner.state = 'victory';
    this.onUpdate(this);

    setTimeout(() => {
      this.onComplete();
    }, this.config.victoryDuration);
  }

  private applyFinalState(): void {
    const lastAction = this.actions[this.actions.length - 1];
    if (!lastAction) return;

    // Find who lost (HP = 0)
    for (const action of this.actions) {
      const defender = this.getFighterState(action.targetId);
      if (defender) {
        defender.currentHp = action.resultingHp;
        if (action.resultingHp <= 0) {
          defender.state = 'defeat';
        }
      }
    }

    const winner = this.fighter1State.currentHp > 0 ? this.fighter1State : this.fighter2State;
    winner.state = 'victory';
    this.onUpdate(this);
  }

  private getFighterState(id: string): FighterAnimationState | null {
    if (this.fighter1State.id === id) return this.fighter1State;
    if (this.fighter2State.id === id) return this.fighter2State;
    return null;
  }

  getFighter1State(): FighterAnimationState {
    return this.fighter1State;
  }

  getFighter2State(): FighterAnimationState {
    return this.fighter2State;
  }

  getCurrentAction(): BattleAction | null {
    return this.actions[this.currentActionIndex] || null;
  }

  getProgress(): number {
    return this.actions.length > 0 ? this.currentActionIndex / this.actions.length : 0;
  }
}
```

**Step 2: Create extension/src/webview/battleUI.ts**

```typescript
export function generateBattleHTML(
  fighter1Name: string,
  fighter1Class: string,
  fighter1Level: number,
  fighter2Name: string,
  fighter2Class: string,
  fighter2Level: number
): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GitRPG Battle</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: 'Press Start 2P', monospace;
      background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
      color: white;
      margin: 0;
      padding: 20px;
      min-height: 100vh;
    }

    .battle-arena {
      max-width: 600px;
      margin: 0 auto;
      position: relative;
      height: 400px;
      background: linear-gradient(180deg, transparent 60%, #2d4a3e 60%);
      border: 4px solid #4a4a6a;
      border-radius: 8px;
    }

    .fighter {
      position: absolute;
      bottom: 100px;
      text-align: center;
    }

    .fighter-left { left: 50px; }
    .fighter-right { right: 50px; }

    .fighter-sprite {
      width: 96px;
      height: 96px;
      image-rendering: pixelated;
      background-size: contain;
      margin: 0 auto;
    }

    .fighter-name {
      font-size: 10px;
      margin-top: 8px;
      text-shadow: 2px 2px #000;
    }

    .health-bar-container {
      position: absolute;
      top: 20px;
      width: 200px;
      padding: 10px;
      background: rgba(0,0,0,0.7);
      border: 2px solid #4a4a6a;
      border-radius: 4px;
    }

    .health-bar-left { left: 20px; }
    .health-bar-right { right: 20px; text-align: right; }

    .health-bar-name {
      font-size: 10px;
      margin-bottom: 5px;
    }

    .health-bar-level {
      font-size: 8px;
      color: #aaa;
      margin-bottom: 5px;
    }

    .health-bar {
      width: 100%;
      height: 16px;
      background: #333;
      border: 2px solid #666;
      border-radius: 2px;
      overflow: hidden;
    }

    .health-bar-fill {
      height: 100%;
      background: linear-gradient(180deg, #4ade80 0%, #22c55e 100%);
      transition: width 0.3s ease;
    }

    .health-bar-fill.low {
      background: linear-gradient(180deg, #ef4444 0%, #dc2626 100%);
    }

    .health-bar-fill.medium {
      background: linear-gradient(180deg, #facc15 0%, #eab308 100%);
    }

    .damage-popup {
      position: absolute;
      font-size: 24px;
      font-weight: bold;
      color: #ef4444;
      text-shadow: 2px 2px #000;
      animation: damageFloat 1s ease-out forwards;
      pointer-events: none;
    }

    .damage-popup.crit {
      color: #f59e0b;
      font-size: 32px;
    }

    @keyframes damageFloat {
      0% { opacity: 1; transform: translateY(0); }
      100% { opacity: 0; transform: translateY(-50px); }
    }

    .battle-log {
      max-width: 600px;
      margin: 20px auto;
      padding: 15px;
      background: rgba(0,0,0,0.5);
      border: 2px solid #4a4a6a;
      border-radius: 4px;
      max-height: 150px;
      overflow-y: auto;
      font-size: 10px;
    }

    .log-entry {
      margin: 5px 0;
      padding: 5px;
      border-bottom: 1px solid #333;
    }

    .log-entry.crit { color: #f59e0b; }

    .battle-controls {
      max-width: 600px;
      margin: 20px auto;
      display: flex;
      gap: 10px;
      justify-content: center;
    }

    .battle-btn {
      padding: 10px 20px;
      font-family: inherit;
      font-size: 10px;
      background: #4a4a6a;
      color: white;
      border: 2px solid #6a6a8a;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .battle-btn:hover {
      background: #5a5a7a;
      transform: translateY(-2px);
    }

    .battle-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .victory-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.8);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.5s;
    }

    .victory-overlay.visible {
      opacity: 1;
      pointer-events: auto;
    }

    .victory-text {
      font-size: 24px;
      color: #ffd700;
      text-shadow: 2px 2px #000;
      margin-bottom: 20px;
    }

    .rewards {
      font-size: 12px;
      color: #4ade80;
    }
  </style>
</head>
<body>
  <div class="battle-arena" id="arena">
    <div class="health-bar-container health-bar-left">
      <div class="health-bar-name" id="p1-name">${fighter1Name}</div>
      <div class="health-bar-level">Lv.${fighter1Level} ${fighter1Class}</div>
      <div class="health-bar">
        <div class="health-bar-fill" id="p1-health" style="width: 100%"></div>
      </div>
    </div>

    <div class="health-bar-container health-bar-right">
      <div class="health-bar-name" id="p2-name">${fighter2Name}</div>
      <div class="health-bar-level">Lv.${fighter2Level} ${fighter2Class}</div>
      <div class="health-bar">
        <div class="health-bar-fill" id="p2-health" style="width: 100%"></div>
      </div>
    </div>

    <div class="fighter fighter-left" id="fighter1">
      <div class="fighter-sprite" id="sprite1"></div>
      <div class="fighter-name">${fighter1Name}</div>
    </div>

    <div class="fighter fighter-right" id="fighter2">
      <div class="fighter-sprite" id="sprite2"></div>
      <div class="fighter-name">${fighter2Name}</div>
    </div>

    <div class="victory-overlay" id="victoryOverlay">
      <div class="victory-text" id="victoryText">VICTORY!</div>
      <div class="rewards" id="rewardsText"></div>
    </div>
  </div>

  <div class="battle-log" id="battleLog"></div>

  <div class="battle-controls">
    <button class="battle-btn" id="skipBtn">Skip</button>
    <button class="battle-btn" id="closeBtn">Close</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    document.getElementById('skipBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'skip' });
    });

    document.getElementById('closeBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'close' });
    });

    window.addEventListener('message', event => {
      const message = event.data;

      switch (message.type) {
        case 'updateHealth':
          updateHealthBar(message.playerId, message.currentHp, message.maxHp);
          break;
        case 'showDamage':
          showDamagePopup(message.targetId, message.damage, message.isCrit);
          break;
        case 'updateAnimation':
          updateFighterAnimation(message.fighterId, message.animation);
          break;
        case 'addLogEntry':
          addLogEntry(message.text, message.isCrit);
          break;
        case 'showVictory':
          showVictory(message.winnerName, message.xp, message.gold);
          break;
      }
    });

    function updateHealthBar(playerId, current, max) {
      const bar = document.getElementById(playerId === 1 ? 'p1-health' : 'p2-health');
      const percent = (current / max) * 100;
      bar.style.width = percent + '%';

      bar.classList.remove('low', 'medium');
      if (percent <= 25) bar.classList.add('low');
      else if (percent <= 50) bar.classList.add('medium');
    }

    function showDamagePopup(targetId, damage, isCrit) {
      const fighter = document.getElementById(targetId === 1 ? 'fighter1' : 'fighter2');
      const popup = document.createElement('div');
      popup.className = 'damage-popup' + (isCrit ? ' crit' : '');
      popup.textContent = (isCrit ? 'CRIT! ' : '') + damage;
      popup.style.left = '50%';
      popup.style.top = '-20px';
      fighter.appendChild(popup);
      setTimeout(() => popup.remove(), 1000);
    }

    function addLogEntry(text, isCrit) {
      const log = document.getElementById('battleLog');
      const entry = document.createElement('div');
      entry.className = 'log-entry' + (isCrit ? ' crit' : '');
      entry.textContent = text;
      log.appendChild(entry);
      log.scrollTop = log.scrollHeight;
    }

    function showVictory(winnerName, xp, gold) {
      const overlay = document.getElementById('victoryOverlay');
      document.getElementById('victoryText').textContent = winnerName + ' WINS!';
      document.getElementById('rewardsText').textContent = '+' + xp + ' XP | +' + gold + ' Gold';
      overlay.classList.add('visible');
    }

    function updateFighterAnimation(fighterId, animation) {
      // Animation updates handled by CSS classes
      const sprite = document.getElementById(fighterId === 1 ? 'sprite1' : 'sprite2');
      sprite.className = 'fighter-sprite animation-' + animation;
    }
  </script>
</body>
</html>
`;
}
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add battle animation player and battle UI"
```

---

### Task 11: Battle Integration with Extension

**Files:**
- Modify: `extension/src/extension.ts`
- Create: `extension/src/commands/battleCommand.ts`

**Step 1: Create extension/src/commands/battleCommand.ts**

```typescript
import * as vscode from 'vscode';
import { generateBattleHTML } from '../webview/battleUI';
import { BattleAnimationPlayer } from '../webview/battlePlayer';

export async function showBattlePanel(
  context: vscode.ExtensionContext,
  battleData: {
    fighter1: { name: string; class: string; level: number; maxHp: number; id: string };
    fighter2: { name: string; class: string; level: number; maxHp: number; id: string };
    actions: any[];
    winnerId: string;
    rewards: { xp: number; gold: number };
  }
): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    'gitrpgBattle',
    'GitRPG Battle',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  panel.webview.html = generateBattleHTML(
    battleData.fighter1.name,
    battleData.fighter1.class,
    battleData.fighter1.level,
    battleData.fighter2.name,
    battleData.fighter2.class,
    battleData.fighter2.level
  );

  // Create animation player
  const player = new BattleAnimationPlayer(
    battleData.actions,
    { id: battleData.fighter1.id, maxHp: battleData.fighter1.maxHp },
    { id: battleData.fighter2.id, maxHp: battleData.fighter2.maxHp },
    (state) => {
      // Send updates to webview
      const f1 = state.getFighter1State();
      const f2 = state.getFighter2State();

      panel.webview.postMessage({
        type: 'updateHealth',
        playerId: 1,
        currentHp: f1.currentHp,
        maxHp: f1.maxHp
      });

      panel.webview.postMessage({
        type: 'updateHealth',
        playerId: 2,
        currentHp: f2.currentHp,
        maxHp: f2.maxHp
      });

      panel.webview.postMessage({
        type: 'updateAnimation',
        fighterId: 1,
        animation: f1.state
      });

      panel.webview.postMessage({
        type: 'updateAnimation',
        fighterId: 2,
        animation: f2.state
      });

      const action = state.getCurrentAction();
      if (action && action.damage > 0) {
        panel.webview.postMessage({
          type: 'showDamage',
          targetId: action.targetId === f1.id ? 1 : 2,
          damage: action.damage,
          isCrit: action.isCrit
        });

        const attackerName = action.actorId === f1.id ? battleData.fighter1.name : battleData.fighter2.name;
        const defenderName = action.targetId === f1.id ? battleData.fighter1.name : battleData.fighter2.name;
        panel.webview.postMessage({
          type: 'addLogEntry',
          text: `${attackerName} hits ${defenderName} for ${action.damage} damage!`,
          isCrit: action.isCrit
        });
      }
    },
    () => {
      // Battle complete
      const winnerName = battleData.winnerId === battleData.fighter1.id
        ? battleData.fighter1.name
        : battleData.fighter2.name;

      panel.webview.postMessage({
        type: 'showVictory',
        winnerName,
        xp: battleData.rewards.xp,
        gold: battleData.rewards.gold
      });
    }
  );

  // Handle messages from webview
  panel.webview.onDidReceiveMessage(
    message => {
      switch (message.type) {
        case 'skip':
          player.skip();
          break;
        case 'close':
          panel.dispose();
          break;
      }
    },
    undefined,
    context.subscriptions
  );

  // Start the battle animation
  setTimeout(() => player.play(), 1000);
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: add battle command integration with extension"
```

---

## Workstream F: Quest & Worker Systems

### Task 12: Quest Service

**Files:**
- Create: `src/services/questService.ts`
- Test: `tests/services/questService.test.ts`

**Step 1: Write failing test**

```typescript
// tests/services/questService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateDailyQuests,
  checkQuestProgress,
  DAILY_QUEST_COUNT
} from '../../src/services/questService';
import { ActivityStats } from '../../src/services/activityTracker';

describe('questService', () => {
  describe('generateDailyQuests', () => {
    it('should generate the correct number of daily quests', () => {
      const quests = generateDailyQuests();
      expect(quests).toHaveLength(DAILY_QUEST_COUNT);
    });

    it('should give quests unique IDs', () => {
      const quests = generateDailyQuests();
      const ids = quests.map(q => q.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should set quests as active status', () => {
      const quests = generateDailyQuests();
      for (const quest of quests) {
        expect(quest.status).toBe('active');
      }
    });

    it('should set expiration to end of day', () => {
      const quests = generateDailyQuests();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      for (const quest of quests) {
        expect(quest.expiresAt).toBeDefined();
        expect(new Date(quest.expiresAt!).getTime()).toBeLessThanOrEqual(tomorrow.getTime());
      }
    });
  });

  describe('checkQuestProgress', () => {
    it('should update progress based on activity stats', () => {
      const quests = generateDailyQuests();
      const commitQuest = quests.find(q => q.requirement.type === 'commits');

      if (commitQuest) {
        const stats: ActivityStats = {
          commits: 5,
          linesAdded: 100,
          linesRemoved: 20,
          filesChanged: 3,
          xpEarned: 0
        };

        const updated = checkQuestProgress(commitQuest, stats);
        expect(updated.requirement.current).toBe(5);
      }
    });

    it('should mark quest as completed when target reached', () => {
      const quests = generateDailyQuests();
      const commitQuest = quests.find(q => q.requirement.type === 'commits');

      if (commitQuest) {
        const stats: ActivityStats = {
          commits: commitQuest.requirement.target + 10, // Exceed target
          linesAdded: 1000,
          linesRemoved: 100,
          filesChanged: 50,
          xpEarned: 0
        };

        const updated = checkQuestProgress(commitQuest, stats);
        expect(updated.status).toBe('completed');
      }
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- tests/services/questService.test.ts
```

Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/services/questService.ts
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getDb } from './firebase';
import { Quest, QuestType, QuestRequirement, QuestRewards, UserQuests, DAILY_QUEST_TEMPLATES } from '../types';
import { ActivityStats } from './activityTracker';
import { v4 as uuidv4 } from 'uuid';

export const DAILY_QUEST_COUNT = 3;
const USER_QUESTS_COLLECTION = 'userQuests';

export function generateDailyQuests(): Quest[] {
  const quests: Quest[] = [];
  const usedTemplates = new Set<number>();

  // Get end of day
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  while (quests.length < DAILY_QUEST_COUNT && usedTemplates.size < DAILY_QUEST_TEMPLATES.length) {
    const templateIndex = Math.floor(Math.random() * DAILY_QUEST_TEMPLATES.length);

    if (usedTemplates.has(templateIndex)) continue;
    usedTemplates.add(templateIndex);

    const template = DAILY_QUEST_TEMPLATES[templateIndex];
    const target = Math.floor(
      Math.random() * (template.targetRange[1] - template.targetRange[0] + 1) + template.targetRange[0]
    );

    quests.push({
      id: uuidv4(),
      type: 'daily',
      title: template.title,
      description: template.description.replace('{target}', target.toString()),
      requirement: {
        type: template.type,
        target,
        current: 0
      },
      rewards: {
        xp: template.xp,
        gold: template.gold
      },
      expiresAt: endOfDay,
      status: 'active'
    });
  }

  return quests;
}

export function checkQuestProgress(quest: Quest, stats: ActivityStats): Quest {
  if (quest.status !== 'active') return quest;

  let current = 0;

  switch (quest.requirement.type) {
    case 'commits':
      current = stats.commits;
      break;
    case 'lines_added':
      current = stats.linesAdded;
      break;
    case 'files_changed':
      current = stats.filesChanged;
      break;
  }

  const updatedQuest = {
    ...quest,
    requirement: {
      ...quest.requirement,
      current
    }
  };

  if (current >= quest.requirement.target) {
    updatedQuest.status = 'completed';
  }

  return updatedQuest;
}

export async function getUserQuests(userId: string): Promise<UserQuests | null> {
  const db = getDb();
  const questsRef = doc(db, USER_QUESTS_COLLECTION, oderId);
  const snapshot = await getDoc(questsRef);

  if (!snapshot.exists()) return null;
  return snapshot.data() as UserQuests;
}

export async function initializeUserQuests(userId: string): Promise<UserQuests> {
  const db = getDb();
  const questsRef = doc(db, USER_QUESTS_COLLECTION, oderId);

  const userQuests: UserQuests = {
    oderId,
    activeQuests: generateDailyQuests(),
    completedQuestIds: [],
    lastDailyRefresh: new Date()
  };

  await setDoc(questsRef, {
    ...userQuests,
    lastDailyRefresh: serverTimestamp()
  });

  return userQuests;
}

export async function refreshDailyQuestsIfNeeded(userId: string): Promise<UserQuests> {
  let userQuests = await getUserQuests(userId);

  if (!userQuests) {
    return initializeUserQuests(userId);
  }

  const now = new Date();
  const lastRefresh = new Date(userQuests.lastDailyRefresh);

  // Check if it's a new day
  const isNewDay = now.toDateString() !== lastRefresh.toDateString();

  if (isNewDay) {
    // Expire old daily quests
    const expiredQuestIds = userQuests.activeQuests
      .filter(q => q.type === 'daily' && q.status === 'active')
      .map(q => q.id);

    // Generate new daily quests
    const newDailies = generateDailyQuests();

    // Keep non-daily quests (streaks, achievements)
    const keptQuests = userQuests.activeQuests.filter(q => q.type !== 'daily');

    userQuests = {
      ...userQuests,
      activeQuests: [...keptQuests, ...newDailies],
      lastDailyRefresh: now
    };

    const db = getDb();
    const questsRef = doc(db, USER_QUESTS_COLLECTION, oderId);
    await updateDoc(questsRef, {
      activeQuests: userQuests.activeQuests,
      lastDailyRefresh: serverTimestamp()
    });
  }

  return userQuests;
}

export async function updateQuestProgress(
  userId: string,
  stats: ActivityStats
): Promise<{ completedQuests: Quest[]; rewards: QuestRewards }> {
  const userQuests = await refreshDailyQuestsIfNeeded(userId);

  const completedQuests: Quest[] = [];
  let totalXp = 0;
  let totalGold = 0;

  const updatedQuests = userQuests.activeQuests.map(quest => {
    const wasActive = quest.status === 'active';
    const updated = checkQuestProgress(quest, stats);

    if (wasActive && updated.status === 'completed') {
      completedQuests.push(updated);
      totalXp += updated.rewards.xp;
      totalGold += updated.rewards.gold;
    }

    return updated;
  });

  // Save updated quests
  const db = getDb();
  const questsRef = doc(db, USER_QUESTS_COLLECTION, oderId);
  await updateDoc(questsRef, {
    activeQuests: updatedQuests,
    completedQuestIds: [
      ...userQuests.completedQuestIds,
      ...completedQuests.map(q => q.id)
    ]
  });

  return {
    completedQuests,
    rewards: { xp: totalXp, gold: totalGold }
  };
}
```

**Step 4: Run tests**

```bash
npm test -- tests/services/questService.test.ts
```

Expected: All tests pass

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add quest service with daily quest generation"
```

---

### Task 13: Worker Service

**Files:**
- Create: `src/services/workerService.ts`
- Test: `tests/services/workerService.test.ts`

**Step 1: Write failing test**

```typescript
// tests/services/workerService.test.ts
import { describe, it, expect } from 'vitest';
import {
  calculateWorkerCost,
  calculateWorkerOutput,
  calculatePendingGold,
  WORKER_BASE_COST,
  WORKER_BASE_OUTPUT
} from '../../src/services/workerService';

describe('workerService', () => {
  describe('calculateWorkerCost', () => {
    it('should return base cost for first worker', () => {
      const cost = calculateWorkerCost(0); // 0 workers owned
      expect(cost).toBe(WORKER_BASE_COST);
    });

    it('should increase cost with more workers', () => {
      const cost1 = calculateWorkerCost(0);
      const cost5 = calculateWorkerCost(4);
      const cost10 = calculateWorkerCost(9);

      expect(cost5).toBeGreaterThan(cost1);
      expect(cost10).toBeGreaterThan(cost5);
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
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- tests/services/workerService.test.ts
```

Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/services/workerService.ts
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { getDb } from './firebase';
import { Worker } from '../types';
import { v4 as uuidv4 } from 'uuid';

export const WORKER_BASE_COST = 100;
export const WORKER_BASE_OUTPUT = 5; // gold per hour
export const WORKER_COST_MULTIPLIER = 1.15; // 15% increase per worker
export const WORKER_UPGRADE_COST_MULTIPLIER = 2.0;
export const WORKER_UPGRADE_OUTPUT_MULTIPLIER = 1.5;

const WORKERS_COLLECTION = 'workers';

export function calculateWorkerCost(currentWorkerCount: number): number {
  return Math.floor(WORKER_BASE_COST * Math.pow(WORKER_COST_MULTIPLIER, currentWorkerCount));
}

export function calculateWorkerOutput(level: number): number {
  return Math.floor(WORKER_BASE_OUTPUT * Math.pow(WORKER_UPGRADE_OUTPUT_MULTIPLIER, level - 1));
}

export function calculateWorkerUpgradeCost(currentLevel: number): number {
  return Math.floor(WORKER_BASE_COST * Math.pow(WORKER_UPGRADE_COST_MULTIPLIER, currentLevel));
}

export function calculatePendingGold(goldPerHour: number, lastCollectedAt: Date): number {
  const now = new Date();
  const hoursSinceCollection = (now.getTime() - lastCollectedAt.getTime()) / (1000 * 60 * 60);
  return Math.floor(hoursSinceCollection * goldPerHour);
}

export async function getUserWorkers(userId: string): Promise<Worker[]> {
  const db = getDb();
  const workersRef = collection(db, `users/${userId}/${WORKERS_COLLECTION}`);
  const snapshot = await getDocs(workersRef);

  return snapshot.docs.map(doc => doc.data() as Worker);
}

export async function purchaseWorker(userId: string, userGold: number): Promise<Worker> {
  const workers = await getUserWorkers(userId);
  const cost = calculateWorkerCost(workers.length);

  if (userGold < cost) {
    throw new Error(`Not enough gold. Need ${cost}, have ${userGold}`);
  }

  const db = getDb();
  const workerId = uuidv4();
  const workerRef = doc(db, `users/${userId}/${WORKERS_COLLECTION}`, workerId);

  const worker: Worker = {
    id: workerId,
    oderId,
    level: 1,
    goldPerHour: WORKER_BASE_OUTPUT,
    purchasedAt: new Date(),
    lastCollectedAt: new Date()
  };

  await setDoc(workerRef, {
    ...worker,
    purchasedAt: serverTimestamp(),
    lastCollectedAt: serverTimestamp()
  });

  return worker;
}

export async function upgradeWorker(
  userId: string,
  workerId: string,
  userGold: number
): Promise<Worker> {
  const db = getDb();
  const workerRef = doc(db, `users/${userId}/${WORKERS_COLLECTION}`, workerId);
  const snapshot = await getDoc(workerRef);

  if (!snapshot.exists()) {
    throw new Error('Worker not found');
  }

  const worker = snapshot.data() as Worker;
  const upgradeCost = calculateWorkerUpgradeCost(worker.level);

  if (userGold < upgradeCost) {
    throw new Error(`Not enough gold. Need ${upgradeCost}, have ${userGold}`);
  }

  const newLevel = worker.level + 1;
  const newOutput = calculateWorkerOutput(newLevel);

  await updateDoc(workerRef, {
    level: newLevel,
    goldPerHour: newOutput
  });

  return {
    ...worker,
    level: newLevel,
    goldPerHour: newOutput
  };
}

export async function collectWorkerGold(userId: string): Promise<number> {
  const workers = await getUserWorkers(userId);
  let totalGold = 0;

  const db = getDb();

  for (const worker of workers) {
    const pendingGold = calculatePendingGold(worker.goldPerHour, new Date(worker.lastCollectedAt));
    totalGold += pendingGold;

    // Update last collected time
    const workerRef = doc(db, `users/${userId}/${WORKERS_COLLECTION}`, worker.id);
    await updateDoc(workerRef, {
      lastCollectedAt: serverTimestamp()
    });
  }

  return totalGold;
}

export async function getTotalPendingGold(userId: string): Promise<number> {
  const workers = await getUserWorkers(userId);
  let total = 0;

  for (const worker of workers) {
    total += calculatePendingGold(worker.goldPerHour, new Date(worker.lastCollectedAt));
  }

  return total;
}

export async function getTotalGoldPerHour(userId: string): Promise<number> {
  const workers = await getUserWorkers(userId);
  return workers.reduce((sum, w) => sum + w.goldPerHour, 0);
}
```

**Step 4: Run tests**

```bash
npm test -- tests/services/workerService.test.ts
```

Expected: All tests pass

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add worker service with idle gold generation"
```

---

## Workstream G: Web Dashboard

### Task 14: Initialize Next.js Dashboard

**Files:**
- Create: `dashboard/package.json`
- Create: `dashboard/src/app/page.tsx`
- Create: `dashboard/src/app/layout.tsx`

**Step 1: Create dashboard directory and initialize**

```bash
mkdir -p /Users/diyagamah/Documents/gitrpg/dashboard
cd /Users/diyagamah/Documents/gitrpg/dashboard
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

**Step 2: Create dashboard/src/app/page.tsx**

```typescript
'use client';

import { useState, useEffect } from 'react';

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [character, setCharacter] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Fetch user data from Firebase
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
            GitRPG Dashboard
          </h1>
          <p className="text-gray-400 mt-2">Track your coding progress and battle stats</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Character Card */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-semibold mb-4 text-purple-400">Your Character</h2>
            <div className="flex items-center space-x-4">
              <div className="w-24 h-24 bg-gray-700 rounded-lg flex items-center justify-center">
                <span className="text-4xl">🧙</span>
              </div>
              <div>
                <p className="text-lg font-medium">Level 1 Warrior</p>
                <p className="text-gray-400">0 / 100 XP</p>
                <div className="w-32 h-2 bg-gray-700 rounded-full mt-2">
                  <div className="h-full bg-purple-500 rounded-full" style={{ width: '0%' }}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Card */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-semibold mb-4 text-green-400">Today's Stats</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Commits</span>
                <span className="font-medium">0</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Lines Added</span>
                <span className="font-medium">0</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Files Changed</span>
                <span className="font-medium">0</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">XP Earned</span>
                <span className="font-medium text-purple-400">0</span>
              </div>
            </div>
          </div>

          {/* Gold & Workers Card */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-semibold mb-4 text-yellow-400">Gold & Workers</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Gold</span>
                <span className="font-medium text-yellow-400">💰 0</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Workers</span>
                <span className="font-medium">0</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Gold/Hour</span>
                <span className="font-medium text-yellow-400">0</span>
              </div>
              <button className="w-full mt-4 bg-yellow-600 hover:bg-yellow-500 text-white py-2 rounded-lg transition">
                Collect Gold
              </button>
            </div>
          </div>

          {/* Quests Card */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 md:col-span-2">
            <h2 className="text-xl font-semibold mb-4 text-blue-400">Daily Quests</h2>
            <div className="space-y-4">
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">Commit Warrior</p>
                    <p className="text-sm text-gray-400">Make 5 commits today</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-400">0 / 5</p>
                    <p className="text-sm text-green-400">+50 XP | +25 Gold</p>
                  </div>
                </div>
                <div className="w-full h-2 bg-gray-600 rounded-full mt-2">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: '0%' }}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Battle History Card */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-semibold mb-4 text-red-400">Recent Battles</h2>
            <div className="text-gray-400 text-center py-8">
              No battles yet. Challenge a friend!
            </div>
            <button className="w-full bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg transition">
              Start Battle
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
```

**Step 3: Commit**

```bash
cd /Users/diyagamah/Documents/gitrpg
git add dashboard/
git commit -m "feat: initialize Next.js dashboard with basic UI"
```

---

## Workstream H: Integration

### Task 15: End-to-End Integration

**Files:**
- Create: `src/index.ts` (main entry point)
- Create: `scripts/setup.ts`

**Step 1: Create src/index.ts**

```typescript
// Main entry point - exports all services
export * from './types';
export * from './services/firebase';
export * from './services/userService';
export * from './services/characterService';
export * from './services/battleEngine';
export * from './services/battleService';
export * from './services/questService';
export * from './services/workerService';
export * from './services/gitWatcher';
export * from './services/activityTracker';
export * from './services/githubAuth';
export * from './services/githubApi';
```

**Step 2: Create scripts/setup.ts**

```typescript
#!/usr/bin/env ts-node

import { initializeFirebase } from '../src/services/firebase';
import { createUser, linkGitHubAccount } from '../src/services/userService';
import { createCharacter } from '../src/services/characterService';
import { initializeUserQuests } from '../src/services/questService';

async function setup() {
  console.log('GitRPG Setup Script');
  console.log('==================\n');

  // Check for Firebase config
  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
  };

  if (!firebaseConfig.apiKey) {
    console.log('Firebase config not found in environment variables.');
    console.log('Please set the following environment variables:');
    console.log('  FIREBASE_API_KEY');
    console.log('  FIREBASE_AUTH_DOMAIN');
    console.log('  FIREBASE_PROJECT_ID');
    console.log('  FIREBASE_STORAGE_BUCKET');
    console.log('  FIREBASE_MESSAGING_SENDER_ID');
    console.log('  FIREBASE_APP_ID');
    process.exit(1);
  }

  console.log('Initializing Firebase...');
  initializeFirebase(firebaseConfig as any);

  console.log('\nSetup complete! You can now:');
  console.log('1. Run the VSCode extension: cd extension && npm run watch');
  console.log('2. Run the web dashboard: cd dashboard && npm run dev');
  console.log('3. Run tests: npm test');
}

setup().catch(console.error);
```

**Step 3: Update root package.json**

```json
{
  "name": "gitrpg",
  "version": "0.1.0",
  "description": "Turn your coding into an RPG game",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "setup": "ts-node scripts/setup.ts",
    "lint": "eslint src --ext .ts"
  },
  "dependencies": {
    "firebase": "^10.7.0",
    "@octokit/rest": "^20.0.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.x",
    "@types/uuid": "^9.0.0",
    "vitest": "^1.0.0",
    "ts-node": "^10.9.0"
  }
}
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add main entry point and setup script"
```

---

## Final Checklist

After completing all tasks, run:

```bash
# Run all tests
npm test

# Build TypeScript
npm run build

# Build extension
cd extension && npm run compile

# Build dashboard
cd dashboard && npm run build
```

---

## Agent Execution Summary

**Part 1 Agents (12 total):**
- Workstream A: 2 code-executor + 1 code-reviewer = 3
- Workstream B: 2 code-executor + 1 code-reviewer = 3
- Workstream C: 2 code-executor + 1 code-reviewer = 3
- Workstream D: 2 code-executor + 1 code-reviewer = 3

**Part 2 Agents (11 total):**
- Workstream E: 2 code-executor + 1 code-reviewer = 3
- Workstream F: 2 code-executor + 1 code-reviewer = 3
- Workstream G: 2 code-executor + 1 code-reviewer = 3
- Workstream H: 2 integration agents = 2

**Total: 23 agents**

**Execution order:**
1. Part 1 workstreams A-D run in parallel
2. After Part 1 completes, Part 2 workstreams E-G run in parallel
3. After E-G complete, Workstream H runs for integration
