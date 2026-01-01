import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateDailyQuests,
  checkQuestProgress,
  DAILY_QUEST_COUNT
} from '../../src/services/questService';
import { ActivityStats } from '../../src/services/activityTracker';

describe('questService', () => {
  describe('generateDailyQuests', () => {
    it('should generate the correct number of daily quests', () => {
      const quests = generateDailyQuests();
      expect(quests).toHaveLength(DAILY_QUEST_COUNT);
    });

    it('should give quests unique IDs', () => {
      const quests = generateDailyQuests();
      const ids = quests.map(q => q.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should set quests as active status', () => {
      const quests = generateDailyQuests();
      for (const quest of quests) {
        expect(quest.status).toBe('active');
      }
    });

    it('should set expiration to end of day', () => {
      const quests = generateDailyQuests();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      for (const quest of quests) {
        expect(quest.expiresAt).toBeDefined();
        expect(new Date(quest.expiresAt!).getTime()).toBeLessThanOrEqual(tomorrow.getTime());
      }
    });

    it('should set quest type as daily', () => {
      const quests = generateDailyQuests();
      for (const quest of quests) {
        expect(quest.type).toBe('daily');
      }
    });

    it('should have valid rewards for each quest', () => {
      const quests = generateDailyQuests();
      for (const quest of quests) {
        expect(quest.rewards.xp).toBeGreaterThan(0);
        expect(quest.rewards.gold).toBeGreaterThan(0);
      }
    });

    it('should have requirement with target and current starting at 0', () => {
      const quests = generateDailyQuests();
      for (const quest of quests) {
        expect(quest.requirement.target).toBeGreaterThan(0);
        expect(quest.requirement.current).toBe(0);
      }
    });
  });

  describe('checkQuestProgress', () => {
    it('should update progress based on commits activity stats', () => {
      const quests = generateDailyQuests();
      const commitQuest = quests.find(q => q.requirement.type === 'commits');

      if (commitQuest) {
        const stats: ActivityStats = {
          commits: 5,
          linesAdded: 100,
          linesRemoved: 20,
          filesChanged: 3,
          xpEarned: 0
        };

        const updated = checkQuestProgress(commitQuest, stats);
        expect(updated.requirement.current).toBe(5);
      }
    });

    it('should update progress based on lines_added activity stats', () => {
      const quests = generateDailyQuests();
      const linesQuest = quests.find(q => q.requirement.type === 'lines_added');

      if (linesQuest) {
        const stats: ActivityStats = {
          commits: 2,
          linesAdded: 150,
          linesRemoved: 20,
          filesChanged: 3,
          xpEarned: 0
        };

        const updated = checkQuestProgress(linesQuest, stats);
        expect(updated.requirement.current).toBe(150);
      }
    });

    it('should update progress based on files_changed activity stats', () => {
      const quests = generateDailyQuests();
      const filesQuest = quests.find(q => q.requirement.type === 'files_changed');

      if (filesQuest) {
        const stats: ActivityStats = {
          commits: 2,
          linesAdded: 100,
          linesRemoved: 20,
          filesChanged: 6,
          xpEarned: 0
        };

        const updated = checkQuestProgress(filesQuest, stats);
        expect(updated.requirement.current).toBe(6);
      }
    });

    it('should mark quest as completed when target reached', () => {
      const quests = generateDailyQuests();
      const commitQuest = quests.find(q => q.requirement.type === 'commits');

      if (commitQuest) {
        const stats: ActivityStats = {
          commits: commitQuest.requirement.target + 10, // Exceed target
          linesAdded: 1000,
          linesRemoved: 100,
          filesChanged: 50,
          xpEarned: 0
        };

        const updated = checkQuestProgress(commitQuest, stats);
        expect(updated.status).toBe('completed');
      }
    });

    it('should not change completed quest status', () => {
      const quests = generateDailyQuests();
      const quest = quests[0];
      quest.status = 'completed';

      const stats: ActivityStats = {
        commits: 100,
        linesAdded: 1000,
        linesRemoved: 500,
        filesChanged: 50,
        xpEarned: 0
      };

      const updated = checkQuestProgress(quest, stats);
      expect(updated.status).toBe('completed');
      // Current should not have been updated since quest was already completed
      expect(updated.requirement.current).toBe(quest.requirement.current);
    });

    it('should not change expired quest status', () => {
      const quests = generateDailyQuests();
      const quest = quests[0];
      quest.status = 'expired';

      const stats: ActivityStats = {
        commits: 100,
        linesAdded: 1000,
        linesRemoved: 500,
        filesChanged: 50,
        xpEarned: 0
      };

      const updated = checkQuestProgress(quest, stats);
      expect(updated.status).toBe('expired');
    });
  });
});
