import * as vscode from 'vscode';
import {
  Character,
  CharacterStats,
  TodayStats,
  TrackingState,
  LocalGameState,
  ActivityResult,
  CharacterClass,
} from '../types';
import {
  CLASS_BASE_STATS,
  xpForLevel,
  calculateStatsForLevel,
  XP_CONFIG,
  LEVEL_CONFIG,
} from '../config/classConfig';

// Re-export CharacterData for backwards compatibility
export type { Character as CharacterData } from '../types';
export type { TodayStats, TrackingState, LocalGameState } from '../types';

const STATE_KEY = 'gitrpg.gameState';

function getDefaultState(): LocalGameState {
  const today = new Date().toISOString().split('T')[0];
  return {
    character: {
      name: 'CodeHero',
      class: 'Warrior',
      level: 1,
      xp: 0,
      xpToNextLevel: 100,
      gold: 0,
      stats: { ...CLASS_BASE_STATS.Warrior }
    },
    todayStats: {
      date: today,
      commits: 0,
      linesAdded: 0,
      linesRemoved: 0,
      filesChanged: 0,
      xpEarned: 0
    },
    tracking: {
      lastCheckedAt: new Date().toISOString(),
      processedCommitHashes: []
    },
    gitEmail: null
  };
}

export class LocalStateManager {
  private context: vscode.ExtensionContext;
  private state: LocalGameState;
  private onStateChangeCallbacks: Array<(state: LocalGameState) => void> = [];

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.state = this.loadState();
    this.resetTodayStatsIfNewDay();
  }

  private loadState(): LocalGameState {
    const saved = this.context.globalState.get<LocalGameState>(STATE_KEY);
    if (saved) {
      return saved;
    }
    return getDefaultState();
  }

  private async saveState(): Promise<void> {
    await this.context.globalState.update(STATE_KEY, this.state);
    this.notifyStateChange();
  }

  private notifyStateChange(): void {
    for (const callback of this.onStateChangeCallbacks) {
      callback(this.state);
    }
  }

  onStateChange(callback: (state: LocalGameState) => void): () => void {
    this.onStateChangeCallbacks.push(callback);
    return () => {
      const index = this.onStateChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.onStateChangeCallbacks.splice(index, 1);
      }
    };
  }

  getState(): LocalGameState {
    return { ...this.state };
  }

  getCharacter(): Character {
    return { ...this.state.character };
  }

  getTodayStats(): TodayStats {
    this.resetTodayStatsIfNewDay();
    return { ...this.state.todayStats };
  }

  getGitEmail(): string | null {
    return this.state.gitEmail;
  }

  async setGitEmail(email: string): Promise<void> {
    this.state.gitEmail = email;
    await this.saveState();
  }

  private resetTodayStatsIfNewDay(): void {
    const today = new Date().toISOString().split('T')[0];
    if (this.state.todayStats.date !== today) {
      this.state.todayStats = {
        date: today,
        commits: 0,
        linesAdded: 0,
        linesRemoved: 0,
        filesChanged: 0,
        xpEarned: 0
      };
      // Keep only recent commit hashes (last 100) to prevent memory bloat
      this.state.tracking.processedCommitHashes =
        this.state.tracking.processedCommitHashes.slice(-100);
    }
  }

  isCommitProcessed(hash: string): boolean {
    return this.state.tracking.processedCommitHashes.includes(hash);
  }

  async markCommitProcessed(hash: string): Promise<void> {
    if (!this.state.tracking.processedCommitHashes.includes(hash)) {
      this.state.tracking.processedCommitHashes.push(hash);
      await this.saveState();
    }
  }

  async updateLastChecked(): Promise<void> {
    this.state.tracking.lastCheckedAt = new Date().toISOString();
    await this.saveState();
  }

  getLastCheckedAt(): Date {
    return new Date(this.state.tracking.lastCheckedAt);
  }

  async addActivity(commits: number, linesAdded: number, linesRemoved: number, filesChanged: number): Promise<ActivityResult> {
    this.resetTodayStatsIfNewDay();

    // Update today's stats
    this.state.todayStats.commits += commits;
    this.state.todayStats.linesAdded += linesAdded;
    this.state.todayStats.linesRemoved += linesRemoved;
    this.state.todayStats.filesChanged += filesChanged;

    // Calculate XP earned
    const xpEarned = this.calculateXp(commits, linesAdded, linesRemoved, filesChanged);
    this.state.todayStats.xpEarned += xpEarned;

    // Add XP to character
    const oldLevel = this.state.character.level;
    this.state.character.xp += xpEarned;

    // Check for level up
    let leveledUp = false;
    while (this.state.character.xp >= this.state.character.xpToNextLevel) {
      this.state.character.xp -= this.state.character.xpToNextLevel;
      this.state.character.level++;
      this.state.character.xpToNextLevel = xpForLevel(this.state.character.level + 1);
      this.state.character.gold += LEVEL_CONFIG.goldPerLevel * this.state.character.level;
      leveledUp = true;

      // Increase stats on level up using centralized calculation
      const classStats = CLASS_BASE_STATS[this.state.character.class];
      this.state.character.stats = calculateStatsForLevel(classStats, this.state.character.level);
    }

    await this.saveState();

    return {
      xpEarned,
      leveledUp,
      newLevel: this.state.character.level
    };
  }

  private calculateXp(commits: number, linesAdded: number, linesRemoved: number, filesChanged: number): number {
    // Cap lines
    const cappedAdded = Math.min(linesAdded, XP_CONFIG.maxLinesPerCommit * commits);
    const cappedRemoved = Math.min(linesRemoved, XP_CONFIG.maxLinesPerCommit * commits);

    return Math.floor(
      commits * XP_CONFIG.xpPerCommit +
      cappedAdded * XP_CONFIG.xpPerLineAdded +
      cappedRemoved * XP_CONFIG.xpPerLineRemoved +
      filesChanged * XP_CONFIG.xpPerFile
    );
  }

  async setCharacterName(name: string): Promise<void> {
    this.state.character.name = name;
    await this.saveState();
  }

  async setCharacterClass(className: CharacterClass): Promise<void> {
    this.state.character.class = className;
    // Recalculate stats for current level using centralized calculation
    this.state.character.stats = calculateStatsForLevel(CLASS_BASE_STATS[className], this.state.character.level);
    await this.saveState();
  }

  async addGold(amount: number): Promise<void> {
    this.state.character.gold += amount;
    await this.saveState();
  }

  async resetState(): Promise<void> {
    this.state = getDefaultState();
    await this.saveState();
  }
}
