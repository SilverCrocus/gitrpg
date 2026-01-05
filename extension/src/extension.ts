import * as vscode from 'vscode';
import { registerBattleCommand } from './commands/battleCommand';
import { LocalStateManager, CharacterData, TodayStats } from './services/localStateManager';
import { GitTrackingService } from './services/gitTrackingService';
import { SupabaseClientService } from './services/supabaseClient';
import { ProfileSyncService } from './services/profileSyncService';
import { FriendsService } from './services/friendsService';
import { PvpBattleService } from './services/pvpBattleService';
import { CoopBattleService } from './services/coopBattleService';
import { BOSS_DEFINITIONS, getBossEmoji } from './services/bossService';
import { QuestService } from './services/questService';
import { WorkerService } from './services/workerService';
import { registerAuthHandler } from './authHandler';

let mainPanel: vscode.WebviewPanel | undefined;
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

  // Register commands
  const showDashboardCmd = vscode.commands.registerCommand('gitrpg.showDashboard', () => {
    showMainPanel(context, 'dashboard');
  });

  const showCharacterCmd = vscode.commands.registerCommand('gitrpg.showCharacter', () => {
    showMainPanel(context, 'character');
  });

  const startBattleCmd = vscode.commands.registerCommand('gitrpg.startBattle', () => {
    showMainPanel(context, 'battle');
  });

  // Register battle command
  const showBattleCmd = registerBattleCommand(context);

  // New commands for git tracking
  const checkCommitsCmd = vscode.commands.registerCommand('gitrpg.checkCommits', async () => {
    vscode.window.showInformationMessage('Checking for new commits...');
    await gitTracker.forceCheck();
  });

  const showLogCmd = vscode.commands.registerCommand('gitrpg.showLog', () => {
    gitTracker.showLog();
  });

  const setNameCmd = vscode.commands.registerCommand('gitrpg.setName', async () => {
    const name = await vscode.window.showInputBox({
      prompt: 'Enter your character name',
      value: stateManager.getCharacter().name
    });
    if (name) {
      await stateManager.setCharacterName(name);
      vscode.window.showInformationMessage(`Character renamed to ${name}!`);
    }
  });

  const setClassCmd = vscode.commands.registerCommand('gitrpg.setClass', async () => {
    const classes = ['Warrior', 'Mage', 'Rogue', 'Archer'];
    const selected = await vscode.window.showQuickPick(classes, {
      placeHolder: 'Choose your class'
    });
    if (selected) {
      await stateManager.setCharacterClass(selected as any);
      vscode.window.showInformationMessage(`Class changed to ${selected}!`);
    }
  });

  const resetCmd = vscode.commands.registerCommand('gitrpg.reset', async () => {
    const confirm = await vscode.window.showWarningMessage(
      'Are you sure you want to reset all progress?',
      { modal: true },
      'Yes, Reset'
    );
    if (confirm === 'Yes, Reset') {
      await stateManager.resetState();
      vscode.window.showInformationMessage('Progress reset!');
    }
  });

  const showStatsCmd = vscode.commands.registerCommand('gitrpg.showStats', () => {
    const char = stateManager.getCharacter();
    const today = stateManager.getTodayStats();

    vscode.window.showInformationMessage(
      `${char.name} - Level ${char.level} ${char.class}\n` +
      `XP: ${char.xp}/${char.xpToNextLevel} | Gold: ${char.gold}\n` +
      `Today: ${today.commits} commits, +${today.xpEarned} XP`
    );
  });

  // Social commands
  const connectAccountCmd = vscode.commands.registerCommand('gitrpg.connectAccount', async () => {
    if (supabaseClient.isAuthenticated()) {
      const profile = await profileSync.getMyProfile();
      vscode.window.showInformationMessage(
        `Already connected! Friend code: ${profile?.friend_code || 'Unknown'}`,
        'Copy Code'
      ).then(async (action) => {
        if (action === 'Copy Code' && profile?.friend_code) {
          await vscode.env.clipboard.writeText(profile.friend_code);
          vscode.window.showInformationMessage('Friend code copied!');
        }
      });
      return;
    }

    const authResult = await supabaseClient.signInWithGitHub();
    if (authResult?.url) {
      vscode.env.openExternal(vscode.Uri.parse(authResult.url));
      vscode.window.showInformationMessage('Opening GitHub login in browser...');
    } else {
      vscode.window.showErrorMessage('Failed to start authentication. Please try again.');
    }
  });

  const showFriendsCmd = vscode.commands.registerCommand('gitrpg.showFriends', async () => {
    if (!supabaseClient.isAuthenticated()) {
      vscode.window.showWarningMessage('Connect your account first!', 'Connect').then((action) => {
        if (action === 'Connect') {
          vscode.commands.executeCommand('gitrpg.connectAccount');
        }
      });
      return;
    }

    const friends = await friendsService.getFriends();
    const accepted = friends.filter(f => f.status === 'accepted');
    const pending = friends.filter(f => f.status === 'pending' && !f.isRequester);

    if (friends.length === 0) {
      vscode.window.showInformationMessage('No friends yet! Add friends with their friend code.');
      return;
    }

    const items = [
      ...accepted.map(f => ({
        label: `$(person) ${f.displayName}`,
        description: `Lv.${f.level} ${f.characterClass}`,
        detail: f.friendCode,
        friend: f,
      })),
      ...pending.map(f => ({
        label: `$(mail) ${f.displayName} (pending)`,
        description: `Lv.${f.level} ${f.characterClass}`,
        detail: 'Click to accept/decline',
        friend: f,
      })),
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Your friends'
    });

    if (selected) {
      if (selected.friend.status === 'pending') {
        const action = await vscode.window.showQuickPick(['Accept', 'Decline'], {
          placeHolder: `Friend request from ${selected.friend.displayName}`
        });
        if (action === 'Accept') {
          await friendsService.acceptFriendRequest(selected.friend.id);
          vscode.window.showInformationMessage(`You are now friends with ${selected.friend.displayName}!`);
        } else if (action === 'Decline') {
          await friendsService.declineFriendRequest(selected.friend.id);
        }
      } else {
        const action = await vscode.window.showQuickPick(['Challenge to Battle', 'Remove Friend'], {
          placeHolder: selected.friend.displayName
        });
        if (action === 'Challenge to Battle') {
          const result = await pvpBattleService.challengeFriend(selected.friend.id);
          if (result.success) {
            vscode.window.showInformationMessage(`Challenge sent to ${selected.friend.displayName}!`);
          } else {
            vscode.window.showErrorMessage(result.error || 'Failed to send challenge');
          }
        } else if (action === 'Remove Friend') {
          await friendsService.removeFriend(selected.friend.id);
          vscode.window.showInformationMessage(`Removed ${selected.friend.displayName} from friends`);
        }
      }
    }
  });

  const addFriendCmd = vscode.commands.registerCommand('gitrpg.addFriend', async () => {
    if (!supabaseClient.isAuthenticated()) {
      vscode.window.showWarningMessage('Connect your account first!');
      return;
    }

    const friendCode = await vscode.window.showInputBox({
      prompt: 'Enter friend code',
      placeHolder: 'GRPG-XXXX-XXXX'
    });

    if (friendCode) {
      const result = await friendsService.sendFriendRequest(friendCode);
      if (result.success) {
        vscode.window.showInformationMessage('Friend request sent!');
      } else {
        vscode.window.showErrorMessage(result.error || 'Failed to send request');
      }
    }
  });

  const showFriendCodeCmd = vscode.commands.registerCommand('gitrpg.showFriendCode', async () => {
    if (!supabaseClient.isAuthenticated()) {
      vscode.window.showWarningMessage('Connect your account first!');
      return;
    }

    const code = await profileSync.getMyFriendCode();
    if (code) {
      const action = await vscode.window.showInformationMessage(
        `Your friend code: ${code}`,
        'Copy to Clipboard'
      );
      if (action === 'Copy to Clipboard') {
        await vscode.env.clipboard.writeText(code);
        vscode.window.showInformationMessage('Friend code copied!');
      }
    }
  });

  const viewDailyBossCmd = vscode.commands.registerCommand('gitrpg.viewDailyBoss', async () => {
    if (!supabaseClient.isAuthenticated()) {
      vscode.window.showWarningMessage('Connect your account first!');
      return;
    }

    const bossType = await coopBattleService.getDailyBoss();
    const boss = BOSS_DEFINITIONS[bossType];
    const canFight = await coopBattleService.canFightBoss();

    vscode.window.showInformationMessage(
      `${getBossEmoji(bossType)} Today's Boss: ${boss.name}\n` +
      `HP: ${boss.baseHp} | ATK: ${boss.baseAttack} | DEF: ${boss.baseDefense}\n` +
      `${canFight ? 'You can fight!' : 'Already defeated today'}`,
      canFight ? 'Challenge with Friend' : 'OK'
    ).then(action => {
      if (action === 'Challenge with Friend') {
        vscode.commands.executeCommand('gitrpg.challengeBoss');
      }
    });
  });

  const challengeBossCmd = vscode.commands.registerCommand('gitrpg.challengeBoss', async () => {
    if (!supabaseClient.isAuthenticated()) {
      vscode.window.showWarningMessage('Connect your account first!');
      return;
    }

    const canFight = await coopBattleService.canFightBoss();
    if (!canFight) {
      vscode.window.showWarningMessage('You already defeated today\'s boss!');
      return;
    }

    const friends = await friendsService.getFriends();
    const acceptedFriends = friends.filter(f => f.status === 'accepted');

    if (acceptedFriends.length === 0) {
      vscode.window.showWarningMessage('Add some friends first to challenge the boss together!');
      return;
    }

    const items = acceptedFriends.map(f => ({
      label: `$(person) ${f.displayName}`,
      description: `Lv.${f.level} ${f.characterClass}`,
      friend: f
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a friend to challenge the boss with'
    });

    if (selected) {
      const result = await coopBattleService.createBossLobby(selected.friend.id);
      if (result.success) {
        vscode.window.showInformationMessage(
          `Boss challenge sent to ${selected.friend.displayName}! Waiting for them to join...`
        );
        // TODO: Open boss battle webview
      } else {
        vscode.window.showErrorMessage(result.error || 'Failed to create boss lobby');
      }
    }
  });

  // Quest commands
  const showQuestsCmd = vscode.commands.registerCommand('gitrpg.showQuests', async () => {
    if (!supabaseClient.isAuthenticated()) {
      vscode.window.showWarningMessage('Connect your account first to see quests!', 'Connect').then((action) => {
        if (action === 'Connect') {
          vscode.commands.executeCommand('gitrpg.connectAccount');
        }
      });
      return;
    }

    // Refresh daily quests if needed
    const quests = await questService.refreshDailyQuestsIfNeeded();

    if (quests.length === 0) {
      vscode.window.showInformationMessage('No active quests. Check back tomorrow for new daily quests!');
      return;
    }

    const items = quests.map(q => ({
      label: `${q.status === 'completed' ? '✅' : '📋'} ${q.title}`,
      description: `${q.requirement_current}/${q.requirement_target} - ${q.reward_xp} XP, ${q.reward_gold} Gold`,
      detail: q.description,
      quest: q
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Your Daily Quests'
    });

    if (selected && selected.quest.status === 'completed') {
      const claim = await vscode.window.showQuickPick(['Claim Reward', 'Cancel'], {
        placeHolder: `Claim ${selected.quest.reward_xp} XP and ${selected.quest.reward_gold} Gold?`
      });

      if (claim === 'Claim Reward') {
        const rewards = await questService.claimQuestReward(selected.quest.id);
        if (rewards) {
          vscode.window.showInformationMessage(`Claimed ${rewards.xp} XP and ${rewards.gold} Gold!`);
        }
      }
    }
  });

  // Worker commands
  const showWorkersCmd = vscode.commands.registerCommand('gitrpg.showWorkers', async () => {
    if (!supabaseClient.isAuthenticated()) {
      vscode.window.showWarningMessage('Connect your account first to manage workers!', 'Connect').then((action) => {
        if (action === 'Connect') {
          vscode.commands.executeCommand('gitrpg.connectAccount');
        }
      });
      return;
    }

    const summary = await workerService.getWorkerSummary();
    const workers = await workerService.getWorkers();

    const options = [
      `📊 Summary: ${summary.workerCount} workers, ${summary.totalGoldPerHour}/hr, ${summary.pendingGold} pending`,
      `💰 Collect Gold (${summary.pendingGold} gold)`,
      `🛒 Buy Worker (${summary.nextWorkerCost} gold)`,
      ...workers.map((w, i) => `⚙️ Worker ${i + 1} - Lv.${w.level} (${w.gold_per_hour}/hr) [Upgrade: ${workerService.calculateUpgradeCost(w.level)} gold]`)
    ];

    const selected = await vscode.window.showQuickPick(options, {
      placeHolder: 'Worker Management'
    });

    if (selected?.startsWith('💰 Collect')) {
      const result = await workerService.collectAllGold();
      if (result.success) {
        vscode.window.showInformationMessage(`Collected ${result.goldCollected} gold!`);
      } else {
        vscode.window.showErrorMessage(result.error || 'Failed to collect gold');
      }
    } else if (selected?.startsWith('🛒 Buy')) {
      const result = await workerService.purchaseWorker();
      if (result.success) {
        vscode.window.showInformationMessage('Worker purchased!');
      } else {
        vscode.window.showErrorMessage(result.error || 'Failed to purchase worker');
      }
    } else if (selected?.startsWith('⚙️ Worker')) {
      const workerIndex = parseInt(selected.split(' ')[1]) - 1;
      const worker = workers[workerIndex];
      if (worker) {
        const upgradeCost = workerService.calculateUpgradeCost(worker.level);
        const action = await vscode.window.showQuickPick([`Upgrade (${upgradeCost} gold)`, 'Cancel'], {
          placeHolder: `Worker ${workerIndex + 1} - Level ${worker.level}`
        });

        if (action?.startsWith('Upgrade')) {
          const result = await workerService.upgradeWorker(worker.id);
          if (result.success) {
            vscode.window.showInformationMessage(`Worker upgraded to level ${result.worker?.level}!`);
          } else {
            vscode.window.showErrorMessage(result.error || 'Failed to upgrade worker');
          }
        }
      }
    }
  });

  const collectGoldCmd = vscode.commands.registerCommand('gitrpg.collectGold', async () => {
    if (!supabaseClient.isAuthenticated()) {
      vscode.window.showWarningMessage('Connect your account first!');
      return;
    }

    const result = await workerService.collectAllGold();
    if (result.success) {
      vscode.window.showInformationMessage(`Collected ${result.goldCollected} gold from workers!`);
    } else {
      vscode.window.showErrorMessage(result.error || 'Failed to collect gold');
    }
  });

  context.subscriptions.push(
    showDashboardCmd,
    showCharacterCmd,
    startBattleCmd,
    showBattleCmd,
    checkCommitsCmd,
    showLogCmd,
    setNameCmd,
    setClassCmd,
    resetCmd,
    showStatsCmd,
    connectAccountCmd,
    showFriendsCmd,
    addFriendCmd,
    showFriendCodeCmd,
    viewDailyBossCmd,
    challengeBossCmd,
    showQuestsCmd,
    showWorkersCmd,
    collectGoldCmd
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

function showMainPanel(context: vscode.ExtensionContext, view: string) {
  if (mainPanel) {
    mainPanel.reveal();
    mainPanel.webview.postMessage({ type: 'navigate', view });
    sendStateToWebview(mainPanel);
    return;
  }

  mainPanel = vscode.window.createWebviewPanel(
    'gitrpg',
    'GitRPG',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
    }
  );

  mainPanel.webview.html = getWebviewContent(mainPanel.webview, context.extensionUri, view);

  mainPanel.onDidDispose(() => {
    mainPanel = undefined;
  });

  // Send initial state
  sendStateToWebview(mainPanel);

  // Update webview when state changes
  stateManager.onStateChange(() => {
    if (mainPanel) {
      sendStateToWebview(mainPanel);
    }
  });

  // Handle messages from webview
  mainPanel.webview.onDidReceiveMessage(
    async message => {
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
            if (mainPanel) {
              await sendStateToWebview(mainPanel);
            }
          }
          break;
        }
        case 'acceptFriend': {
          const accepted = await friendsService.acceptFriendRequest(message.friendId);
          if (accepted) {
            vscode.window.showInformationMessage('Friend request accepted!');
            if (mainPanel) {
              await sendStateToWebview(mainPanel);
            }
          }
          break;
        }
        case 'declineFriend': {
          await friendsService.declineFriendRequest(message.friendId);
          vscode.window.showInformationMessage('Friend request declined.');
          if (mainPanel) {
            await sendStateToWebview(mainPanel);
          }
          break;
        }
        case 'acceptPvp': {
          const result = await pvpBattleService.acceptChallenge(message.battleId);
          if (result) {
            const resultText = result.winner.name === stateManager.getCharacter().name ? 'You won!' : 'You lost!';
            vscode.window.showInformationMessage(`Battle complete! ${resultText} Winner: ${result.winner.name}`);
            if (mainPanel) {
              await sendStateToWebview(mainPanel);
            }
          }
          break;
        }
        case 'declinePvp': {
          await pvpBattleService.declineChallenge(message.battleId);
          vscode.window.showInformationMessage('PvP challenge declined.');
          if (mainPanel) {
            await sendStateToWebview(mainPanel);
          }
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
          if (mainPanel) {
            await sendStateToWebview(mainPanel);
          }
          break;
        }
        case 'declineBoss': {
          // Mark the lobby as abandoned
          const client = supabaseClient.getClient();
          await client
            .from('boss_battles')
            .update({ status: 'abandoned' })
            .eq('id', message.lobbyId);
          vscode.window.showInformationMessage('Boss raid declined.');
          if (mainPanel) {
            await sendStateToWebview(mainPanel);
          }
          break;
        }
      }
    },
    undefined,
    context.subscriptions
  );
}

async function sendStateToWebview(panel: vscode.WebviewPanel): Promise<void> {
  const character = stateManager.getCharacter();
  const todayStats = stateManager.getTodayStats();

  // Fetch quests, workers, and pending requests if authenticated
  let quests: any[] = [];
  let workerSummary = { workerCount: 0, totalGoldPerHour: 0, pendingGold: 0, nextWorkerCost: 100 };
  let pendingFriendRequests: any[] = [];
  let pendingPvpChallenges: any[] = [];
  let pendingBossInvites: any[] = [];

  if (supabaseClient.isAuthenticated()) {
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

  panel.webview.postMessage({
    type: 'stateUpdate',
    character,
    todayStats,
    quests,
    workerSummary,
    pendingFriendRequests,
    pendingPvpChallenges,
    pendingBossInvites,
    isAuthenticated: supabaseClient.isAuthenticated()
  });
}

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri, initialView: string): string {
  const char = stateManager.getCharacter();
  const today = stateManager.getTodayStats();

  // Get sprite URI for the character's class
  const classFolder = char.class.toLowerCase();
  const spriteUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'sprites', 'characters', classFolder, 'idle.svg')
  );

  // Get all class sprite URIs for class change
  const spriteUris: Record<string, string> = {};
  ['warrior', 'mage', 'rogue', 'archer'].forEach(cls => {
    spriteUris[cls] = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'media', 'sprites', 'characters', cls, 'idle.svg')
    ).toString();
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:;">
  <title>GitRPG</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 20px;
      margin: 0;
    }
    h1 {
      color: var(--vscode-textLink-foreground);
      margin-bottom: 5px;
    }
    h2 {
      color: var(--vscode-textLink-activeForeground);
      font-size: 16px;
      margin-top: 20px;
      margin-bottom: 10px;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 5px;
    }
    .container { max-width: 600px; margin: 0 auto; }
    .subtitle {
      color: var(--vscode-descriptionForeground);
      margin-bottom: 20px;
    }
    .card {
      background: var(--vscode-editor-inactiveSelectionBackground);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .character-header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 16px;
    }
    .character-sprite {
      width: 80px;
      height: 80px;
      background: var(--vscode-editor-background);
      border: 2px solid var(--vscode-textLink-foreground);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .character-sprite img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .character-info h3 {
      margin: 0;
      font-size: 18px;
    }
    .character-class {
      color: var(--vscode-descriptionForeground);
      font-size: 14px;
    }
    .xp-bar-container {
      margin-top: 8px;
    }
    .xp-bar {
      height: 8px;
      background: var(--vscode-progressBar-background);
      border-radius: 4px;
      overflow: hidden;
    }
    .xp-bar-fill {
      height: 100%;
      background: var(--vscode-textLink-foreground);
      transition: width 0.3s ease;
    }
    .xp-text {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }
    .stat-item {
      display: flex;
      justify-content: space-between;
      padding: 8px;
      background: var(--vscode-editor-background);
      border-radius: 4px;
    }
    .stat-label {
      color: var(--vscode-descriptionForeground);
    }
    .stat-value {
      font-weight: bold;
    }
    .stat-value.positive { color: #4ec9b0; }
    .stat-value.negative { color: #f14c4c; }
    .stat-value.gold { color: #dcdcaa; }
    .stat-value.xp { color: #c586c0; }
    .muted { color: var(--vscode-descriptionForeground); font-style: italic; }
    .quest-item {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 10px;
    }
    .quest-item.completed {
      border-color: #4ec9b0;
      background: rgba(78, 201, 176, 0.1);
    }
    .quest-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .quest-title {
      font-weight: bold;
      font-size: 14px;
    }
    .quest-reward {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    .quest-description {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
    }
    .quest-progress-bar {
      height: 6px;
      background: var(--vscode-progressBar-background);
      border-radius: 3px;
      overflow: hidden;
    }
    .quest-progress-fill {
      height: 100%;
      background: var(--vscode-textLink-foreground);
      transition: width 0.3s ease;
    }
    .quest-progress-fill.complete {
      background: #4ec9b0;
    }
    .quest-progress-text {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
      text-align: right;
    }
    .claim-btn {
      margin-top: 8px;
      padding: 4px 12px;
      font-size: 12px;
      background: #4ec9b0;
      color: #000;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    .claim-btn:hover {
      background: #3db89f;
    }
    .request-item {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .request-item.friend { border-left: 3px solid #4ec9b0; }
    .request-item.pvp { border-left: 3px solid #f14c4c; }
    .request-item.boss { border-left: 3px solid #dcdcaa; }
    .request-info {
      flex: 1;
    }
    .request-type {
      font-size: 11px;
      text-transform: uppercase;
      opacity: 0.7;
      margin-bottom: 4px;
    }
    .request-name {
      font-weight: bold;
      font-size: 14px;
    }
    .request-detail {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    .request-actions {
      display: flex;
      gap: 8px;
    }
    .request-btn {
      padding: 6px 12px;
      font-size: 12px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    .request-btn.accept {
      background: #4ec9b0;
      color: #000;
    }
    .request-btn.decline {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .request-btn:hover {
      opacity: 0.9;
    }
    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      margin-right: 8px;
      margin-top: 8px;
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-primary:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>⚔️ GitRPG</h1>
    <p class="subtitle">Turn your commits into XP!</p>

    <div class="card">
      <div class="character-header">
        <div class="character-sprite" id="sprite"><img src="${spriteUri}" alt="${char.class}" id="spriteImg"></div>
        <div class="character-info">
          <h3 id="charName">${char.name}</h3>
          <div class="character-class">Level <span id="level">${char.level}</span> <span id="class">${char.class}</span></div>
        </div>
      </div>
      <div class="xp-bar-container">
        <div class="xp-bar">
          <div class="xp-bar-fill" id="xpBar" style="width: ${(char.xp / char.xpToNextLevel) * 100}%"></div>
        </div>
        <div class="xp-text"><span id="xp">${char.xp}</span> / <span id="xpNext">${char.xpToNextLevel}</span> XP</div>
      </div>
    </div>

    <h2>💰 Resources</h2>
    <div class="card">
      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-label">Gold</span>
          <span class="stat-value gold" id="gold">${char.gold}</span>
        </div>
      </div>
    </div>

    <div id="pendingRequestsSection" style="display: none;">
      <h2>📬 Pending Requests</h2>
      <div class="card" id="pendingRequestsCard">
        <div id="pendingRequestsList"></div>
      </div>
    </div>

    <h2>📊 Today's Activity</h2>
    <div class="card">
      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-label">Commits</span>
          <span class="stat-value" id="commits">${today.commits}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Lines Added</span>
          <span class="stat-value positive" id="linesAdded">+${today.linesAdded}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Lines Removed</span>
          <span class="stat-value negative" id="linesRemoved">-${today.linesRemoved}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Files Changed</span>
          <span class="stat-value" id="filesChanged">${today.filesChanged}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">XP Earned</span>
          <span class="stat-value xp" id="xpEarned">+${today.xpEarned}</span>
        </div>
      </div>
    </div>

    <h2>📜 Daily Quests</h2>
    <div class="card" id="questsSection">
      <div id="questsList">
        <p class="muted">Connect account to see quests</p>
      </div>
    </div>

    <h2>⚒️ Workers</h2>
    <div class="card" id="workersSection">
      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-label">Workers</span>
          <span class="stat-value" id="workerCount">0</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Gold/Hour</span>
          <span class="stat-value gold" id="goldPerHour">0</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Pending Gold</span>
          <span class="stat-value gold" id="pendingGold">0</span>
        </div>
      </div>
      <button class="btn btn-primary" onclick="collectGold()">💰 Collect Gold</button>
      <button class="btn btn-secondary" onclick="manageWorkers()">⚒️ Manage Workers</button>
    </div>

    <h2>⚙️ Actions</h2>
    <div class="card">
      <button class="btn btn-primary" onclick="checkCommits()">🔄 Check Commits</button>
      <button class="btn btn-secondary" onclick="changeName()">✏️ Change Name</button>
      <button class="btn btn-secondary" onclick="changeClass()">🎭 Change Class</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const spriteUris = ${JSON.stringify(spriteUris)};

    function checkCommits() {
      vscode.postMessage({ type: 'checkCommits' });
    }

    function changeName() {
      vscode.postMessage({ type: 'requestNameChange' });
    }

    function changeClass() {
      vscode.postMessage({ type: 'requestClassChange' });
    }

    function showQuests() {
      vscode.postMessage({ type: 'showQuests' });
    }

    function manageWorkers() {
      vscode.postMessage({ type: 'manageWorkers' });
    }

    function collectGold() {
      vscode.postMessage({ type: 'collectGold' });
    }

    function claimQuest(questId) {
      vscode.postMessage({ type: 'claimQuest', questId: questId });
    }

    function renderQuests(quests, isAuthenticated) {
      const questsList = document.getElementById('questsList');
      if (!isAuthenticated) {
        questsList.innerHTML = '<p class="muted">Connect account to see quests</p>';
        return;
      }
      if (!quests || quests.length === 0) {
        questsList.innerHTML = '<p class="muted">No active quests. Check back tomorrow!</p>';
        return;
      }
      let html = '';
      for (const quest of quests) {
        const progress = Math.min(100, (quest.requirement_current / quest.requirement_target) * 100);
        const isComplete = quest.status === 'completed';
        const isClaimed = quest.status === 'claimed';
        html += '<div class="quest-item ' + (isComplete ? 'completed' : '') + '">';
        html += '  <div class="quest-header">';
        html += '    <span class="quest-title">' + (isComplete ? '✅ ' : '📋 ') + quest.title + '</span>';
        html += '    <span class="quest-reward">+' + quest.reward_xp + ' XP, +' + quest.reward_gold + ' Gold</span>';
        html += '  </div>';
        html += '  <div class="quest-description">' + quest.description + '</div>';
        html += '  <div class="quest-progress-bar">';
        html += '    <div class="quest-progress-fill ' + (isComplete ? 'complete' : '') + '" style="width: ' + progress + '%"></div>';
        html += '  </div>';
        html += '  <div class="quest-progress-text">' + quest.requirement_current + ' / ' + quest.requirement_target + '</div>';
        if (isComplete && !isClaimed) {
          html += '  <button class="claim-btn" onclick="claimQuest(\\'' + quest.id + '\\')">Claim Reward</button>';
        }
        html += '</div>';
      }
      questsList.innerHTML = html;
    }

    function renderWorkers(summary, isAuthenticated) {
      if (!isAuthenticated) return;
      document.getElementById('workerCount').textContent = summary.workerCount;
      document.getElementById('goldPerHour').textContent = summary.totalGoldPerHour;
      document.getElementById('pendingGold').textContent = summary.pendingGold;
    }

    function acceptFriendRequest(friendId) {
      vscode.postMessage({ type: 'acceptFriend', friendId: friendId });
    }

    function declineFriendRequest(friendId) {
      vscode.postMessage({ type: 'declineFriend', friendId: friendId });
    }

    function acceptPvpChallenge(battleId) {
      vscode.postMessage({ type: 'acceptPvp', battleId: battleId });
    }

    function declinePvpChallenge(battleId) {
      vscode.postMessage({ type: 'declinePvp', battleId: battleId });
    }

    function joinBossBattle(lobbyId) {
      vscode.postMessage({ type: 'joinBoss', lobbyId: lobbyId });
    }

    function declineBossInvite(lobbyId) {
      vscode.postMessage({ type: 'declineBoss', lobbyId: lobbyId });
    }

    function renderPendingRequests(friendRequests, pvpChallenges, bossInvites) {
      const section = document.getElementById('pendingRequestsSection');
      const list = document.getElementById('pendingRequestsList');

      const totalPending = (friendRequests?.length || 0) + (pvpChallenges?.length || 0) + (bossInvites?.length || 0);

      if (totalPending === 0) {
        section.style.display = 'none';
        return;
      }

      section.style.display = 'block';
      let html = '';

      // Friend requests
      for (const req of (friendRequests || [])) {
        html += '<div class="request-item friend">';
        html += '  <div class="request-info">';
        html += '    <div class="request-type">Friend Request</div>';
        html += '    <div class="request-name">' + req.displayName + '</div>';
        html += '    <div class="request-detail">Lv.' + req.level + ' ' + req.characterClass + '</div>';
        html += '  </div>';
        html += '  <div class="request-actions">';
        html += '    <button class="request-btn accept" onclick="acceptFriendRequest(\\'' + req.id + '\\')">Accept</button>';
        html += '    <button class="request-btn decline" onclick="declineFriendRequest(\\'' + req.id + '\\')">Decline</button>';
        html += '  </div>';
        html += '</div>';
      }

      // PvP challenges
      for (const challenge of (pvpChallenges || [])) {
        html += '<div class="request-item pvp">';
        html += '  <div class="request-info">';
        html += '    <div class="request-type">PvP Challenge</div>';
        html += '    <div class="request-name">' + challenge.challengerName + '</div>';
        html += '    <div class="request-detail">Lv.' + challenge.challengerLevel + ' ' + challenge.challengerClass + '</div>';
        html += '  </div>';
        html += '  <div class="request-actions">';
        html += '    <button class="request-btn accept" onclick="acceptPvpChallenge(\\'' + challenge.id + '\\')">Fight!</button>';
        html += '    <button class="request-btn decline" onclick="declinePvpChallenge(\\'' + challenge.id + '\\')">Decline</button>';
        html += '  </div>';
        html += '</div>';
      }

      // Boss invites
      for (const invite of (bossInvites || [])) {
        html += '<div class="request-item boss">';
        html += '  <div class="request-info">';
        html += '    <div class="request-type">Boss Raid Invite</div>';
        html += '    <div class="request-name">' + invite.challengerName + '</div>';
        html += '    <div class="request-detail">vs ' + invite.bossName + '</div>';
        html += '  </div>';
        html += '  <div class="request-actions">';
        html += '    <button class="request-btn accept" onclick="joinBossBattle(\\'' + invite.lobbyId + '\\')">Join!</button>';
        html += '    <button class="request-btn decline" onclick="declineBossInvite(\\'' + invite.lobbyId + '\\')">Decline</button>';
        html += '  </div>';
        html += '</div>';
      }

      list.innerHTML = html;
    }

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'stateUpdate') {
        const char = message.character;
        const today = message.todayStats;

        document.getElementById('charName').textContent = char.name;
        document.getElementById('level').textContent = char.level;
        document.getElementById('class').textContent = char.class;
        document.getElementById('xp').textContent = char.xp;
        document.getElementById('xpNext').textContent = char.xpToNextLevel;
        document.getElementById('xpBar').style.width = (char.xp / char.xpToNextLevel * 100) + '%';
        document.getElementById('gold').textContent = char.gold;
        document.getElementById('spriteImg').src = spriteUris[char.class.toLowerCase()];

        document.getElementById('commits').textContent = today.commits;
        document.getElementById('linesAdded').textContent = '+' + today.linesAdded;
        document.getElementById('linesRemoved').textContent = '-' + today.linesRemoved;
        document.getElementById('filesChanged').textContent = today.filesChanged;
        document.getElementById('xpEarned').textContent = '+' + today.xpEarned;

        // Render quests, workers, and pending requests
        renderQuests(message.quests, message.isAuthenticated);
        renderWorkers(message.workerSummary, message.isAuthenticated);
        renderPendingRequests(message.pendingFriendRequests, message.pendingPvpChallenges, message.pendingBossInvites);
      }
    });

  </script>
</body>
</html>`;
}

function getClassEmoji(className: string): string {
  const emojis: Record<string, string> = {
    Warrior: '⚔️',
    Mage: '🧙',
    Rogue: '🗡️',
    Archer: '🏹'
  };
  return emojis[className] || '⚔️';
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
