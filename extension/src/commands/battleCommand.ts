import * as vscode from 'vscode';
import { generateBattleHTML } from '../webview/battleUI';
import { getNonce } from '../webview/webviewUtils';
import { BattleAnimationPlayer } from '../webview/battlePlayer';
import type { BattleAction, CharacterClass } from '../types';

export interface BattleData {
  fighter1: {
    id: string;
    name: string;
    class: CharacterClass;
    level: number;
    maxHp: number;
  };
  fighter2: {
    id: string;
    name: string;
    class: CharacterClass;
    level: number;
    maxHp: number;
  };
  actions: BattleAction[];
  winnerId: string;
  rewards: {
    xp: number;
    gold: number;
  };
}

export async function showBattlePanel(
  context: vscode.ExtensionContext,
  battleData: BattleData
): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    'gitrpgBattle',
    'GitRPG Battle',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  const nonce = getNonce();
  panel.webview.html = generateBattleHTML(
    battleData.fighter1.name,
    battleData.fighter1.class,
    battleData.fighter1.level,
    battleData.fighter2.name,
    battleData.fighter2.class,
    battleData.fighter2.level,
    nonce,
    panel.webview.cspSource
  );

  // Create animation player
  const player = new BattleAnimationPlayer(
    battleData.actions,
    { id: battleData.fighter1.id, maxHp: battleData.fighter1.maxHp },
    { id: battleData.fighter2.id, maxHp: battleData.fighter2.maxHp },
    (state) => {
      // Send updates to webview
      const f1 = state.getFighter1State();
      const f2 = state.getFighter2State();

      panel.webview.postMessage({
        type: 'updateHealth',
        playerId: 1,
        currentHp: f1.currentHp,
        maxHp: f1.maxHp
      });

      panel.webview.postMessage({
        type: 'updateHealth',
        playerId: 2,
        currentHp: f2.currentHp,
        maxHp: f2.maxHp
      });

      panel.webview.postMessage({
        type: 'updateAnimation',
        fighterId: 1,
        animation: f1.state
      });

      panel.webview.postMessage({
        type: 'updateAnimation',
        fighterId: 2,
        animation: f2.state
      });

      const action = state.getCurrentAction();
      if (action && action.damage > 0) {
        const targetId = action.targetId === f1.id ? 1 : 2;

        panel.webview.postMessage({
          type: 'showDamage',
          targetId,
          damage: action.damage,
          isCrit: action.isCrit
        });

        const attackerName = action.actorId === f1.id ? battleData.fighter1.name : battleData.fighter2.name;
        const defenderName = action.targetId === f1.id ? battleData.fighter1.name : battleData.fighter2.name;

        panel.webview.postMessage({
          type: 'addLogEntry',
          text: `${attackerName} hits ${defenderName} for ${action.damage} damage!`,
          isCrit: action.isCrit
        });
      }
    },
    () => {
      // Battle complete
      const winnerName = battleData.winnerId === battleData.fighter1.id
        ? battleData.fighter1.name
        : battleData.fighter2.name;

      panel.webview.postMessage({
        type: 'showVictory',
        winnerName,
        xp: battleData.rewards.xp,
        gold: battleData.rewards.gold
      });
    }
  );

  // Handle messages from webview
  panel.webview.onDidReceiveMessage(
    message => {
      switch (message.type) {
        case 'skip':
          player.skip();
          break;
        case 'close':
          panel.dispose();
          break;
      }
    },
    undefined,
    context.subscriptions
  );

  // Start the battle animation after a short delay
  setTimeout(() => player.play(), 1000);
}

export function registerBattleCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('gitrpg.showBattle', async (battleData: BattleData) => {
    if (!battleData) {
      vscode.window.showErrorMessage('No battle data provided');
      return;
    }
    await showBattlePanel(context, battleData);
  });
}
