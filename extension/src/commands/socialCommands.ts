import * as vscode from 'vscode';
import { SupabaseClientService } from '../services/supabaseClient';
import { ProfileSyncService } from '../services/profileSyncService';
import { FriendsService } from '../services/friendsService';
import { PvpBattleService } from '../services/pvpBattleService';
import { CoopBattleService } from '../services/coopBattleService';
import { BOSS_DEFINITIONS, getBossEmoji } from '../services/bossService';

export interface SocialServices {
  supabaseClient: SupabaseClientService;
  profileSync: ProfileSyncService;
  friendsService: FriendsService;
  pvpBattleService: PvpBattleService;
  coopBattleService: CoopBattleService;
}

export function registerSocialCommands(
  context: vscode.ExtensionContext,
  services: SocialServices
): vscode.Disposable[] {
  const { supabaseClient, profileSync, friendsService, pvpBattleService, coopBattleService } = services;

  // gitrpg.connectAccount - Connect/link GitHub account via OAuth
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

  // gitrpg.showFriends - Show friends list and manage friend requests
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

  // gitrpg.addFriend - Add friend by code
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

  // gitrpg.showFriendCode - Show user's own friend code
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

  // gitrpg.viewDailyBoss - View today's boss info
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

  // gitrpg.challengeBoss - Challenge boss with a friend
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
      } else {
        vscode.window.showErrorMessage(result.error || 'Failed to create boss lobby');
      }
    }
  });

  return [
    connectAccountCmd,
    showFriendsCmd,
    addFriendCmd,
    showFriendCodeCmd,
    viewDailyBossCmd,
    challengeBossCmd
  ];
}
