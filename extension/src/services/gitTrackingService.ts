import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { LocalStateManager } from './localStateManager';

const execAsync = promisify(exec);

// Path to VS Code's recent workspaces storage (macOS)
function getVSCodeStoragePaths(): string[] {
  const homeDir = os.homedir();
  return [
    // VS Code
    path.join(homeDir, 'Library/Application Support/Code/User/globalStorage/storage.json'),
    path.join(homeDir, 'Library/Application Support/Code/storage.json'),
    // VS Code Insiders
    path.join(homeDir, 'Library/Application Support/Code - Insiders/User/globalStorage/storage.json'),
    path.join(homeDir, 'Library/Application Support/Code - Insiders/storage.json'),
    // Linux paths
    path.join(homeDir, '.config/Code/User/globalStorage/storage.json'),
    path.join(homeDir, '.config/Code/storage.json'),
    // Windows paths (via WSL or similar)
    path.join(homeDir, 'AppData/Roaming/Code/User/globalStorage/storage.json'),
    path.join(homeDir, 'AppData/Roaming/Code/storage.json'),
  ];
}

export interface GitCommit {
  hash: string;
  author: string;
  email: string;
  date: Date;
  message: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export class GitTrackingService {
  private stateManager: LocalStateManager;
  private questService: any = null; // Import would create circular dep
  private checkInterval: NodeJS.Timeout | null = null;
  private repoScanInterval: NodeJS.Timeout | null = null;
  private outputChannel: vscode.OutputChannel;
  private isChecking: boolean = false;
  private discoveredRepos: string[] = [];
  private lastRepoScan: Date | null = null;

  constructor(stateManager: LocalStateManager) {
    this.stateManager = stateManager;
    this.outputChannel = vscode.window.createOutputChannel('GitRPG');
  }

  setQuestService(qs: any): void {
    this.questService = qs;
  }

  async start(): Promise<void> {
    this.log('GitRPG tracking started - Global mode');

    // Detect git email for filtering commits
    await this.detectGitEmail();

    // Discover git repos globally
    await this.discoverGitRepos();

    // Check immediately on start
    await this.checkForNewCommits();

    // Then check every 30 seconds
    this.checkInterval = setInterval(() => {
      this.checkForNewCommits();
    }, 30000);

    // Re-scan for new repos every 5 minutes
    this.repoScanInterval = setInterval(() => {
      this.discoverGitRepos();
    }, 300000);
  }

  private async discoverGitRepos(): Promise<void> {
    const repos: string[] = [];

    this.log('Finding recently opened VS Code workspaces...');

    // Get repos from VS Code's recent workspaces
    const recentRepos = await this.getRecentVSCodeWorkspaces();
    for (const repoPath of recentRepos) {
      if (await this.isGitRepo(repoPath)) {
        repos.push(repoPath);
      }
    }

    // Also add any workspace folders currently open in this VS Code instance
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      for (const folder of workspaceFolders) {
        if (await this.isGitRepo(folder.uri.fsPath)) {
          if (!repos.includes(folder.uri.fsPath)) {
            repos.push(folder.uri.fsPath);
          }
        }
      }
    }

    this.discoveredRepos = [...new Set(repos)]; // Remove duplicates
    this.lastRepoScan = new Date();

    if (this.discoveredRepos.length > 0) {
      this.log(`Tracking ${this.discoveredRepos.length} git repositories:`);
      for (const repo of this.discoveredRepos) {
        this.log(`  - ${path.basename(repo)}`);
      }
    } else {
      this.log('No git repositories found in recent VS Code workspaces');
    }
  }

  private async getRecentVSCodeWorkspaces(): Promise<string[]> {
    const repos: string[] = [];
    const storagePaths = getVSCodeStoragePaths();

    for (const storagePath of storagePaths) {
      if (!fs.existsSync(storagePath)) {
        continue;
      }

      try {
        const content = fs.readFileSync(storagePath, 'utf-8');
        const data = JSON.parse(content);

        // VS Code stores recent folders in different formats depending on version
        // Try to extract from various known structures

        // Format 1: openedPathsList.entries
        if (data.openedPathsList?.entries) {
          for (const entry of data.openedPathsList.entries) {
            if (entry.folderUri) {
              const folderPath = this.uriToPath(entry.folderUri);
              if (folderPath && fs.existsSync(folderPath)) {
                repos.push(folderPath);
              }
            }
          }
        }

        // Format 2: openedPathsList.workspaces3
        if (data.openedPathsList?.workspaces3) {
          for (const workspace of data.openedPathsList.workspaces3) {
            if (typeof workspace === 'string') {
              const folderPath = this.uriToPath(workspace);
              if (folderPath && fs.existsSync(folderPath)) {
                repos.push(folderPath);
              }
            } else if (workspace.folderUri) {
              const folderPath = this.uriToPath(workspace.folderUri);
              if (folderPath && fs.existsSync(folderPath)) {
                repos.push(folderPath);
              }
            }
          }
        }

        // Format 3: windowsState.lastActiveWindow and openedWindows
        if (data.windowsState) {
          const windows = [
            data.windowsState.lastActiveWindow,
            ...(data.windowsState.openedWindows || [])
          ].filter(Boolean);

          for (const win of windows) {
            if (win.folder) {
              const folderPath = this.uriToPath(win.folder);
              if (folderPath && fs.existsSync(folderPath)) {
                repos.push(folderPath);
              }
            }
            if (win.folderUri) {
              const folderPath = this.uriToPath(win.folderUri);
              if (folderPath && fs.existsSync(folderPath)) {
                repos.push(folderPath);
              }
            }
          }
        }

      } catch (error) {
        // Failed to parse this storage file, try next one
      }
    }

    return [...new Set(repos)]; // Remove duplicates
  }

  private uriToPath(uri: string): string | null {
    try {
      if (uri.startsWith('file://')) {
        return decodeURIComponent(uri.replace('file://', ''));
      }
      // If it's already a path
      if (uri.startsWith('/') || uri.match(/^[A-Za-z]:\\/)) {
        return uri;
      }
      return null;
    } catch {
      return null;
    }
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    if (this.repoScanInterval) {
      clearInterval(this.repoScanInterval);
      this.repoScanInterval = null;
    }
    this.log('GitRPG tracking stopped');
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] ${message}`);
  }

  private async detectGitEmail(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return;
    }

    for (const folder of workspaceFolders) {
      try {
        const { stdout } = await execAsync('git config user.email', {
          cwd: folder.uri.fsPath
        });
        const email = stdout.trim();
        if (email) {
          await this.stateManager.setGitEmail(email);
          this.log(`Detected git email: ${email}`);
          return;
        }
      } catch {
        // Not a git repo or no email configured
      }
    }
  }

  async checkForNewCommits(): Promise<void> {
    if (this.isChecking) {
      return; // Prevent concurrent checks
    }

    this.isChecking = true;

    try {
      // Use discovered repos, fall back to workspace folders if none found
      let reposToCheck = this.discoveredRepos;

      if (reposToCheck.length === 0) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders) {
          reposToCheck = workspaceFolders.map(f => f.uri.fsPath);
        }
      }

      if (reposToCheck.length === 0) {
        return;
      }

      const since = this.stateManager.getLastCheckedAt();

      let totalNewCommits = 0;
      let totalLinesAdded = 0;
      let totalLinesRemoved = 0;
      let totalFilesChanged = 0;

      for (const repoPath of reposToCheck) {
        // Check if it's still a git repo (might have been deleted)
        if (!await this.isGitRepo(repoPath)) {
          continue;
        }

        // Get commits since last check (no email filter - all commits in your repos count)
        const commits = await this.getCommitsSince(repoPath, since);

        for (const commit of commits) {
          // Skip if we've already processed this commit
          if (this.stateManager.isCommitProcessed(commit.hash)) {
            continue;
          }

          const repoName = path.basename(repoPath);
          this.log(`New commit in ${repoName}: ${commit.hash.substring(0, 7)} - "${commit.message}" (+${commit.insertions}/-${commit.deletions})`);

          totalNewCommits++;
          totalLinesAdded += commit.insertions;
          totalLinesRemoved += commit.deletions;
          totalFilesChanged += commit.filesChanged;

          await this.stateManager.markCommitProcessed(commit.hash);
        }
      }

      // Update state if we found new commits
      if (totalNewCommits > 0) {
        const result = await this.stateManager.addActivity(
          totalNewCommits,
          totalLinesAdded,
          totalLinesRemoved,
          totalFilesChanged
        );

        this.log(`Earned ${result.xpEarned} XP from ${totalNewCommits} commit(s)`);

        // Update quest progress with today's cumulative stats
        if (this.questService) {
          const todayStats = this.stateManager.getTodayStats();
          await this.questService.updateQuestProgress({
            commits: todayStats.commits,
            linesAdded: todayStats.linesAdded,
            filesChanged: todayStats.filesChanged,
          });
        }

        // Show notification
        const char = this.stateManager.getCharacter();
        if (result.leveledUp) {
          vscode.window.showInformationMessage(
            `🎉 Level Up! ${char.name} is now Level ${result.newLevel}!`,
            'View Character'
          ).then(selection => {
            if (selection === 'View Character') {
              vscode.commands.executeCommand('gitrpg.showDashboard');
            }
          });
        } else {
          vscode.window.showInformationMessage(
            `⚔️ +${result.xpEarned} XP from ${totalNewCommits} commit(s)!`
          );
        }
      }

      await this.stateManager.updateLastChecked();
    } catch (error) {
      this.log(`Error checking commits: ${error}`);
    } finally {
      this.isChecking = false;
    }
  }

  private async isGitRepo(dirPath: string): Promise<boolean> {
    try {
      const gitPath = path.join(dirPath, '.git');
      return fs.existsSync(gitPath);
    } catch {
      return false;
    }
  }

  private async getCommitsSince(repoPath: string, since: Date): Promise<GitCommit[]> {
    const sinceStr = since.toISOString();
    const gitEmail = this.stateManager.getGitEmail();
    const authorFilter = gitEmail ? ` --author="${gitEmail}"` : '';

    const command = `git log --since="${sinceStr}"${authorFilter} --pretty=format:"%H|%an|%ae|%aI|%s" --shortstat`;

    try {
      const { stdout } = await execAsync(command, { cwd: repoPath, maxBuffer: 10 * 1024 * 1024 });
      return this.parseGitLog(stdout);
    } catch (error) {
      return [];
    }
  }

  private parseGitLog(logOutput: string): GitCommit[] {
    const commits: GitCommit[] = [];
    const lines = logOutput.split('\n').filter(line => line.trim());

    let i = 0;
    while (i < lines.length) {
      const commitLine = lines[i];
      if (!commitLine || !commitLine.includes('|')) {
        i++;
        continue;
      }

      const parts = commitLine.split('|');
      const hash = parts[0] ?? '';
      const author = parts[1] ?? '';
      const email = parts[2] ?? '';
      const dateStr = parts[3] ?? '';
      const message = parts.slice(4).join('|');

      let filesChanged = 0;
      let insertions = 0;
      let deletions = 0;

      // Check next line for stats
      const statsLine = lines[i + 1];
      if (statsLine) {
        const filesMatch = statsLine.match(/(\d+) files? changed/);
        const insertMatch = statsLine.match(/(\d+) insertions?\(\+\)/);
        const deleteMatch = statsLine.match(/(\d+) deletions?\(-\)/);

        if (filesMatch?.[1]) filesChanged = parseInt(filesMatch[1], 10);
        if (insertMatch?.[1]) insertions = parseInt(insertMatch[1], 10);
        if (deleteMatch?.[1]) deletions = parseInt(deleteMatch[1], 10);

        if (filesMatch || insertMatch || deleteMatch) {
          i++; // Skip stats line
        }
      }

      commits.push({
        hash,
        author,
        email,
        date: new Date(dateStr),
        message,
        filesChanged,
        insertions,
        deletions
      });

      i++;
    }

    return commits;
  }

  // Manual trigger for testing
  async forceCheck(): Promise<void> {
    this.log('Manual commit check triggered');
    await this.checkForNewCommits();
  }

  showLog(): void {
    this.outputChannel.show();
  }
}
