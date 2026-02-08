import { SupabaseClientService } from './supabaseClient';
import { LocalStateManager } from './localStateManager';
import { Quest, QuestStatus, DAILY_QUEST_TEMPLATES } from '../types';

export const DAILY_QUEST_COUNT = 3;

export class QuestService {
  constructor(private supabase: SupabaseClientService, private stateManager?: LocalStateManager) {}

  /**
   * Get all active quests for the current user
   */
  async getActiveQuests(): Promise<Quest[]> {
    const client = this.supabase.getClient();
    const user = this.supabase.getCurrentUser();
    if (!user) return [];

    const { data, error } = await client
      .from('user_quests')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching quests:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get all quests (including completed) for the current user
   */
  async getAllQuests(): Promise<Quest[]> {
    const client = this.supabase.getClient();
    const user = this.supabase.getCurrentUser();
    if (!user) return [];

    const { data, error } = await client
      .from('user_quests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching quests:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Check if daily quests need to be refreshed and generate new ones if so
   */
  async refreshDailyQuestsIfNeeded(): Promise<Quest[]> {
    const client = this.supabase.getClient();
    const user = this.supabase.getCurrentUser();
    if (!user) return [];

    // Get user's last refresh date
    const { data: userData } = await client
      .from('users')
      .select('last_quest_refresh')
      .eq('id', user.id)
      .single();

    const today = new Date().toISOString().split('T')[0];
    const lastRefresh = userData?.last_quest_refresh;

    if (lastRefresh === today) {
      // Already refreshed today, return existing quests
      return this.getActiveQuests();
    }

    // Delete old daily quests
    await client
      .from('user_quests')
      .delete()
      .eq('user_id', user.id)
      .eq('quest_type', 'daily')
      .in('status', ['active', 'expired']);

    // Generate new daily quests
    const newQuests = this.generateDailyQuests(user.id);

    // Insert new quests
    const { data: insertedQuests, error } = await client
      .from('user_quests')
      .insert(newQuests)
      .select();

    if (error) {
      console.error('Error inserting quests:', error);
      return [];
    }

    // Update last refresh date
    await client
      .from('users')
      .update({ last_quest_refresh: today })
      .eq('id', user.id);

    return insertedQuests || [];
  }

  /**
   * Generate random daily quests from templates
   */
  private generateDailyQuests(userId: string): Omit<Quest, 'id' | 'created_at'>[] {
    const quests: Omit<Quest, 'id' | 'created_at'>[] = [];
    const usedTemplates = new Set<number>();

    // End of day
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    while (quests.length < DAILY_QUEST_COUNT && usedTemplates.size < DAILY_QUEST_TEMPLATES.length) {
      const templateIndex = Math.floor(Math.random() * DAILY_QUEST_TEMPLATES.length);

      if (usedTemplates.has(templateIndex)) continue;
      usedTemplates.add(templateIndex);

      const template = DAILY_QUEST_TEMPLATES[templateIndex];
      if (!template) continue;

      const minTarget = template.targetRange[0];
      const maxTarget = template.targetRange[1];
      const target = Math.floor(Math.random() * (maxTarget - minTarget + 1) + minTarget);

      quests.push({
        user_id: userId,
        quest_type: 'daily',
        title: template.title,
        description: template.description.replace('{target}', target.toString()),
        requirement_type: template.type,
        requirement_target: target,
        requirement_current: 0,
        reward_xp: template.xp,
        reward_gold: template.gold,
        status: 'active',
        expires_at: endOfDay.toISOString(),
        completed_at: null,
      });
    }

    return quests;
  }

  /**
   * Update quest progress based on activity stats
   */
  async updateQuestProgress(stats: { commits: number; linesAdded: number; filesChanged: number }): Promise<Quest[]> {
    const client = this.supabase.getClient();
    const user = this.supabase.getCurrentUser();
    if (!user) return [];

    const activeQuests = await this.getActiveQuests();
    const completedQuests: Quest[] = [];

    for (const quest of activeQuests) {
      let current = quest.requirement_current;

      switch (quest.requirement_type) {
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
          continue;
      }

      const isCompleted = current >= quest.requirement_target;
      const newStatus: QuestStatus = isCompleted ? 'completed' : 'active';

      if (current !== quest.requirement_current || isCompleted) {
        await client
          .from('user_quests')
          .update({
            requirement_current: current,
            status: newStatus,
            completed_at: isCompleted ? new Date().toISOString() : null,
          })
          .eq('id', quest.id);

        if (isCompleted && quest.status !== 'completed') {
          completedQuests.push({ ...quest, requirement_current: current, status: 'completed' });
        }
      }
    }

    return completedQuests;
  }

  /**
   * Claim rewards for a completed quest
   */
  async claimQuestReward(questId: string): Promise<{ xp: number; gold: number } | null> {
    const client = this.supabase.getClient();
    const user = this.supabase.getCurrentUser();
    if (!user) return null;

    // Get the quest
    const { data: quest, error } = await client
      .from('user_quests')
      .select('*')
      .eq('id', questId)
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .single();

    if (error || !quest) {
      console.error('Quest not found or not completed:', error);
      return null;
    }

    // Mark as claimed
    await client
      .from('user_quests')
      .update({ status: 'claimed' })
      .eq('id', questId);

    // Add gold to user
    const { data: userData } = await client
      .from('users')
      .select('gold, total_xp')
      .eq('id', user.id)
      .single();

    const currentGold = userData?.gold || 0;
    const currentXp = userData?.total_xp || 0;

    await client
      .from('users')
      .update({
        gold: currentGold + quest.reward_gold,
        total_xp: currentXp + quest.reward_xp,
      })
      .eq('id', user.id);

    // Update local state
    if (this.stateManager) {
      await this.stateManager.addGold(quest.reward_gold);
      await this.stateManager.addXp(quest.reward_xp);
    }

    return { xp: quest.reward_xp, gold: quest.reward_gold };
  }

  /**
   * Expire old quests that are past their expiration date
   */
  async expireOldQuests(): Promise<void> {
    const client = this.supabase.getClient();
    const user = this.supabase.getCurrentUser();
    if (!user) return;

    const now = new Date().toISOString();

    await client
      .from('user_quests')
      .update({ status: 'expired' })
      .eq('user_id', user.id)
      .eq('status', 'active')
      .lt('expires_at', now);
  }
}
