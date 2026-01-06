import * as vscode from 'vscode';
import { LocalStateManager } from '../services/localStateManager';
import type { CharacterClass } from '../types';

export function registerCharacterCommands(
  context: vscode.ExtensionContext,
  stateManager: LocalStateManager
): vscode.Disposable[] {
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
      await stateManager.setCharacterClass(selected as CharacterClass);
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

  return [setNameCmd, setClassCmd, resetCmd, showStatsCmd];
}
