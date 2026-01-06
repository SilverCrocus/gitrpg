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
import { SidebarProvider } from './webview/sidebar/SidebarProvider';
import { StatusBarManager } from './statusbar/StatusBarManager';

let statusBarManager: StatusBarManager;
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

  // Create status bar manager (auto-updates on state changes)
  statusBarManager = new StatusBarManager(stateManager);
  context.subscriptions.push(statusBarManager);

  // Sync profile to cloud when character updates
  stateManager.onStateChange(async () => {
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
  const sidebarProvider = new SidebarProvider(context.extensionUri, stateManager);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('gitrpg.mainView', sidebarProvider)
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


export function deactivate() {
  if (statusBarManager) {
    statusBarManager.dispose();
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
