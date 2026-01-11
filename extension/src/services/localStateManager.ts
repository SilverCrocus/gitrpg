import * as vscode from 'vscode';
import { WorkerService } from './workerService';

export interface CharacterData {
  name: string;
  class: 'Warrior' | 'Mage' | 'Rogue' | 'Archer';
  level: number;
  xp: number;
  xpToNextLevel: number;
  gold: number;
  stats: {
    maxHp: number;
    attack: number;
    defense: number;
    speed: number;
    critChance: number;
    critDamage: number;
  };
}

export interface TodayStats {
  date: string; // YYYY-MM-DD
  commits: number;
  linesAdded: number;
  linesRemoved: number;
  filesChanged: number;
  xpEarned: number;
}

export interface TrackingState {
  lastCheckedAt: string; // ISO date
  processedCommitHashes: string[]; // Prevent double-counting
}

export interface LocalGameState {
  character: CharacterData;
  todayStats: TodayStats;
  tracking: TrackingState;
  gitEmail: string | null;
}

const STATE_KEY = 'gitrpg.gameState';

// XP required for each level (increases by 50% each level)
function xpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.5, level - 1));
}

// Base stats by class
const CLASS_BASE_STATS: Record<string, CharacterData['stats']> = {
  Warrior: { maxHp: 120, attack: 15, defense: 12, speed: 8, critChance: 0.1, critDamage: 1.5 },
  Mage: { maxHp: 80, attack: 18, defense: 6, speed: 10, critChance: 0.15, critDamage: 1.8 },
  Rogue: { maxHp: 90, attack: 14, defense: 8, speed: 15, critChance: 0.25, critDamage: 2.0 },
  Archer: { maxHp: 85, attack: 16, defense: 7, speed: 12, critChance: 0.2, critDamage: 1.7 },
};

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

  onStateChange(callback: (state: LocalGameState) => void): void {
    this.onStateChangeCallbacks.push(callback);
  }

  getState(): LocalGameState {
    return { ...this.state };
  }

  getCharacter(): CharacterData {
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

  async addActivity(commits: number, linesAdded: number, linesRemoved: number, filesChanged: number): Promise<{ xpEarned: number; leveledUp: boolean; newLevel: number }> {
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
      this.state.character.gold += 50 * this.state.character.level; // Gold reward on level up
      leveledUp = true;

      // Increase stats on level up
      const classStats = CLASS_BASE_STATS[this.state.character.class];
      this.state.character.stats.maxHp = Math.floor(classStats.maxHp * (1 + (this.state.character.level - 1) * 0.1));
      this.state.character.stats.attack = Math.floor(classStats.attack * (1 + (this.state.character.level - 1) * 0.08));
      this.state.character.stats.defense = Math.floor(classStats.defense * (1 + (this.state.character.level - 1) * 0.08));
    }

    await this.saveState();

    return {
      xpEarned,
      leveledUp,
      newLevel: this.state.character.level
    };
  }

  private calculateXp(commits: number, linesAdded: number, linesRemoved: number, filesChanged: number): number {
    const XP_PER_COMMIT = 10;
    const XP_PER_LINE_ADDED = 0.5;
    const XP_PER_LINE_REMOVED = 0.25;
    const XP_PER_FILE = 2;
    const MAX_LINES_PER_COMMIT = 500; // Cap to prevent gaming

    // Cap lines
    const cappedAdded = Math.min(linesAdded, MAX_LINES_PER_COMMIT * commits);
    const cappedRemoved = Math.min(linesRemoved, MAX_LINES_PER_COMMIT * commits);

    return Math.floor((
      commits * XP_PER_COMMIT +
      cappedAdded * XP_PER_LINE_ADDED +
      cappedRemoved * XP_PER_LINE_REMOVED +
      filesChanged * XP_PER_FILE
    ) * (1 + new WorkerService().getTotalGoldPerHour() / 100));
  }

  async setCharacterName(name: string): Promise<void> {
    this.state.character.name = name;
    await this.saveState();
  }

  async setCharacterClass(className: 'Warrior' | 'Mage' | 'Rogue' | 'Archer'): Promise<void> {
    this.state.character.class = className;
    this.state.character.stats = { ...CLASS_BASE_STATS[className] };
    // Recalculate stats for current level
    this.state.character.stats.maxHp = Math.floor(CLASS_BASE_STATS[className].maxHp * (1 + (this.state.character.level - 1) * 0.1));
    this.state.character.stats.attack = Math.floor(CLASS_BASE_STATS[className].attack * (1 + (this.state.character.level - 1) * 0.08));
    this.state.character.stats.defense = Math.floor(CLASS_BASE_STATS[className].defense * (1 + (this.state.character.level - 1) * 0.08));
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
