import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

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

export interface GitRepoStats {
  repoPath: string;
  totalCommits: number;
  totalInsertions: number;
  totalDeletions: number;
  totalFilesChanged: number;
  commits: GitCommit[];
}

export async function isGitRepo(dirPath: string): Promise<boolean> {
  try {
    const gitPath = path.join(dirPath, '.git');
    return fs.existsSync(gitPath);
  } catch {
    return false;
  }
}

export async function getRepoCommitsSince(
  repoPath: string,
  since: Date,
  authorEmail?: string
): Promise<GitCommit[]> {
  const sinceStr = since.toISOString();
  const authorFilter = authorEmail ? `--author=${authorEmail}` : '';

  const command = `git log --since="${sinceStr}" ${authorFilter} --pretty=format:"%H|%an|%ae|%aI|%s" --shortstat`;

  try {
    const { stdout } = await execAsync(command, { cwd: repoPath });
    return parseGitLog(stdout);
  } catch (error) {
    console.error(`Failed to get commits from ${repoPath}:`, error);
    return [];
  }
}

export function parseGitLog(logOutput: string): GitCommit[] {
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
    const message = parts[4] ?? '';

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

export async function getRepoStats(
  repoPath: string,
  since: Date,
  authorEmail?: string
): Promise<GitRepoStats> {
  const commits = await getRepoCommitsSince(repoPath, since, authorEmail);

  return {
    repoPath,
    totalCommits: commits.length,
    totalInsertions: commits.reduce((sum, c) => sum + c.insertions, 0),
    totalDeletions: commits.reduce((sum, c) => sum + c.deletions, 0),
    totalFilesChanged: commits.reduce((sum, c) => sum + c.filesChanged, 0),
    commits
  };
}

export async function findGitReposInWorkspace(workspacePath: string): Promise<string[]> {
  const repos: string[] = [];

  async function search(dir: string, depth: number = 0): Promise<void> {
    if (depth > 3) return; // Don't search too deep

    if (await isGitRepo(dir)) {
      repos.push(dir);
      return; // Don't search inside git repos
    }

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await search(path.join(dir, entry.name), depth + 1);
        }
      }
    } catch {
      // Permission denied or other error, skip
    }
  }

  await search(workspacePath);
  return repos;
}
