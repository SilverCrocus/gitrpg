import { SupabaseClientService, DbUser, DbBattle, dbUserToBattleFighter } from './supabaseClient';
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

    // Atomically claim this battle (double-accept guard)
    const { data: claimed, error: claimError } = await this.supabase.getClient()
      .from('battles')
      .update({ status: 'accepted' })
      .eq('id', battleId)
      .eq('opponent_id', user.id)
      .eq('status', 'pending')
      .select()
      .single();

    if (claimError || !claimed) {
      return null; // Already accepted or not found
    }

    const { data: challengerUser } = await this.supabase.getClient()
      .from('users')
      .select('*')
      .eq('id', claimed.challenger_id)
      .single();

    const { data: opponentUser } = await this.supabase.getClient()
      .from('users')
      .select('*')
      .eq('id', claimed.opponent_id)
      .single();

    if (!challengerUser || !opponentUser) {
      return null;
    }

    // Create fighters from user data
    const challenger = dbUserToBattleFighter(challengerUser as DbUser) as BattleFighter;
    const opponent = dbUserToBattleFighter(opponentUser as DbUser) as BattleFighter;

    // Run the battle
    const engine = new BattleEngine(challenger, opponent);
    const result = engine.runBattle();

    // Update battle record with engine-calculated rewards
    const { error: updateError } = await this.supabase.getClient()
      .from('battles')
      .update({
        status: 'completed',
        battle_log: result.actions,
        winner_id: result.winner.id,
        rewards: result.rewards,
        completed_at: new Date().toISOString(),
      })
      .eq('id', battleId);

    if (updateError) {
      console.error('Update battle error:', updateError);
    }

    // Apply rewards to winner (full rewards) and loser (25%)
    const winnerId = result.winner.id;
    const loserId = winnerId === challengerUser.id ? opponentUser.id : challengerUser.id;
    const winnerRow = winnerId === challengerUser.id ? challengerUser : opponentUser;
    const loserRow = winnerId === challengerUser.id ? opponentUser : challengerUser;

    const { error: winnerError } = await this.supabase.getClient()
      .from('users')
      .update({
        total_xp: (winnerRow as any).total_xp + result.rewards.xp,
        gold: (winnerRow as any).gold + result.rewards.gold,
      })
      .eq('id', winnerId);

    if (winnerError) {
      console.error('Update winner rewards error:', winnerError);
    }

    const { error: loserError } = await this.supabase.getClient()
      .from('users')
      .update({
        total_xp: (loserRow as any).total_xp + Math.floor(result.rewards.xp * 0.25),
        gold: (loserRow as any).gold + Math.floor(result.rewards.gold * 0.25),
      })
      .eq('id', loserId);

    if (loserError) {
      console.error('Update loser rewards error:', loserError);
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
      .channel(`battle-notifications:${user.id}`)
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
