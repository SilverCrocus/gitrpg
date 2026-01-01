import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getDb } from './firebase';
import { Quest, QuestType, QuestRequirement, QuestRewards, UserQuests, DAILY_QUEST_TEMPLATES } from '../types';
import { ActivityStats } from './activityTracker';
import { v4 as uuidv4 } from 'uuid';

export const DAILY_QUEST_COUNT = 3;
const USER_QUESTS_COLLECTION = 'userQuests';

/**
 * Generates a set of random daily quests from templates.
 * Each quest gets a unique ID, random target within the template's range,
 * and is set to expire at end of day.
 */
export function generateDailyQuests(): Quest[] {
  const quests: Quest[] = [];
  const usedTemplates = new Set<number>();

  // Get end of day
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  while (quests.length < DAILY_QUEST_COUNT && usedTemplates.size < DAILY_QUEST_TEMPLATES.length) {
    const templateIndex = Math.floor(Math.random() * DAILY_QUEST_TEMPLATES.length);

    if (usedTemplates.has(templateIndex)) continue;
    usedTemplates.add(templateIndex);

    const template = DAILY_QUEST_TEMPLATES[templateIndex];
    if (!template) continue; // Guard for strict mode

    const minTarget = template.targetRange[0] ?? 1;
    const maxTarget = template.targetRange[1] ?? 10;
    const target = Math.floor(Math.random() * (maxTarget - minTarget + 1) + minTarget);

    quests.push({
      id: uuidv4(),
      type: 'daily',
      title: template.title,
      description: template.description.replace('{target}', target.toString()),
      requirement: {
        type: template.type,
        target,
        current: 0
      },
      rewards: {
        xp: template.xp,
        gold: template.gold
      },
      expiresAt: endOfDay,
      status: 'active'
    });
  }

  return quests;
}

/**
 * Checks and updates quest progress based on activity stats.
 * Returns an updated quest with current progress and potentially completed status.
 */
export function checkQuestProgress(quest: Quest, stats: ActivityStats): Quest {
  // Don't update non-active quests
  if (quest.status !== 'active') return quest;

  let current = 0;

  switch (quest.requirement.type) {
    case 'commits':
      current = stats.commits;
      break;
    case 'lines_added':
      current = stats.linesAdded;
      break;
    case 'files_changed':
      current = stats.filesChanged;
      break;
    default:
      // For other quest types (streak_days, battles_won, reviews_given),
      // we don't track them via ActivityStats
      return quest;
  }

  const updatedQuest = {
    ...quest,
    requirement: {
      ...quest.requirement,
      current
    }
  };

  // Mark as completed if target reached
  if (current >= quest.requirement.target) {
    updatedQuest.status = 'completed';
  }

  return updatedQuest;
}

/**
 * Retrieves the user's quest data from Firestore.
 */
export async function getUserQuests(userId: string): Promise<UserQuests | null> {
  const db = getDb();
  const questsRef = doc(db, USER_QUESTS_COLLECTION, userId);
  const snapshot = await getDoc(questsRef);

  if (!snapshot.exists()) return null;
  return snapshot.data() as UserQuests;
}

/**
 * Initializes quest data for a new user with fresh daily quests.
 */
export async function initializeUserQuests(userId: string): Promise<UserQuests> {
  const db = getDb();
  const questsRef = doc(db, USER_QUESTS_COLLECTION, userId);

  const userQuests: UserQuests = {
    userId,
    activeQuests: generateDailyQuests(),
    completedQuestIds: [],
    lastDailyRefresh: new Date()
  };

  await setDoc(questsRef, {
    ...userQuests,
    lastDailyRefresh: serverTimestamp()
  });

  return userQuests;
}

/**
 * Refreshes daily quests if a new day has started.
 * Returns the user's quests (either existing or newly refreshed).
 */
export async function refreshDailyQuestsIfNeeded(userId: string): Promise<UserQuests> {
  let userQuests = await getUserQuests(userId);

  if (!userQuests) {
    return initializeUserQuests(userId);
  }

  const now = new Date();
  const lastRefresh = new Date(userQuests.lastDailyRefresh);

  // Check if it's a new day
  const isNewDay = now.toDateString() !== lastRefresh.toDateString();

  if (isNewDay) {
    // Generate new daily quests
    const newDailies = generateDailyQuests();

    // Keep non-daily quests (streaks, achievements)
    const keptQuests = userQuests.activeQuests.filter(q => q.type !== 'daily');

    userQuests = {
      ...userQuests,
      activeQuests: [...keptQuests, ...newDailies],
      lastDailyRefresh: now
    };

    const db = getDb();
    const questsRef = doc(db, USER_QUESTS_COLLECTION, userId);
    await updateDoc(questsRef, {
      activeQuests: userQuests.activeQuests,
      lastDailyRefresh: serverTimestamp()
    });
  }

  return userQuests;
}

/**
 * Updates quest progress based on activity stats and returns completed quests with rewards.
 */
export async function updateQuestProgress(
  userId: string,
  stats: ActivityStats
): Promise<{ completedQuests: Quest[]; rewards: QuestRewards }> {
  const userQuests = await refreshDailyQuestsIfNeeded(userId);

  const completedQuests: Quest[] = [];
  let totalXp = 0;
  let totalGold = 0;

  const updatedQuests = userQuests.activeQuests.map(quest => {
    const wasActive = quest.status === 'active';
    const updated = checkQuestProgress(quest, stats);

    if (wasActive && updated.status === 'completed') {
      completedQuests.push(updated);
      totalXp += updated.rewards.xp;
      totalGold += updated.rewards.gold;
    }

    return updated;
  });

  // Save updated quests
  const db = getDb();
  const questsRef = doc(db, USER_QUESTS_COLLECTION, userId);
  await updateDoc(questsRef, {
    activeQuests: updatedQuests,
    completedQuestIds: [
      ...userQuests.completedQuestIds,
      ...completedQuests.map(q => q.id)
    ]
  });

  return {
    completedQuests,
    rewards: { xp: totalXp, gold: totalGold }
  };
}

/**
 * Marks expired quests as expired (for quests past their expiresAt date).
 */
export async function expireOldQuests(userId: string): Promise<void> {
  const userQuests = await getUserQuests(userId);
  if (!userQuests) return;

  const now = new Date();
  let hasChanges = false;

  const updatedQuests = userQuests.activeQuests.map(quest => {
    if (quest.status === 'active' && quest.expiresAt && new Date(quest.expiresAt) < now) {
      hasChanges = true;
      return { ...quest, status: 'expired' as const };
    }
    return quest;
  });

  if (hasChanges) {
    const db = getDb();
    const questsRef = doc(db, USER_QUESTS_COLLECTION, userId);
    await updateDoc(questsRef, {
      activeQuests: updatedQuests
    });
  }
}
