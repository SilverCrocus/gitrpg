import * as vscode from 'vscode';
import { registerAllCommands, AllServices } from './commands';
import { LocalStateManager } from './services/localStateManager';
import { GitTrackingService } from './services/gitTrackingService';
import { SupabaseClientService } from './services/supabaseClient';
import { ProfileSyncService } from './services/profileSyncService';
import { FriendsService } from './services/friendsService';
import { PvpBattleService } from './services/pvpBattleService';
import { CoopBattleService } from './services/coopBattleService';
import { getBossEmoji } from './services/bossService';
import { QuestService } from './services/questService';
import { WorkerService } from './services/workerService';
import { registerAuthHandler } from './authHandler';
import { DashboardPanel, DashboardServices } from './webview/dashboard/DashboardPanel';

let statusBarItem: vscode.StatusBarItem;
let stateManager: LocalStateManager;
let gitTracker: GitTrackingService;
let supabaseClient: SupabaseClientService;
let profileSync: ProfileSyncService;
let friendsService: FriendsService;
let pvpBattleService: PvpBattleService;
let coopBattleService: CoopBattleService;
let questService: QuestService;
let workerService: WorkerService;

export async function activate(context: vscode.ExtensionContext) {
  console.log('GitRPG extension is now active!');

  // Initialize state manager and git tracker
  stateManager = new LocalStateManager(context);
  gitTracker = new GitTrackingService(stateManager);

  // Initialize social services
  supabaseClient = new SupabaseClientService(context);
  await supabaseClient.initialize();

  profileSync = new ProfileSyncService(supabaseClient, stateManager);
  friendsService = new FriendsService(supabaseClient);
  pvpBattleService = new PvpBattleService(supabaseClient);
  coopBattleService = new CoopBattleService(supabaseClient);
  questService = new QuestService(supabaseClient);
  workerService = new WorkerService(supabaseClient);

  // Register OAuth callback handler
  registerAuthHandler(context, supabaseClient, profileSync);

  // Subscribe to notifications if authenticated
  if (supabaseClient.isAuthenticated()) {
    friendsService.subscribeToNotifications((friend) => {
      vscode.window.showInformationMessage(
        `Friend request from ${friend.displayName}!`,
        'Accept', 'Decline'
      ).then(async (action) => {
        if (action === 'Accept') {
          await friendsService.acceptFriendRequest(friend.id);
          vscode.window.showInformationMessage(`You are now friends with ${friend.displayName}!`);
        } else if (action === 'Decline') {
          await friendsService.declineFriendRequest(friend.id);
        }
      });
    });

    pvpBattleService.subscribeToChallenges((challenge) => {
      vscode.window.showInformationMessage(
        `Battle challenge from ${challenge.challengerName} (Lv.${challenge.challengerLevel})!`,
        'Accept', 'Decline'
      ).then(async (action) => {
        if (action === 'Accept') {
          const result = await pvpBattleService.acceptChallenge(challenge.id);
          if (result) {
            vscode.window.showInformationMessage(
              `Battle complete! ${result.winner.name} wins!`
            );
          }
        } else if (action === 'Decline') {
          await pvpBattleService.declineChallenge(challenge.id);
        }
      });
    });

    // Subscribe to boss challenges
    coopBattleService.subscribeToChallenges((challenge) => {
      vscode.window.showInformationMessage(
        `${getBossEmoji(challenge.bossType)} ${challenge.challengerName} wants to fight ${challenge.bossName} together!`,
        'Join Battle', 'Decline'
      ).then(async (action) => {
        if (action === 'Join Battle') {
          vscode.window.showInformationMessage('Joining boss battle...');
          const battleResult = await coopBattleService.runFullBossBattle(challenge.lobbyId);
          if (battleResult.success) {
            const outcome = battleResult.won ? 'Victory!' : 'Defeat!';
            const rewardText = battleResult.rewards
              ? ` Rewards: ${battleResult.rewards.xp} XP, ${battleResult.rewards.gold} Gold`
              : '';
            vscode.window.showInformationMessage(`Boss Battle ${outcome}${rewardText}`);
            if (battleResult.battleLog && battleResult.battleLog.length > 0) {
              const totalTurns = Math.max(...battleResult.battleLog.map(e => e.turn));
              vscode.window.showInformationMessage(`Battle lasted ${totalTurns} turns!`);
            }
          } else {
            vscode.window.showErrorMessage(battleResult.error || 'Failed to run boss battle');
          }
        }
      });
    });
  }

  // Create status bar item (right side)
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    50
  );
  statusBarItem.command = 'gitrpg.showDashboard';
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Update status bar when state changes and sync profile to cloud
  stateManager.onStateChange(async () => {
    updateStatusBar();
    // Sync profile to cloud when character updates
    if (supabaseClient.isAuthenticated()) {
      await profileSync.syncProfileToCloud();
    }
  });

  // Build dashboard services object
  const dashboardServices: DashboardServices = {
    stateManager,
    supabaseClient,
    questService,
    workerService,
    friendsService,
    pvpBattleService,
    coopBattleService,
    gitTracker,
  };

  // Register commands that show the dashboard panel
  const showDashboardCmd = vscode.commands.registerCommand('gitrpg.showDashboard', () => {
    DashboardPanel.createOrShow(context, dashboardServices, 'dashboard');
  });

  const showCharacterCmd = vscode.commands.registerCommand('gitrpg.showCharacter', () => {
    DashboardPanel.createOrShow(context, dashboardServices, 'character');
  });

  const startBattleCmd = vscode.commands.registerCommand('gitrpg.startBattle', () => {
    DashboardPanel.createOrShow(context, dashboardServices, 'battle');
  });

  // Create AllServices object for command registration
  const allServices: AllServices = {
    stateManager,
    gitTracker,
    supabaseClient,
    profileSync,
    friendsService,
    pvpBattleService,
    coopBattleService,
    questService,
    workerService,
  };

  // Register all modular commands
  const allCommands = registerAllCommands(context, allServices);

  context.subscriptions.push(
    showDashboardCmd,
    showCharacterCmd,
    startBattleCmd,
    ...allCommands
  );

  // Register webview provider for sidebar
  const provider = new GitRPGViewProvider(context.extensionUri, stateManager);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('gitrpg.mainView', provider)
  );

  // Start git tracking
  gitTracker.start();

  // Stop tracking when extension deactivates
  context.subscriptions.push({
    dispose: () => gitTracker.stop()
  });

  // Check for commits when a file is saved
  vscode.workspace.onDidSaveTextDocument(() => {
    // Small delay to let git process the save
    setTimeout(() => {
      gitTracker.checkForNewCommits();
    }, 1000);
  });
}

class GitRPGViewProvider implements vscode.WebviewViewProvider {
  private webviewView?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly stateManager: LocalStateManager
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ) {
    this.webviewView = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')]
    };

    webviewView.webview.html = this.getSidebarContent(webviewView.webview);

    // Update sidebar when state changes
    this.stateManager.onStateChange(() => {
      if (this.webviewView) {
        this.webviewView.webview.html = this.getSidebarContent(this.webviewView.webview);
      }
    });

    // Handle messages from sidebar
    webviewView.webview.onDidReceiveMessage(message => {
      if (message.type === 'command') {
        vscode.commands.executeCommand(message.command);
      }
    });
  }

  private getSidebarContent(webview: vscode.Webview): string {
    const char = this.stateManager.getCharacter();
    const today = this.stateManager.getTodayStats();
    const xpPercent = Math.round((char.xp / char.xpToNextLevel) * 100);

    // Get sprite URI for the character's class
    const classFolder = char.class.toLowerCase();
    const spriteUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'sprites', 'characters', classFolder, 'idle.svg')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:;">
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      padding: 10px;
      margin: 0;
    }
    .stat { margin: 8px 0; }
    .stat-label { font-size: 11px; opacity: 0.7; }
    .stat-value { font-size: 16px; font-weight: bold; }
    .character-preview {
      width: 80px;
      height: 80px;
      margin: 10px auto;
      background: var(--vscode-editor-background);
      border: 2px solid var(--vscode-textLink-foreground);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .character-preview img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .char-name {
      text-align: center;
      font-weight: bold;
      margin: 5px 0;
    }
    .char-class {
      text-align: center;
      font-size: 12px;
      opacity: 0.8;
      margin-bottom: 10px;
    }
    .xp-bar {
      height: 6px;
      background: var(--vscode-progressBar-background);
      border-radius: 3px;
      overflow: hidden;
      margin: 4px 0;
    }
    .xp-bar-fill {
      height: 100%;
      background: var(--vscode-textLink-foreground);
    }
    button {
      width: 100%;
      padding: 8px;
      margin: 4px 0;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      cursor: pointer;
      border-radius: 4px;
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .divider {
      border-top: 1px solid var(--vscode-panel-border);
      margin: 12px 0;
    }
    .today-label {
      font-size: 11px;
      opacity: 0.7;
      margin-bottom: 8px;
    }
  </style>
</head>
<body>
  <div class="character-preview"><img src="${spriteUri}" alt="${char.class}"></div>
  <div class="char-name">${char.name}</div>
  <div class="char-class">Level ${char.level} ${char.class}</div>

  <div class="stat">
    <div class="stat-label">XP</div>
    <div class="xp-bar"><div class="xp-bar-fill" style="width: ${xpPercent}%"></div></div>
    <div class="stat-value">${char.xp} / ${char.xpToNextLevel}</div>
  </div>

  <div class="stat">
    <div class="stat-label">Gold</div>
    <div class="stat-value">💰 ${char.gold}</div>
  </div>

  <div class="divider"></div>

  <div class="today-label">📊 Today</div>
  <div class="stat">
    <div class="stat-label">Commits</div>
    <div class="stat-value">${today.commits}</div>
  </div>
  <div class="stat">
    <div class="stat-label">XP Earned</div>
    <div class="stat-value">+${today.xpEarned}</div>
  </div>

  <div class="divider"></div>

  <button onclick="openDashboard()">📊 Open Dashboard</button>
  <button onclick="checkCommits()">🔄 Check Commits</button>

  <script>
    const vscode = acquireVsCodeApi();

    function openDashboard() {
      vscode.postMessage({ type: 'command', command: 'gitrpg.showDashboard' });
    }

    function checkCommits() {
      vscode.postMessage({ type: 'command', command: 'gitrpg.checkCommits' });
    }
  </script>
</body>
</html>`;
  }
}

function updateStatusBar() {
  const char = stateManager.getCharacter();
  const today = stateManager.getTodayStats();
  const xpPercent = Math.round((char.xp / char.xpToNextLevel) * 100);
  const xpBar = getProgressBar(xpPercent);

  statusBarItem.text = `$(person) Lv.${char.level} ${char.class} ${xpBar} $(zap) ${today.commits}`;
  statusBarItem.tooltip = new vscode.MarkdownString(
    `**${char.name}** - Level ${char.level} ${char.class}\n\n` +
    `XP: ${char.xp} / ${char.xpToNextLevel}\n\n` +
    `Gold: 💰 ${char.gold}\n\n` +
    `---\n\n` +
    `**Today's Activity:**\n\n` +
    `Commits: ${today.commits}\n\n` +
    `Lines: +${today.linesAdded} / -${today.linesRemoved}\n\n` +
    `XP Earned: +${today.xpEarned}\n\n` +
    `*Click to open dashboard*`
  );
}

function getProgressBar(percent: number): string {
  const filled = Math.round(percent / 10);
  const empty = 10 - filled;
  return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
}

export function deactivate() {
  if (statusBarItem) {
    statusBarItem.dispose();
  }
  if (gitTracker) {
    gitTracker.stop();
  }
  // Clean up social service subscriptions
  if (coopBattleService) {
    coopBattleService.unsubscribeFromChallenges();
    coopBattleService.unsubscribeFromBattle();
  }
  if (pvpBattleService) {
    pvpBattleService.unsubscribeFromChallenges();
  }
  if (friendsService) {
    friendsService.unsubscribeFromNotifications();
  }
}
