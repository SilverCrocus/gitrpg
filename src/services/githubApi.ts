import { Octokit } from '@octokit/rest';
import type { GitHubAccount } from '../types';

export interface CommitStats {
  totalCommits: number;
  linesAdded: number;
  linesRemoved: number;
  filesChanged: number;
}

export interface RepoCommitData {
  repo: string;
  commits: CommitStats;
  since: Date;
  until: Date;
}

export function createOctokit(account: GitHubAccount): Octokit {
  return new Octokit({
    auth: account.accessToken,
    baseUrl: account.isEnterprise && account.enterpriseUrl
      ? `${account.enterpriseUrl}/api/v3`
      : 'https://api.github.com'
  });
}

export async function getRepoCommitStats(
  account: GitHubAccount,
  owner: string,
  repo: string,
  since: Date,
  until: Date = new Date()
): Promise<CommitStats> {
  const octokit = createOctokit(account);

  const { data: commits } = await octokit.repos.listCommits({
    owner,
    repo,
    since: since.toISOString(),
    until: until.toISOString(),
    per_page: 100
  });

  let linesAdded = 0;
  let linesRemoved = 0;
  let filesChanged = 0;

  // Get detailed stats for each commit
  for (const commit of commits) {
    const { data: details } = await octokit.repos.getCommit({
      owner,
      repo,
      ref: commit.sha
    });

    linesAdded += details.stats?.additions || 0;
    linesRemoved += details.stats?.deletions || 0;
    filesChanged += details.files?.length || 0;
  }

  return {
    totalCommits: commits.length,
    linesAdded,
    linesRemoved,
    filesChanged
  };
}

export async function getUserRepos(account: GitHubAccount): Promise<string[]> {
  const octokit = createOctokit(account);

  const { data: repos } = await octokit.repos.listForAuthenticatedUser({
    per_page: 100,
    sort: 'pushed'
  });

  return repos.map(repo => repo.full_name);
}

export async function getTodayCommitStats(
  account: GitHubAccount,
  repoFullNames: string[]
): Promise<CommitStats> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const totals: CommitStats = {
    totalCommits: 0,
    linesAdded: 0,
    linesRemoved: 0,
    filesChanged: 0
  };

  for (const repoFullName of repoFullNames) {
    const [owner, repo] = repoFullName.split('/');
    if (!owner || !repo) continue;

    try {
      const stats = await getRepoCommitStats(account, owner, repo, today);
      totals.totalCommits += stats.totalCommits;
      totals.linesAdded += stats.linesAdded;
      totals.linesRemoved += stats.linesRemoved;
      totals.filesChanged += stats.filesChanged;
    } catch (error) {
      // Repo might not be accessible, skip
      console.warn(`Failed to get stats for ${repoFullName}:`, error);
    }
  }

  return totals;
}
