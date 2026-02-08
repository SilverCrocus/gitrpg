import * as vscode from 'vscode';
import { buildWebviewHtml } from '../webviewUtils';
import { LocalStateManager } from '../../services/localStateManager';
import { SupabaseClientService } from '../../services/supabaseClient';
import { QuestService } from '../../services/questService';
import { WorkerService } from '../../services/workerService';
import { FriendsService } from '../../services/friendsService';
import { PvpBattleService } from '../../services/pvpBattleService';
import { CoopBattleService } from '../../services/coopBattleService';
import { GitTrackingService } from '../../services/gitTrackingService';
import { showBattlePanel, BattleData } from '../../commands/battleCommand';
import type { CharacterClass } from '../../types';

/**
 * Services required by the DashboardPanel
 */
export interface DashboardServices {
  stateManager: LocalStateManager;
  supabaseClient: SupabaseClientService;
  questService: QuestService;
  workerService: WorkerService;
  friendsService: FriendsService;
  pvpBattleService: PvpBattleService;
  coopBattleService: CoopBattleService;
  gitTracker: GitTrackingService;
}

/**
 * DashboardPanel manages the main GitRPG dashboard webview
 */
export class DashboardPanel {
  public static currentPanel: DashboardPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly services: DashboardServices;
  private disposables: vscode.Disposable[] = [];
  private unsubscribeFromState: (() => void) | null = null;
  private sendStateDebounceTimer: NodeJS.Timeout | null = null;
  private cachedQuests: any[] = [];
  private cachedWorkerSummary: any = { workerCount: 0, totalGoldPerHour: 0, pendingGold: 0, nextWorkerCost: 100 };
  private cachedIsAuthenticated: boolean = false;

  /**
   * Creates or shows the dashboard panel
   */
  public static createOrShow(
    context: vscode.ExtensionContext,
    services: DashboardServices,
    initialView: string = 'dashboard'
  ): DashboardPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : vscode.ViewColumn.One;

    // If panel already exists, reveal it
    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel.panel.reveal(column);
      DashboardPanel.currentPanel.panel.webview.postMessage({ type: 'navigate', view: initialView });
      DashboardPanel.currentPanel.sendStateToWebview();
      return DashboardPanel.currentPanel;
    }

    // Create a new panel
    const panel = vscode.window.createWebviewPanel(
      'gitrpg',
      'GitRPG',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
      }
    );

    DashboardPanel.currentPanel = new DashboardPanel(panel, context.extensionUri, services, context, initialView);
    return DashboardPanel.currentPanel;
  }

  /**
   * Private constructor - use createOrShow instead
   */
  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    services: DashboardServices,
    context: vscode.ExtensionContext,
    initialView: string = 'dashboard'
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.services = services;

    // Set the webview's initial HTML content
    this.panel.webview.html = this.getHtml();

    // Send initial state
    this.sendStateToWebview();

    // Navigate to initial view after state is loaded
    if (initialView !== 'dashboard') {
      this.panel.webview.postMessage({ type: 'navigate', view: initialView });
    }

    // Handle panel disposal
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Update webview when state changes (debounced to avoid excessive network requests)
    this.unsubscribeFromState = services.stateManager.onStateChange(() => {
      this.debouncedSendStateToWebview();
    });

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      message => this.handleMessage(message, context),
      null,
      this.disposables
    );
  }

  /**
   * Debounced version of sendStateToWebview to avoid excessive network requests.
   * Sends local state immediately (cheap) and debounces the full network refresh.
   */
  private debouncedSendStateToWebview(): void {
    if (this.sendStateDebounceTimer) {
      clearTimeout(this.sendStateDebounceTimer);
    }

    // Send local state immediately with cached network data (no flicker)
    const character = this.services.stateManager.getCharacter();
    const todayStats = this.services.stateManager.getTodayStats();
    this.panel.webview.postMessage({
      type: 'stateUpdate',
      character,
      todayStats,
      quests: this.cachedQuests,
      workerSummary: this.cachedWorkerSummary,
      isAuthenticated: this.cachedIsAuthenticated,
    });

    // Debounce the full network refresh
    this.sendStateDebounceTimer = setTimeout(() => {
      this.sendStateToWebview();
    }, 5000);
  }

  /**
   * Send current state to the webview
   */
  public async sendStateToWebview(): Promise<void> {
    const { stateManager, supabaseClient, questService, workerService, friendsService, pvpBattleService, coopBattleService } = this.services;

    const character = stateManager.getCharacter();
    const todayStats = stateManager.getTodayStats();

    // Fetch quests, workers, and pending requests if authenticated
    let quests: any[] = [];
    let workerSummary = { workerCount: 0, totalGoldPerHour: 0, pendingGold: 0, nextWorkerCost: 100 };
    let pendingFriendRequests: any[] = [];
    let pendingPvpChallenges: any[] = [];
    let pendingBossInvites: any[] = [];

    const isAuthenticated = supabaseClient.isAuthenticated();
    if (isAuthenticated) {
      try {
        quests = await questService.refreshDailyQuestsIfNeeded();
        workerSummary = await workerService.getWorkerSummary();

        // Get pending friend requests (where we are the addressee, not the requester)
        const friends = await friendsService.getFriends();
        pendingFriendRequests = friends.filter(f => f.status === 'pending' && !f.isRequester);

        // Get pending PvP challenges
        pendingPvpChallenges = await pvpBattleService.getPendingChallenges();

        // Get pending boss invites
        pendingBossInvites = await coopBattleService.getPendingBossInvites();
      } catch (err) {
        console.error('Error fetching data:', err);
      }
    }

    // Cache network data for use in debounced immediate messages
    this.cachedQuests = quests;
    this.cachedWorkerSummary = workerSummary;
    this.cachedIsAuthenticated = isAuthenticated;

    this.panel.webview.postMessage({
      type: 'stateUpdate',
      character,
      todayStats,
      quests,
      workerSummary,
      pendingFriendRequests,
      pendingPvpChallenges,
      pendingBossInvites,
      isAuthenticated
    });
  }

  /**
   * Update state with specific data (for incremental updates)
   */
  public updateState(data: Record<string, unknown>): void {
    this.panel.webview.postMessage({ type: 'stateUpdate', ...data });
  }

  /**
   * Get the HTML content for the webview
   */
  private getHtml(): string {
    return buildWebviewHtml({
      webview: this.panel.webview,
      extensionUri: this.extensionUri,
      templatePath: 'dashboard/template.html',
      stylesPath: 'dashboard/styles.css',
      scriptPath: 'dashboard/script.js',
      data: this.getInitialData(),
      title: 'GitRPG'
    });
  }

  /**
   * Get initial data to inject into the webview
   */
  private getInitialData(): Record<string, unknown> {
    const { stateManager } = this.services;
    const char = stateManager.getCharacter();
    const today = stateManager.getTodayStats();

    // Get all class sprite URIs for class change
    const spriteUris: Record<string, string> = {};
    ['warrior', 'mage', 'rogue', 'archer'].forEach(cls => {
      spriteUris[cls] = this.panel.webview.asWebviewUri(
        vscode.Uri.joinPath(this.extensionUri, 'media', 'sprites', 'characters', cls, 'idle.svg')
      ).toString();
    });

    return {
      character: char,
      todayStats: today,
      spriteUris
    };
  }

  /**
   * Handle messages from the webview
   */
  private async handleMessage(message: any, context: vscode.ExtensionContext): Promise<void> {
    const { stateManager, gitTracker, supabaseClient, questService, friendsService, pvpBattleService, coopBattleService } = this.services;

    switch (message.type) {
      case 'alert':
        vscode.window.showInformationMessage(message.text);
        break;

      case 'error':
        vscode.window.showErrorMessage(message.text);
        break;

      case 'checkCommits':
        await gitTracker.forceCheck();
        vscode.window.showInformationMessage('Commits checked!');
        break;

      case 'requestNameChange': {
        const name = await vscode.window.showInputBox({
          prompt: 'Enter your character name',
          value: stateManager.getCharacter().name
        });
        if (name) {
          await stateManager.setCharacterName(name);
          vscode.window.showInformationMessage(`Character renamed to ${name}!`);
        }
        break;
      }

      case 'requestClassChange': {
        const classes = ['Warrior', 'Mage', 'Rogue', 'Archer'];
        const selected = await vscode.window.showQuickPick(classes, {
          placeHolder: 'Choose your class'
        });
        if (selected) {
          await stateManager.setCharacterClass(selected as any);
          vscode.window.showInformationMessage(`Class changed to ${selected}!`);
        }
        break;
      }

      case 'setName':
        await stateManager.setCharacterName(message.name);
        break;

      case 'setClass':
        await stateManager.setCharacterClass(message.class);
        break;

      case 'showQuests':
        vscode.commands.executeCommand('gitrpg.showQuests');
        break;

      case 'manageWorkers':
        vscode.commands.executeCommand('gitrpg.showWorkers');
        break;

      case 'collectGold':
        vscode.commands.executeCommand('gitrpg.collectGold');
        break;

      case 'claimQuest': {
        const rewards = await questService.claimQuestReward(message.questId);
        if (rewards) {
          vscode.window.showInformationMessage(`Claimed ${rewards.xp} XP and ${rewards.gold} Gold!`);
          await this.sendStateToWebview();
        }
        break;
      }

      case 'acceptFriend': {
        const accepted = await friendsService.acceptFriendRequest(message.friendId);
        if (accepted) {
          vscode.window.showInformationMessage('Friend request accepted!');
          await this.sendStateToWebview();
        }
        break;
      }

      case 'declineFriend': {
        await friendsService.declineFriendRequest(message.friendId);
        vscode.window.showInformationMessage('Friend request declined.');
        await this.sendStateToWebview();
        break;
      }

      case 'acceptPvp': {
        const result = await pvpBattleService.acceptChallenge(message.battleId);
        if (result) {
          // Determine fighter order from battle actions
          const firstActorId = result.actions[0]?.actorId;
          const f1 = firstActorId === result.winner.id ? result.winner : result.loser;
          const f2 = firstActorId === result.winner.id ? result.loser : result.winner;

          const battleData: BattleData = {
            fighter1: {
              id: f1.id,
              name: f1.name,
              class: f1.class as CharacterClass,
              level: f1.level,
              maxHp: f1.stats.maxHp,
            },
            fighter2: {
              id: f2.id,
              name: f2.name,
              class: f2.class as CharacterClass,
              level: f2.level,
              maxHp: f2.stats.maxHp,
            },
            actions: result.actions,
            winnerId: result.winner.id,
            rewards: result.rewards,
          };
          await showBattlePanel(context, battleData);
          await this.sendStateToWebview();
        }
        break;
      }

      case 'declinePvp': {
        await pvpBattleService.declineChallenge(message.battleId);
        vscode.window.showInformationMessage('PvP challenge declined.');
        await this.sendStateToWebview();
        break;
      }

      case 'joinBoss': {
        vscode.window.showInformationMessage('Joining boss battle...');
        const battleResult = await coopBattleService.runFullBossBattle(message.lobbyId);
        if (battleResult.success) {
          const outcome = battleResult.won ? 'Victory!' : 'Defeat!';
          const rewardText = battleResult.rewards
            ? ` Rewards: ${battleResult.rewards.xp} XP, ${battleResult.rewards.gold} Gold`
            : '';
          vscode.window.showInformationMessage(`Boss Battle ${outcome}${rewardText}`);
          // Show battle summary
          if (battleResult.battleLog && battleResult.battleLog.length > 0) {
            const totalTurns = Math.max(...battleResult.battleLog.map(e => e.turn));
            vscode.window.showInformationMessage(`Battle lasted ${totalTurns} turns!`);
          }
        } else {
          vscode.window.showErrorMessage(battleResult.error || 'Failed to run boss battle');
        }
        await this.sendStateToWebview();
        break;
      }

      case 'declineBoss': {
        const result = await coopBattleService.declineBossInvite(message.lobbyId);
        if (!result.success) {
          vscode.window.showErrorMessage(result.error || 'Failed to decline boss invite');
        } else {
          vscode.window.showInformationMessage('Boss raid declined.');
        }
        await this.sendStateToWebview();
        break;
      }
    }
  }

  /**
   * Dispose of the panel and clean up resources
   */
  public dispose(): void {
    if (this.unsubscribeFromState) {
      this.unsubscribeFromState();
    }

    if (this.sendStateDebounceTimer) {
      clearTimeout(this.sendStateDebounceTimer);
    }

    DashboardPanel.currentPanel = undefined;

    // Clean up resources
    this.panel.dispose();

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
