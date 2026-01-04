import * as vscode from 'vscode';
import { registerBattleCommand } from './commands/battleCommand';
import { LocalStateManager, CharacterData, TodayStats } from './services/localStateManager';
import { GitTrackingService } from './services/gitTrackingService';

let mainPanel: vscode.WebviewPanel | undefined;
let statusBarItem: vscode.StatusBarItem;
let stateManager: LocalStateManager;
let gitTracker: GitTrackingService;

export function activate(context: vscode.ExtensionContext) {
  console.log('GitRPG extension is now active!');

  // Initialize state manager and git tracker
  stateManager = new LocalStateManager(context);
  gitTracker = new GitTrackingService(stateManager);

  // Create status bar item (right side)
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    50
  );
  statusBarItem.command = 'gitrpg.showDashboard';
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Update status bar when state changes
  stateManager.onStateChange(() => {
    updateStatusBar();
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
    showStatsCmd
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
          break;
        case 'setName':
          await stateManager.setCharacterName(message.name);
          break;
        case 'setClass':
          await stateManager.setCharacterClass(message.class);
          break;
      }
    },
    undefined,
    context.subscriptions
  );
}

function sendStateToWebview(panel: vscode.WebviewPanel): void {
  const character = stateManager.getCharacter();
  const todayStats = stateManager.getTodayStats();

  panel.webview.postMessage({
    type: 'stateUpdate',
    character,
    todayStats
  });
}

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri, initialView: string): string {
  const char = stateManager.getCharacter();
  const today = stateManager.getTodayStats();

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
      width: 64px;
      height: 64px;
      background: var(--vscode-editor-background);
      border: 2px solid var(--vscode-textLink-foreground);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
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
        <div class="character-sprite" id="sprite">${getClassEmoji(char.class)}</div>
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

    <h2>⚙️ Actions</h2>
    <div class="card">
      <button class="btn btn-primary" onclick="checkCommits()">🔄 Check Commits</button>
      <button class="btn btn-secondary" onclick="changeName()">✏️ Change Name</button>
      <button class="btn btn-secondary" onclick="changeClass()">🎭 Change Class</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function checkCommits() {
      vscode.postMessage({ type: 'checkCommits' });
    }

    function changeName() {
      const name = prompt('Enter new name:', document.getElementById('charName').textContent);
      if (name) {
        vscode.postMessage({ type: 'setName', name });
      }
    }

    function changeClass() {
      const classes = ['Warrior', 'Mage', 'Rogue', 'Archer'];
      const current = document.getElementById('class').textContent;
      const choice = prompt('Choose class: Warrior, Mage, Rogue, or Archer', current);
      if (choice && classes.includes(choice)) {
        vscode.postMessage({ type: 'setClass', class: choice });
      }
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
        document.getElementById('sprite').textContent = getClassEmoji(char.class);

        document.getElementById('commits').textContent = today.commits;
        document.getElementById('linesAdded').textContent = '+' + today.linesAdded;
        document.getElementById('linesRemoved').textContent = '-' + today.linesRemoved;
        document.getElementById('filesChanged').textContent = today.filesChanged;
        document.getElementById('xpEarned').textContent = '+' + today.xpEarned;
      }
    });

    function getClassEmoji(className) {
      const emojis = { Warrior: '⚔️', Mage: '🧙', Rogue: '🗡️', Archer: '🏹' };
      return emojis[className] || '⚔️';
    }
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
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly stateManager: LocalStateManager
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.html = this.getSidebarContent(webviewView.webview);

    // Update sidebar when state changes
    this.stateManager.onStateChange(() => {
      webviewView.webview.html = this.getSidebarContent(webviewView.webview);
    });
  }

  private getSidebarContent(webview: vscode.Webview): string {
    const char = this.stateManager.getCharacter();
    const today = this.stateManager.getTodayStats();
    const xpPercent = Math.round((char.xp / char.xpToNextLevel) * 100);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
      width: 64px;
      height: 64px;
      margin: 10px auto;
      background: var(--vscode-editor-background);
      border: 2px solid var(--vscode-textLink-foreground);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
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
  <div class="character-preview">${getClassEmoji(char.class)}</div>
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
}
