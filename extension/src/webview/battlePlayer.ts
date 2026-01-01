import type { BattleAction } from '../../../src/types';

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
