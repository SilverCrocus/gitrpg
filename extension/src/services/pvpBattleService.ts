import { SupabaseClientService, DbUser, DbBattle } from './supabaseClient';
import { BattleEngine } from './battleEngine';
import type { BattleFighter, BattleResult, CharacterClass } from '../types';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface PvpBattleChallenge {
  id: string;
  challengerId: string;
  challengerName: string;
  challengerClass: string;
  challengerLevel: number;
  createdAt: string;
}

export class PvpBattleService {
  private supabase: SupabaseClientService;
  private battleChannel: RealtimeChannel | null = null;
  private onChallengeCallback: ((challenge: PvpBattleChallenge) => void) | null = null;

  constructor(supabase: SupabaseClientService) {
    this.supabase = supabase;
  }

  async challengeFriend(friendId: string): Promise<{ success: boolean; battleId?: string; error?: string }> {
    if (!this.supabase.isAuthenticated()) {
      return { success: false, error: 'Not authenticated' };
    }

    const user = this.supabase.getCurrentUser();
    if (!user) return { success: false, error: 'No user' };

    // Check for existing pending battle
    const { data: existing } = await this.supabase.getClient()
      .from('battles')
      .select('id')
      .eq('challenger_id', user.id)
      .eq('opponent_id', friendId)
      .eq('status', 'pending')
      .single();

    if (existing) {
      return { success: false, error: 'Challenge already pending' };
    }

    const { data, error } = await this.supabase.getClient()
      .from('battles')
      .insert({
        challenger_id: user.id,
        opponent_id: friendId,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('Challenge friend error:', error);
      return { success: false, error: 'Failed to create challenge' };
    }

    return { success: true, battleId: data.id };
  }

  async getPendingChallenges(): Promise<PvpBattleChallenge[]> {
    if (!this.supabase.isAuthenticated()) {
      return [];
    }

    const user = this.supabase.getCurrentUser();
    if (!user) return [];

    const { data, error } = await this.supabase.getClient()
      .from('battles')
      .select(`
        id,
        challenger_id,
        created_at,
        challenger:users!battles_challenger_id_fkey(
          display_name, character_class, level
        )
      `)
      .eq('opponent_id', user.id)
      .eq('status', 'pending');

    if (error) {
      console.error('Get pending challenges error:', error);
      return [];
    }

    return data.map((b: any) => ({
      id: b.id,
      challengerId: b.challenger_id,
      challengerName: b.challenger.display_name,
      challengerClass: b.challenger.character_class,
      challengerLevel: b.challenger.level,
      createdAt: b.created_at,
    }));
  }

  async acceptChallenge(battleId: string): Promise<BattleResult | null> {
    if (!this.supabase.isAuthenticated()) {
      return null;
    }

    const user = this.supabase.getCurrentUser();
    if (!user) return null;

    // Get battle and both users' data
    const { data: battle, error: battleError } = await this.supabase.getClient()
      .from('battles')
      .select(`
        id,
        challenger_id,
        opponent_id,
        challenger:users!battles_challenger_id_fkey(*),
        opponent:users!battles_opponent_id_fkey(*)
      `)
      .eq('id', battleId)
      .eq('opponent_id', user.id)
      .eq('status', 'pending')
      .single();

    if (battleError || !battle) {
      console.error('Accept challenge error:', battleError);
      return null;
    }

    // Create fighters from user data
    const challengerUser = battle.challenger as unknown as DbUser;
    const opponentUser = battle.opponent as unknown as DbUser;

    const challenger: BattleFighter = {
      id: challengerUser.id,
      name: challengerUser.display_name,
      class: challengerUser.character_class as CharacterClass,
      level: challengerUser.level,
      stats: {
        maxHp: challengerUser.stats_max_hp,
        attack: challengerUser.stats_attack,
        defense: challengerUser.stats_defense,
        speed: challengerUser.stats_speed,
        critChance: challengerUser.stats_crit,
        critDamage: 1.5,
      },
      currentHp: challengerUser.stats_max_hp,
    };

    const opponent: BattleFighter = {
      id: opponentUser.id,
      name: opponentUser.display_name,
      class: opponentUser.character_class as CharacterClass,
      level: opponentUser.level,
      stats: {
        maxHp: opponentUser.stats_max_hp,
        attack: opponentUser.stats_attack,
        defense: opponentUser.stats_defense,
        speed: opponentUser.stats_speed,
        critChance: opponentUser.stats_crit,
        critDamage: 1.5,
      },
      currentHp: opponentUser.stats_max_hp,
    };

    // Run the battle
    const engine = new BattleEngine(challenger, opponent);
    const result = engine.runBattle();

    // Calculate rewards (winner gets full, loser gets 25%)
    const baseXp = 50 + Math.max(challenger.level, opponent.level) * 10;
    const baseGold = 25 + Math.max(challenger.level, opponent.level) * 5;

    // Update battle record
    const { error: updateError } = await this.supabase.getClient()
      .from('battles')
      .update({
        status: 'completed',
        battle_log: result.actions,
        winner_id: result.winner.id,
        rewards: { xp: baseXp, gold: baseGold },
        completed_at: new Date().toISOString(),
      })
      .eq('id', battleId);

    if (updateError) {
      console.error('Update battle error:', updateError);
    }

    return result;
  }

  async declineChallenge(battleId: string): Promise<boolean> {
    if (!this.supabase.isAuthenticated()) {
      return false;
    }

    const user = this.supabase.getCurrentUser();
    if (!user) return false;

    const { error } = await this.supabase.getClient()
      .from('battles')
      .update({ status: 'declined' })
      .eq('id', battleId)
      .eq('opponent_id', user.id);

    return !error;
  }

  async getBattleHistory(): Promise<DbBattle[]> {
    if (!this.supabase.isAuthenticated()) {
      return [];
    }

    const user = this.supabase.getCurrentUser();
    if (!user) return [];

    const { data, error } = await this.supabase.getClient()
      .from('battles')
      .select('*')
      .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Get battle history error:', error);
      return [];
    }

    return data as DbBattle[];
  }

  subscribeToChallenges(onChallenge: (challenge: PvpBattleChallenge) => void): void {
    if (!this.supabase.isAuthenticated()) return;

    const user = this.supabase.getCurrentUser();
    if (!user) return;

    this.onChallengeCallback = onChallenge;

    this.battleChannel = this.supabase.getClient()
      .channel('battle-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'battles',
          filter: `opponent_id=eq.${user.id}`,
        },
        async (payload) => {
          const { data: challenger } = await this.supabase.getClient()
            .from('users')
            .select('display_name, character_class, level')
            .eq('id', payload.new.challenger_id)
            .single();

          if (challenger && this.onChallengeCallback) {
            this.onChallengeCallback({
              id: payload.new.id,
              challengerId: payload.new.challenger_id,
              challengerName: challenger.display_name,
              challengerClass: challenger.character_class,
              challengerLevel: challenger.level,
              createdAt: payload.new.created_at,
            });
          }
        }
      )
      .subscribe();
  }

  unsubscribeFromChallenges(): void {
    if (this.battleChannel) {
      this.supabase.getClient().removeChannel(this.battleChannel);
      this.battleChannel = null;
    }
  }
}
