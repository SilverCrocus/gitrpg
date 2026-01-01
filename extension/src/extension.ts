import * as vscode from 'vscode';

let mainPanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('GitRPG extension is now active!');

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

  context.subscriptions.push(showDashboardCmd, showCharacterCmd, startBattleCmd);

  // Register webview provider for sidebar
  const provider = new GitRPGViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('gitrpg.mainView', provider)
  );
}

function showMainPanel(context: vscode.ExtensionContext, view: string) {
  if (mainPanel) {
    mainPanel.reveal();
    mainPanel.webview.postMessage({ type: 'navigate', view });
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

  // Handle messages from webview
  mainPanel.webview.onDidReceiveMessage(
    message => {
      switch (message.type) {
        case 'alert':
          vscode.window.showInformationMessage(message.text);
          break;
        case 'error':
          vscode.window.showErrorMessage(message.text);
          break;
      }
    },
    undefined,
    context.subscriptions
  );
}

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri, initialView: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:;">
  <title>GitRPG</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 20px;
      margin: 0;
    }
    h1 { color: var(--vscode-textLink-foreground); }
    .container { max-width: 800px; margin: 0 auto; }
    .loading { text-align: center; padding: 40px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="loading">
      <h1>GitRPG</h1>
      <p>Loading ${initialView}...</p>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const initialView = '${initialView}';

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'navigate') {
        // Handle navigation
        console.log('Navigating to:', message.view);
      }
    });
  </script>
</body>
</html>`;
}

class GitRPGViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly extensionUri: vscode.Uri) {}

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
  }

  private getSidebarContent(webview: vscode.Webview): string {
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
      image-rendering: pixelated;
    }
    button {
      width: 100%;
      padding: 8px;
      margin: 4px 0;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      cursor: pointer;
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
  </style>
</head>
<body>
  <div class="character-preview" id="characterSprite"></div>

  <div class="stat">
    <div class="stat-label">Level</div>
    <div class="stat-value" id="level">1</div>
  </div>

  <div class="stat">
    <div class="stat-label">XP</div>
    <div class="stat-value" id="xp">0 / 100</div>
  </div>

  <div class="stat">
    <div class="stat-label">Gold</div>
    <div class="stat-value" id="gold">0</div>
  </div>

  <div class="stat">
    <div class="stat-label">Today's Commits</div>
    <div class="stat-value" id="commits">0</div>
  </div>

  <button onclick="openDashboard()">Open Dashboard</button>
  <button onclick="startBattle()">Battle!</button>

  <script>
    const vscode = acquireVsCodeApi();

    function openDashboard() {
      vscode.postMessage({ type: 'command', command: 'gitrpg.showDashboard' });
    }

    function startBattle() {
      vscode.postMessage({ type: 'command', command: 'gitrpg.startBattle' });
    }
  </script>
</body>
</html>`;
  }
}

export function deactivate() {}
