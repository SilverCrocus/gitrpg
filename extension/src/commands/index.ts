import * as vscode from 'vscode';
import { registerBattleCommand } from './battleCommand';
import { registerCharacterCommands } from './characterCommands';
import { registerSocialCommands, SocialServices } from './socialCommands';
import { registerEconomyCommands, EconomyServices } from './economyCommands';
import { LocalStateManager } from '../services/localStateManager';
import { GitTrackingService } from '../services/gitTrackingService';

export interface AllServices extends SocialServices, EconomyServices {
  stateManager: LocalStateManager;
  gitTracker: GitTrackingService;
}

export function registerAllCommands(
  context: vscode.ExtensionContext,
  services: AllServices
): vscode.Disposable[] {
  // Register git tracking commands (remain inline for now)
  const checkCommitsCmd = vscode.commands.registerCommand('gitrpg.checkCommits', async () => {
    vscode.window.showInformationMessage('Checking for new commits...');
    await services.gitTracker.forceCheck();
  });

  const showLogCmd = vscode.commands.registerCommand('gitrpg.showLog', () => {
    services.gitTracker.showLog();
  });

  return [
    ...registerCharacterCommands(context, services.stateManager),
    ...registerSocialCommands(context, services),
    ...registerEconomyCommands(context, services),
    registerBattleCommand(context),
    checkCommitsCmd,
    showLogCmd,
  ];
}
