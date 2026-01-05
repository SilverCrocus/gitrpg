import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseClientService } from './supabaseClient';
import { BOSS_DEFINITIONS, createBossInstance, BossInstance, BOSS_REWARDS } from './bossService';
import { BattleFighter } from './battleEngine';

export interface BossBattle {
  id: string;
  player1_id: string;
  player2_id: string | null;
  boss_type: string;
  boss_max_hp: number;
  boss_current_hp: number;
  player1_current_hp: number;
  player2_current_hp: number | null;
  status: 'lobby' | 'ready' | 'in_progress' | 'completed' | 'failed' | 'abandoned';
  battle_log: BattleLogEntry[];
  winner_ids: string[];
  rewards: { xp: number; gold: number } | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface BattleLogEntry {
  turn: number;
  actorType: 'player1' | 'player2' | 'boss';
  actorName: string;
  targetType: 'player1' | 'player2' | 'boss';
  targetName: string;
  damage: number;
  isCrit: boolean;
  resultingHp: number;
  isHeal?: boolean;
}

export interface BossChallenge {
  lobbyId: string;
  challengerId: string;
  challengerName: string;
  bossType: string;
  bossName: string;
}

export class CoopBattleService {
  private supabase: SupabaseClientService;
  private battleSubscription: RealtimeChannel | null = null;
  private challengeSubscription: RealtimeChannel | null = null;

  constructor(supabase: SupabaseClientService) {
    this.supabase = supabase;
  }

  async getDailyBoss(): Promise<string> {
    const client = this.supabase.getClient();
    const { data, error } = await client.rpc('get_daily_boss');

    if (error) {
      console.error('Error getting daily boss:', error);
      // Fallback to local calculation
      const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
      const bossTypes = Object.keys(BOSS_DEFINITIONS);
      return bossTypes[dayOfYear % bossTypes.length];
    }

    return data;
  }

  async canFightBoss(): Promise<boolean> {
    const client = this.supabase.getClient();
    const user = this.supabase.getCurrentUser();
    if (!user) return false;

    const { data } = await client
      .from('users')
      .select('last_boss_win_date')
      .eq('id', user.id)
      .single();

    if (!data?.last_boss_win_date) return true;

    const lastWin = new Date(data.last_boss_win_date);
    const today = new Date();
    return lastWin.toDateString() !== today.toDateString();
  }

  async createBossLobby(friendId: string): Promise<{ success: boolean; lobbyId?: string; error?: string }> {
    const client = this.supabase.getClient();
    const user = this.supabase.getCurrentUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const canFight = await this.canFightBoss();
    if (!canFight) {
      return { success: false, error: 'Already won boss battle today' };
    }

    const bossType = await this.getDailyBoss();
    const bossDefinition = BOSS_DEFINITIONS[bossType];

    // Get player stats to scale boss
    const { data: players } = await client
      .from('users')
      .select('id, level, stats_max_hp')
      .in('id', [user.id, friendId]);

    const avgLevel = players ? players.reduce((sum, p) => sum + p.level, 0) / players.length : 1;
    const boss = createBossInstance(bossType, avgLevel);

    const player1Data = players?.find(p => p.id === user.id);
    const player2Data = players?.find(p => p.id === friendId);
    const player1Hp = player1Data?.stats_max_hp || 100;
    const player2Hp = player2Data?.stats_max_hp || 100;

    const { data, error } = await client
      .from('boss_battles')
      .insert({
        player1_id: user.id,
        player2_id: friendId,
        boss_type: bossType,
        boss_max_hp: boss.maxHp,
        boss_current_hp: boss.currentHp,
        player1_current_hp: player1Hp,
        player2_current_hp: player2Hp,
        status: 'lobby'
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating boss lobby:', error);
      return { success: false, error: 'Failed to create lobby' };
    }

    return { success: true, lobbyId: data.id };
  }

  async joinLobby(lobbyId: string): Promise<{ success: boolean; battle?: BossBattle; error?: string }> {
    const client = this.supabase.getClient();
    const user = this.supabase.getCurrentUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data, error } = await client
      .from('boss_battles')
      .select('*')
      .eq('id', lobbyId)
      .single();

    if (error || !data) {
      return { success: false, error: 'Lobby not found' };
    }

    if (data.player1_id !== user.id && data.player2_id !== user.id) {
      return { success: false, error: 'Not invited to this lobby' };
    }

    return { success: true, battle: data as BossBattle };
  }

  async setReady(lobbyId: string): Promise<boolean> {
    const client = this.supabase.getClient();

    // For simplicity, setting ready just updates status
    // In a full implementation, we'd track ready state per player
    const { error } = await client
      .from('boss_battles')
      .update({ status: 'ready' })
      .eq('id', lobbyId)
      .eq('status', 'lobby');

    return !error;
  }

  async startBattle(lobbyId: string): Promise<{ success: boolean; error?: string }> {
    const client = this.supabase.getClient();

    const { error } = await client
      .from('boss_battles')
      .update({
        status: 'in_progress',
        started_at: new Date().toISOString()
      })
      .eq('id', lobbyId)
      .in('status', ['lobby', 'ready']);

    if (error) {
      return { success: false, error: 'Failed to start battle' };
    }

    return { success: true };
  }

  async executeBattleTurn(
    lobbyId: string,
    player1: BattleFighter,
    player2: BattleFighter | null,
    boss: BossInstance,
    turnNumber: number
  ): Promise<BattleLogEntry[]> {
    const client = this.supabase.getClient();
    const entries: BattleLogEntry[] = [];

    // Player 1 attacks boss
    const p1Damage = this.calculateDamage(player1.stats.attack, boss.defense);
    const p1Crit = Math.random() < player1.stats.critChance;
    const p1FinalDamage = p1Crit ? Math.floor(p1Damage * 1.5) : p1Damage;
    boss.currentHp = Math.max(0, boss.currentHp - p1FinalDamage);

    entries.push({
      turn: turnNumber,
      actorType: 'player1',
      actorName: player1.name,
      targetType: 'boss',
      targetName: boss.definition.name,
      damage: p1FinalDamage,
      isCrit: p1Crit,
      resultingHp: boss.currentHp
    });

    // Player 2 attacks boss (if present and alive)
    if (player2 && player2.currentHp > 0) {
      const p2Damage = this.calculateDamage(player2.stats.attack, boss.defense);
      const p2Crit = Math.random() < player2.stats.critChance;
      const p2FinalDamage = p2Crit ? Math.floor(p2Damage * 1.5) : p2Damage;
      boss.currentHp = Math.max(0, boss.currentHp - p2FinalDamage);

      entries.push({
        turn: turnNumber,
        actorType: 'player2',
        actorName: player2.name,
        targetType: 'boss',
        targetName: boss.definition.name,
        damage: p2FinalDamage,
        isCrit: p2Crit,
        resultingHp: boss.currentHp
      });
    }

    // Boss attacks (if alive)
    if (boss.currentHp > 0) {
      // 70% chance to target lowest HP player, 30% random
      let target: 'player1' | 'player2' = 'player1';
      if (player2 && player2.currentHp > 0) {
        if (Math.random() < 0.7) {
          target = player1.currentHp <= player2.currentHp ? 'player1' : 'player2';
        } else {
          target = Math.random() < 0.5 ? 'player1' : 'player2';
        }
      }

      const targetFighter = target === 'player1' ? player1 : player2!;
      const bossDamage = this.calculateDamage(boss.attack, targetFighter.stats.defense);
      targetFighter.currentHp = Math.max(0, targetFighter.currentHp - bossDamage);

      entries.push({
        turn: turnNumber,
        actorType: 'boss',
        actorName: boss.definition.name,
        targetType: target,
        targetName: targetFighter.name,
        damage: bossDamage,
        isCrit: false,
        resultingHp: targetFighter.currentHp
      });

      // Necromancer heals every 3 turns
      if (boss.definition.id === 'necromancer' && turnNumber % 3 === 0) {
        const healAmount = 50;
        boss.currentHp = Math.min(boss.maxHp, boss.currentHp + healAmount);
        entries.push({
          turn: turnNumber,
          actorType: 'boss',
          actorName: boss.definition.name,
          targetType: 'boss',
          targetName: boss.definition.name,
          damage: healAmount,
          isCrit: false,
          resultingHp: boss.currentHp,
          isHeal: true
        });
      }
    }

    return entries;
  }

  private calculateDamage(attack: number, defense: number): number {
    const baseDamage = attack - (defense / 2);
    const variance = 0.9 + Math.random() * 0.2;
    return Math.max(1, Math.floor(baseDamage * variance));
  }

  async updateBattleState(
    lobbyId: string,
    bossHp: number,
    player1Hp: number,
    player2Hp: number | null,
    newLogEntries: BattleLogEntry[]
  ): Promise<void> {
    const client = this.supabase.getClient();

    // Get current battle log
    const { data: current, error: fetchError } = await client
      .from('boss_battles')
      .select('battle_log')
      .eq('id', lobbyId)
      .single();

    if (fetchError) {
      console.error('Error fetching battle log:', fetchError);
      throw new Error('Failed to fetch battle state');
    }

    const currentLog = (current?.battle_log || []) as BattleLogEntry[];
    const updatedLog = [...currentLog, ...newLogEntries];

    const { error: updateError } = await client
      .from('boss_battles')
      .update({
        boss_current_hp: bossHp,
        player1_current_hp: player1Hp,
        player2_current_hp: player2Hp,
        battle_log: updatedLog
      })
      .eq('id', lobbyId);

    if (updateError) {
      console.error('Error updating battle state:', updateError);
      throw new Error('Failed to update battle state');
    }
  }

  async completeBattle(
    lobbyId: string,
    won: boolean,
    winnerIds: string[],
    isCoop: boolean
  ): Promise<{ xp: number; gold: number }> {
    const client = this.supabase.getClient();

    let rewards: { xp: number; gold: number };
    if (won) {
      const multiplier = isCoop ? BOSS_REWARDS.coopMultiplier : 1;
      rewards = {
        xp: Math.floor(BOSS_REWARDS.baseXp * multiplier),
        gold: Math.floor(BOSS_REWARDS.baseGold * multiplier)
      };

      // Mark winners as having won today
      for (const id of winnerIds) {
        await client
          .from('users')
          .update({ last_boss_win_date: new Date().toISOString().split('T')[0] })
          .eq('id', id);
      }
    } else {
      rewards = {
        xp: BOSS_REWARDS.lossXp,
        gold: BOSS_REWARDS.lossGold
      };
    }

    await client
      .from('boss_battles')
      .update({
        status: won ? 'completed' : 'failed',
        winner_ids: winnerIds,
        rewards,
        completed_at: new Date().toISOString()
      })
      .eq('id', lobbyId);

    return rewards;
  }

  subscribeToBattle(
    lobbyId: string,
    onUpdate: (battle: BossBattle) => void
  ): void {
    const client = this.supabase.getClient();

    this.battleSubscription = client
      .channel(`boss_battle:${lobbyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'boss_battles',
          filter: `id=eq.${lobbyId}`
        },
        (payload) => {
          onUpdate(payload.new as BossBattle);
        }
      )
      .subscribe();
  }

  unsubscribeFromBattle(): void {
    if (this.battleSubscription) {
      this.battleSubscription.unsubscribe();
      this.battleSubscription = null;
    }
  }

  subscribeToChallenges(onChallenge: (challenge: BossChallenge) => void): void {
    const client = this.supabase.getClient();
    const user = this.supabase.getCurrentUser();
    if (!user) return;

    this.challengeSubscription = client
      .channel('boss_challenges')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'boss_battles',
          filter: `player2_id=eq.${user.id}`
        },
        async (payload) => {
          const battle = payload.new as BossBattle;

          // Get challenger info
          const { data: challenger } = await client
            .from('users')
            .select('display_name')
            .eq('id', battle.player1_id)
            .single();

          const bossDefinition = BOSS_DEFINITIONS[battle.boss_type];

          onChallenge({
            lobbyId: battle.id,
            challengerId: battle.player1_id,
            challengerName: challenger?.display_name || 'Unknown',
            bossType: battle.boss_type,
            bossName: bossDefinition?.name || 'Unknown Boss'
          });
        }
      )
      .subscribe();
  }

  unsubscribeFromChallenges(): void {
    if (this.challengeSubscription) {
      this.challengeSubscription.unsubscribe();
      this.challengeSubscription = null;
    }
  }
}
