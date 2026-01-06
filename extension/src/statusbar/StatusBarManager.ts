import * as vscode from 'vscode';
import { LocalStateManager } from '../services/localStateManager';

/**
 * StatusBarManager handles the GitRPG status bar item
 */
export class StatusBarManager implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;

  constructor(
    private readonly stateManager: LocalStateManager,
    alignment: vscode.StatusBarAlignment = vscode.StatusBarAlignment.Right,
    priority: number = 50
  ) {
    // Create status bar item
    this.statusBarItem = vscode.window.createStatusBarItem(alignment, priority);
    this.statusBarItem.command = 'gitrpg.showDashboard';

    // Initial update
    this.update();
    this.statusBarItem.show();

    // Update when state changes
    this.stateManager.onStateChange(() => {
      this.update();
    });
  }

  /**
   * Update the status bar with current character state
   */
  public update(): void {
    const char = this.stateManager.getCharacter();
    const today = this.stateManager.getTodayStats();
    const xpPercent = Math.round((char.xp / char.xpToNextLevel) * 100);
    const xpBar = this.getProgressBar(xpPercent);

    this.statusBarItem.text = `$(person) Lv.${char.level} ${char.class} ${xpBar} $(zap) ${today.commits}`;
    this.statusBarItem.tooltip = new vscode.MarkdownString(
      `**${char.name}** - Level ${char.level} ${char.class}\n\n` +
      `XP: ${char.xp} / ${char.xpToNextLevel}\n\n` +
      `Gold: ${char.gold}\n\n` +
      `---\n\n` +
      `**Today's Activity:**\n\n` +
      `Commits: ${today.commits}\n\n` +
      `Lines: +${today.linesAdded} / -${today.linesRemoved}\n\n` +
      `XP Earned: +${today.xpEarned}\n\n` +
      `*Click to open dashboard*`
    );
  }

  /**
   * Generate a text-based progress bar
   */
  private getProgressBar(percent: number): string {
    const filled = Math.round(percent / 10);
    const empty = 10 - filled;
    return '[' + '\u2588'.repeat(filled) + '\u2591'.repeat(empty) + ']';
  }

  /**
   * Show the status bar item
   */
  public show(): void {
    this.statusBarItem.show();
  }

  /**
   * Hide the status bar item
   */
  public hide(): void {
    this.statusBarItem.hide();
  }

  /**
   * Dispose of the status bar item
   */
  public dispose(): void {
    this.statusBarItem.dispose();
  }
}
