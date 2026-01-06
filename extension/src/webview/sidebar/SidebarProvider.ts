import * as vscode from 'vscode';
import { LocalStateManager } from '../../services/localStateManager';
import { buildWebviewHtml } from '../webviewUtils';

/**
 * SidebarProvider manages the GitRPG sidebar webview
 */
export class SidebarProvider implements vscode.WebviewViewProvider {
  private webviewView?: vscode.WebviewView;
  private unsubscribeFromState: (() => void) | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly stateManager: LocalStateManager
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.webviewView = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')]
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    // Update sidebar when state changes
    this.unsubscribeFromState = this.stateManager.onStateChange(() => {
      if (this.webviewView) {
        this.sendStateToWebview();
      }
    });

    // Clean up subscription when webview is disposed
    webviewView.onDidDispose(() => {
      if (this.unsubscribeFromState) {
        this.unsubscribeFromState();
        this.unsubscribeFromState = null;
      }
    });

    // Handle messages from sidebar
    webviewView.webview.onDidReceiveMessage(message => {
      if (message.type === 'command') {
        vscode.commands.executeCommand(message.command);
      }
    });
  }

  /**
   * Get the HTML content for the sidebar
   */
  private getHtml(webview: vscode.Webview): string {
    return buildWebviewHtml({
      webview,
      extensionUri: this.extensionUri,
      templatePath: 'sidebar/template.html',
      stylesPath: 'sidebar/styles.css',
      scriptPath: 'sidebar/script.js',
      data: this.getInitialData(webview),
      title: 'GitRPG'
    });
  }

  /**
   * Get initial data to inject into the webview
   */
  private getInitialData(webview: vscode.Webview): Record<string, unknown> {
    const char = this.stateManager.getCharacter();
    const today = this.stateManager.getTodayStats();

    // Get sprite URI for the character's class
    const classFolder = char.class.toLowerCase();
    const spriteUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'sprites', 'characters', classFolder, 'idle.svg')
    ).toString();

    return {
      character: char,
      todayStats: today,
      spriteUri
    };
  }

  /**
   * Send current state to the webview
   */
  private sendStateToWebview(): void {
    if (!this.webviewView) {
      return;
    }

    const char = this.stateManager.getCharacter();
    const today = this.stateManager.getTodayStats();

    // Get sprite URI for the character's class
    const classFolder = char.class.toLowerCase();
    const spriteUri = this.webviewView.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'sprites', 'characters', classFolder, 'idle.svg')
    ).toString();

    this.webviewView.webview.postMessage({
      type: 'stateUpdate',
      character: char,
      todayStats: today,
      spriteUri
    });
  }
}
