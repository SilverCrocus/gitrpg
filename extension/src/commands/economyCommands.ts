import * as vscode from 'vscode';
import { SupabaseClientService } from '../services/supabaseClient';
import { QuestService } from '../services/questService';
import { WorkerService } from '../services/workerService';

export interface EconomyServices {
  supabaseClient: SupabaseClientService;
  questService: QuestService;
  workerService: WorkerService;
}

export function registerEconomyCommands(
  context: vscode.ExtensionContext,
  services: EconomyServices
): vscode.Disposable[] {
  const { supabaseClient, questService, workerService } = services;

  // gitrpg.showQuests - Show daily quests and claim rewards
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

  // gitrpg.showWorkers - Manage workers (view, buy, upgrade)
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

  // gitrpg.collectGold - Collect gold from workers
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

  return [
    showQuestsCmd,
    showWorkersCmd,
    collectGoldCmd
  ];
}
