import { describe, it, expect } from 'vitest';
import { parseGitLog, GitRepoStats } from '../../src/services/gitWatcher';

// XP calculation logic - duplicated here for testing since activityTracker.ts
// has dependencies on services that will be created by Workstream A.
// Once Workstream A is complete, these tests can import from activityTracker.ts directly.
interface XpConfig {
  perCommit: number;
  perLineAdded: number;
  perLineRemoved: number;
  perFileChanged: number;
  maxLinesPerCommit: number;
}

const DEFAULT_XP_CONFIG: XpConfig = {
  perCommit: 10,
  perLineAdded: 0.5,
  perLineRemoved: 0.25,
  perFileChanged: 2,
  maxLinesPerCommit: 500
};

function calculateXpFromStats(
  stats: GitRepoStats,
  config: XpConfig = DEFAULT_XP_CONFIG
): number {
  let totalXp = 0;

  for (const commit of stats.commits) {
    const cappedInsertions = Math.min(commit.insertions, config.maxLinesPerCommit);
    const cappedDeletions = Math.min(commit.deletions, config.maxLinesPerCommit);

    totalXp += config.perCommit;
    totalXp += cappedInsertions * config.perLineAdded;
    totalXp += cappedDeletions * config.perLineRemoved;
    totalXp += commit.filesChanged * config.perFileChanged;
  }

  return Math.floor(totalXp);
}

describe('gitWatcher', () => {
  describe('parseGitLog', () => {
    it('should parse a simple commit log', () => {
      const log = `abc123|John Doe|john@example.com|2024-01-01T10:00:00Z|feat: add feature
 3 files changed, 50 insertions(+), 10 deletions(-)`;

      const commits = parseGitLog(log);

      expect(commits).toHaveLength(1);
      expect(commits[0].hash).toBe('abc123');
      expect(commits[0].author).toBe('John Doe');
      expect(commits[0].filesChanged).toBe(3);
      expect(commits[0].insertions).toBe(50);
      expect(commits[0].deletions).toBe(10);
    });

    it('should parse multiple commits', () => {
      const log = `abc123|John|john@example.com|2024-01-01T10:00:00Z|first commit
 1 file changed, 10 insertions(+)
def456|John|john@example.com|2024-01-01T11:00:00Z|second commit
 2 files changed, 20 insertions(+), 5 deletions(-)`;

      const commits = parseGitLog(log);

      expect(commits).toHaveLength(2);
      expect(commits[0].insertions).toBe(10);
      expect(commits[1].insertions).toBe(20);
    });
  });
});

describe('activityTracker', () => {
  describe('calculateXpFromStats', () => {
    it('should calculate XP correctly', () => {
      const stats: GitRepoStats = {
        repoPath: '/test',
        totalCommits: 2,
        totalInsertions: 100,
        totalDeletions: 20,
        totalFilesChanged: 5,
        commits: [
          { hash: '1', author: 'a', email: 'a@a.com', date: new Date(), message: 'm', filesChanged: 3, insertions: 60, deletions: 10 },
          { hash: '2', author: 'a', email: 'a@a.com', date: new Date(), message: 'm', filesChanged: 2, insertions: 40, deletions: 10 }
        ]
      };

      const xp = calculateXpFromStats(stats);

      // 2 commits * 10 = 20
      // 100 lines * 0.5 = 50
      // 20 deletions * 0.25 = 5
      // 5 files * 2 = 10
      // Total = 85
      expect(xp).toBe(85);
    });

    it('should cap lines per commit to prevent gaming', () => {
      const stats: GitRepoStats = {
        repoPath: '/test',
        totalCommits: 1,
        totalInsertions: 10000,
        totalDeletions: 0,
        totalFilesChanged: 1,
        commits: [
          { hash: '1', author: 'a', email: 'a@a.com', date: new Date(), message: 'm', filesChanged: 1, insertions: 10000, deletions: 0 }
        ]
      };

      const xp = calculateXpFromStats(stats);

      // Should cap at 500 lines: 500 * 0.5 = 250 + 10 (commit) + 2 (file) = 262
      expect(xp).toBe(262);
    });
  });
});
