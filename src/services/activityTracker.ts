import { getRepoStats, GitRepoStats, findGitReposInWorkspace } from './gitWatcher';
import { addXpToCharacter } from './characterService';
import { updateUserGold } from './userService';

export interface ActivityStats {
  commits: number;
  linesAdded: number;
  linesRemoved: number;
  filesChanged: number;
  xpEarned: number;
}

export interface XpConfig {
  perCommit: number;
  perLineAdded: number;
  perLineRemoved: number;
  perFileChanged: number;
  maxLinesPerCommit: number; // Cap to prevent gaming
}

export const DEFAULT_XP_CONFIG: XpConfig = {
  perCommit: 10,
  perLineAdded: 0.5,
  perLineRemoved: 0.25,
  perFileChanged: 2,
  maxLinesPerCommit: 500 // Lines beyond this don't count
};

export function calculateXpFromStats(
  stats: GitRepoStats,
  config: XpConfig = DEFAULT_XP_CONFIG
): number {
  let totalXp = 0;

  for (const commit of stats.commits) {
    // Cap lines per commit to prevent gaming
    const cappedInsertions = Math.min(commit.insertions, config.maxLinesPerCommit);
    const cappedDeletions = Math.min(commit.deletions, config.maxLinesPerCommit);

    totalXp += config.perCommit;
    totalXp += cappedInsertions * config.perLineAdded;
    totalXp += cappedDeletions * config.perLineRemoved;
    totalXp += commit.filesChanged * config.perFileChanged;
  }

  return Math.floor(totalXp);
}

export interface TrackedActivity {
  userId: string;
  lastCheckedAt: Date;
  trackedRepos: string[];
  todayStats: ActivityStats;
}

export async function trackActivityForUser(
  userId: string,
  characterId: string,
  workspacePaths: string[],
  authorEmail: string,
  lastCheckedAt: Date
): Promise<ActivityStats> {
  const now = new Date();
  const stats: ActivityStats = {
    commits: 0,
    linesAdded: 0,
    linesRemoved: 0,
    filesChanged: 0,
    xpEarned: 0
  };

  // Find all git repos in workspaces
  const allRepos: string[] = [];
  for (const workspace of workspacePaths) {
    const repos = await findGitReposInWorkspace(workspace);
    allRepos.push(...repos);
  }

  // Get stats from each repo since last check
  for (const repoPath of allRepos) {
    const repoStats = await getRepoStats(repoPath, lastCheckedAt, authorEmail);

    stats.commits += repoStats.totalCommits;
    stats.linesAdded += repoStats.totalInsertions;
    stats.linesRemoved += repoStats.totalDeletions;
    stats.filesChanged += repoStats.totalFilesChanged;

    const xp = calculateXpFromStats(repoStats);
    stats.xpEarned += xp;
  }

  // Award XP to character if any was earned
  if (stats.xpEarned > 0 && characterId) {
    const result = await addXpToCharacter(userId, characterId, stats.xpEarned);

    // Award gold from level ups
    if (result.goldEarned > 0) {
      await updateUserGold(userId, result.goldEarned);
    }
  }

  return stats;
}
