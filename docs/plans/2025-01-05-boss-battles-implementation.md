# Co-op Boss Battles Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. After each Phase, run code-reviewer agent before proceeding.

**Goal:** Add synchronous co-op boss battles where two friends fight a daily boss together in real-time.

**Architecture:** Server-based battles via Supabase real-time. One client runs battle logic and pushes state updates; both clients subscribe and render identical UI. Daily boss rotation with 6 boss types.

**Tech Stack:** TypeScript, Supabase (Postgres + Realtime), VS Code Webview API

---

## Phase 1: Database Schema

### Task 1.1: Create boss_battles table

**Files:**
- Create via Supabase MCP tool

**Step 1: Create the table**

Run Supabase MCP `apply_migration`:
```sql
CREATE TABLE boss_battles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player2_id UUID REFERENCES users(id) ON DELETE CASCADE,
  boss_type TEXT NOT NULL,
  boss_max_hp INTEGER NOT NULL,
  boss_current_hp INTEGER NOT NULL,
  player1_current_hp INTEGER NOT NULL,
  player2_current_hp INTEGER,
  status TEXT NOT NULL DEFAULT 'lobby',
  battle_log JSONB DEFAULT '[]'::jsonb,
  winner_ids UUID[] DEFAULT '{}',
  rewards JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  CONSTRAINT valid_status CHECK (status IN ('lobby', 'ready', 'in_progress', 'completed', 'failed', 'abandoned'))
);

CREATE INDEX idx_boss_battles_player1 ON boss_battles(player1_id);
CREATE INDEX idx_boss_battles_player2 ON boss_battles(player2_id);
CREATE INDEX idx_boss_battles_status ON boss_battles(status);

ALTER TABLE boss_battles ENABLE ROW LEVEL SECURITY;

-- Players can view battles they're part of
CREATE POLICY "Users can view own boss battles"
  ON boss_battles FOR SELECT
  USING (auth.uid() = player1_id OR auth.uid() = player2_id);

-- Players can create battles
CREATE POLICY "Users can create boss battles"
  ON boss_battles FOR INSERT
  WITH CHECK (auth.uid() = player1_id);

-- Players can update battles they're in
CREATE POLICY "Users can update own boss battles"
  ON boss_battles FOR UPDATE
  USING (auth.uid() = player1_id OR auth.uid() = player2_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE boss_battles;
```

**Step 2: Verify table created**

Run Supabase MCP `list_tables` and confirm `boss_battles` exists.

---

### Task 1.2: Create daily_boss table

**Step 1: Create the table**

Run Supabase MCP `apply_migration`:
```sql
CREATE TABLE daily_boss (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
  boss_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function to get or create today's boss
CREATE OR REPLACE FUNCTION get_daily_boss()
RETURNS TEXT AS $$
DECLARE
  boss_types TEXT[] := ARRAY['dragon', 'golem', 'shadow_knight', 'slime_king', 'necromancer', 'forest_guardian'];
  today_boss TEXT;
  day_index INTEGER;
BEGIN
  -- Check if today's boss exists
  SELECT boss_type INTO today_boss FROM daily_boss WHERE date = CURRENT_DATE;

  IF today_boss IS NULL THEN
    -- Calculate boss based on day of year (cycles through 6 bosses)
    day_index := (EXTRACT(DOY FROM CURRENT_DATE)::INTEGER % 6) + 1;
    today_boss := boss_types[day_index];

    -- Insert today's boss
    INSERT INTO daily_boss (date, boss_type) VALUES (CURRENT_DATE, today_boss)
    ON CONFLICT (date) DO NOTHING;
  END IF;

  RETURN today_boss;
END;
$$ LANGUAGE plpgsql;

-- RLS policies
ALTER TABLE daily_boss ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read daily boss"
  ON daily_boss FOR SELECT
  USING (true);
```

**Step 2: Verify function works**

Run Supabase MCP `execute_sql`:
```sql
SELECT get_daily_boss();
```

---

### Task 1.3: Add last_boss_win_date to users

**Step 1: Add column**

Run Supabase MCP `apply_migration`:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_boss_win_date DATE;
```

**Step 2: Verify column added**

Run Supabase MCP `get_table_schema` for users table.

---

### Task 1.4: Code Review Phase 1

**Action:** Run `superpowers:code-reviewer` agent to review database schema changes.

---

## Phase 2: Boss Service

### Task 2.1: Create boss definitions

**Files:**
- Create: `extension/src/services/bossService.ts`

**Step 1: Create the boss service file**

```typescript
import type { CharacterStats } from '../types';

export interface BossDefinition {
  id: string;
  name: string;
  baseHp: number;
  baseAttack: number;
  baseDefense: number;
  baseSpeed: number;
  specialTrait: string;
  description: string;
}

export interface BossInstance {
  definition: BossDefinition;
  currentHp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  level: number;
}

export const BOSS_DEFINITIONS: Record<string, BossDefinition> = {
  dragon: {
    id: 'dragon',
    name: 'Ancient Dragon',
    baseHp: 500,
    baseAttack: 45,
    baseDefense: 20,
    baseSpeed: 30,
    specialTrait: 'Can land critical hits',
    description: 'A fearsome fire-breathing beast'
  },
  golem: {
    id: 'golem',
    name: 'Stone Golem',
    baseHp: 600,
    baseAttack: 25,
    baseDefense: 40,
    baseSpeed: 10,
    specialTrait: 'High defense, slow',
    description: 'An ancient stone guardian'
  },
  shadow_knight: {
    id: 'shadow_knight',
    name: 'Shadow Knight',
    baseHp: 450,
    baseAttack: 35,
    baseDefense: 30,
    baseSpeed: 35,
    specialTrait: 'Balanced and fast',
    description: 'A dark warrior from the void'
  },
  slime_king: {
    id: 'slime_king',
    name: 'Slime King',
    baseHp: 800,
    baseAttack: 15,
    baseDefense: 15,
    baseSpeed: 20,
    specialTrait: 'Massive HP pool',
    description: 'The royal blob of goo'
  },
  necromancer: {
    id: 'necromancer',
    name: 'Necromancer',
    baseHp: 400,
    baseAttack: 40,
    baseDefense: 15,
    baseSpeed: 25,
    specialTrait: 'Heals 50 HP every 3 turns',
    description: 'Master of dark magic'
  },
  forest_guardian: {
    id: 'forest_guardian',
    name: 'Forest Guardian',
    baseHp: 550,
    baseAttack: 30,
    baseDefense: 35,
    baseSpeed: 15,
    specialTrait: 'Nature\'s protector',
    description: 'Ancient spirit of the woods'
  }
};

export function createBossInstance(bossType: string, averagePlayerLevel: number): BossInstance {
  const definition = BOSS_DEFINITIONS[bossType];
  if (!definition) {
    throw new Error(`Unknown boss type: ${bossType}`);
  }

  // Scale boss stats with player level
  const levelScale = 1 + (averagePlayerLevel * 0.1);
  const bossLevel = Math.max(1, Math.floor(averagePlayerLevel * 1.2));

  return {
    definition,
    level: bossLevel,
    maxHp: Math.floor(definition.baseHp * levelScale),
    currentHp: Math.floor(definition.baseHp * levelScale),
    attack: Math.floor(definition.baseAttack * levelScale),
    defense: Math.floor(definition.baseDefense * levelScale),
    speed: Math.floor(definition.baseSpeed * levelScale)
  };
}

export function getBossEmoji(bossType: string): string {
  const emojis: Record<string, string> = {
    dragon: '🐉',
    golem: '🗿',
    shadow_knight: '⚔️',
    slime_king: '👑',
    necromancer: '💀',
    forest_guardian: '🌳'
  };
  return emojis[bossType] || '👹';
}

export const BOSS_REWARDS = {
  baseXp: 150,
  baseGold: 75,
  coopMultiplier: 1.5,
  levelBonusXp: 20,
  lossXp: 25,
  lossGold: 10
};
```

**Step 2: Verify file compiles**

Run: `cd extension && npm run compile`
Expected: No errors

**Step 3: Commit**

```bash
git add extension/src/services/bossService.ts
git commit -m "feat: add boss definitions and service"
```

---

### Task 2.2: Create co-op battle service

**Files:**
- Create: `extension/src/services/coopBattleService.ts`

**Step 1: Create the service file**

```typescript
import { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseClientService } from './supabaseClient';
import { BOSS_DEFINITIONS, createBossInstance, BossInstance, BOSS_REWARDS } from './bossService';
import { BattleEngine, BattleFighter } from './battleEngine';

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
  odea: string;
  odea
  odea: string;
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
      .select('level, stats_max_hp')
      .in('id', [user.id, friendId]);

    const avgLevel = players ? players.reduce((sum, p) => sum + p.level, 0) / players.length : 1;
    const boss = createBossInstance(bossType, avgLevel);

    const player1Hp = players?.find(p => true)?.stats_max_hp || 100;
    const player2Hp = players?.find((_, i) => i === 1)?.stats_max_hp || 100;

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
    const { data: current } = await client
      .from('boss_battles')
      .select('battle_log')
      .eq('id', lobbyId)
      .single();

    const currentLog = (current?.battle_log || []) as BattleLogEntry[];
    const updatedLog = [...currentLog, ...newLogEntries];

    await client
      .from('boss_battles')
      .update({
        boss_current_hp: bossHp,
        player1_current_hp: player1Hp,
        player2_current_hp: player2Hp,
        battle_log: updatedLog
      })
      .eq('id', lobbyId);
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
      for (const odea of winnerIds) {
        await client
          .from('users')
          .update({ last_boss_win_date: new Date().toISOString().split('T')[0] })
          .eq('id', odea);
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
            odea: battle.id,
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
```

**Step 2: Verify file compiles**

Run: `cd extension && npm run compile`
Expected: No errors

**Step 3: Commit**

```bash
git add extension/src/services/coopBattleService.ts
git commit -m "feat: add co-op battle service with real-time sync"
```

---

### Task 2.3: Code Review Phase 2

**Action:** Run `superpowers:code-reviewer` agent to review bossService.ts and coopBattleService.ts.

---

## Phase 3: Boss SVG Sprites

### Task 3.1: Create boss sprites directory

**Step 1: Create directory**

```bash
mkdir -p extension/media/sprites/bosses
```

**Step 2: Commit**

```bash
git add extension/media/sprites/bosses/.gitkeep
git commit -m "chore: add bosses sprite directory"
```

---

### Task 3.2: Create Dragon SVG

**Files:**
- Create: `extension/media/sprites/bosses/dragon.svg`

**Step 1: Create the SVG**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <!-- Body -->
  <ellipse cx="64" cy="75" rx="35" ry="25" fill="#c0392b"/>
  <!-- Neck -->
  <path d="M50 60 Q40 40 45 25" stroke="#c0392b" stroke-width="12" fill="none" stroke-linecap="round"/>
  <!-- Head -->
  <ellipse cx="48" cy="22" rx="18" ry="14" fill="#e74c3c"/>
  <!-- Snout -->
  <ellipse cx="35" cy="25" rx="10" ry="6" fill="#c0392b"/>
  <!-- Eye -->
  <circle cx="52" cy="18" r="4" fill="#f1c40f"/>
  <circle cx="53" cy="17" r="2" fill="#000"/>
  <!-- Horns -->
  <path d="M58 12 L65 2 L62 14" fill="#7f8c8d"/>
  <path d="M48 10 L50 0 L52 12" fill="#7f8c8d"/>
  <!-- Wings -->
  <path d="M55 55 Q30 30 20 50 Q35 45 45 60" fill="#922b21"/>
  <path d="M75 55 Q100 30 108 50 Q93 45 83 60" fill="#922b21"/>
  <!-- Wing details -->
  <path d="M25 48 L40 55" stroke="#7f1d1d" stroke-width="1"/>
  <path d="M30 45 L42 55" stroke="#7f1d1d" stroke-width="1"/>
  <path d="M103 48 L88 55" stroke="#7f1d1d" stroke-width="1"/>
  <path d="M98 45 L86 55" stroke="#7f1d1d" stroke-width="1"/>
  <!-- Legs -->
  <ellipse cx="45" cy="95" rx="8" ry="12" fill="#a93226"/>
  <ellipse cx="83" cy="95" rx="8" ry="12" fill="#a93226"/>
  <!-- Claws -->
  <path d="M40 105 L38 112 M45 105 L45 113 M50 105 L52 112" stroke="#7f8c8d" stroke-width="2" stroke-linecap="round"/>
  <path d="M78 105 L76 112 M83 105 L83 113 M88 105 L90 112" stroke="#7f8c8d" stroke-width="2" stroke-linecap="round"/>
  <!-- Tail -->
  <path d="M95 75 Q115 80 120 70 Q125 60 118 55" stroke="#c0392b" stroke-width="10" fill="none" stroke-linecap="round"/>
  <path d="M118 55 L125 48 L120 58 L127 55 L119 60" fill="#e74c3c"/>
  <!-- Fire breath -->
  <ellipse cx="22" cy="30" rx="8" ry="5" fill="#f39c12" opacity="0.8"/>
  <ellipse cx="15" cy="32" rx="5" ry="3" fill="#e74c3c" opacity="0.6"/>
  <!-- Belly scales -->
  <ellipse cx="64" cy="80" rx="20" ry="12" fill="#e74c3c"/>
  <path d="M50 75 Q64 70 78 75" stroke="#c0392b" stroke-width="1" fill="none"/>
  <path d="M52 80 Q64 76 76 80" stroke="#c0392b" stroke-width="1" fill="none"/>
  <path d="M54 85 Q64 82 74 85" stroke="#c0392b" stroke-width="1" fill="none"/>
</svg>
```

**Step 2: Commit**

```bash
git add extension/media/sprites/bosses/dragon.svg
git commit -m "art: add dragon boss sprite"
```

---

### Task 3.3: Create Golem SVG

**Files:**
- Create: `extension/media/sprites/bosses/golem.svg`

**Step 1: Create the SVG**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <!-- Body -->
  <rect x="34" y="45" width="60" height="55" rx="8" fill="#7f8c8d"/>
  <!-- Body cracks -->
  <path d="M45 50 L50 70 L45 90" stroke="#5d6d7e" stroke-width="2" fill="none"/>
  <path d="M85 55 L78 75 L82 95" stroke="#5d6d7e" stroke-width="2" fill="none"/>
  <!-- Head -->
  <rect x="42" y="20" width="44" height="30" rx="6" fill="#95a5a6"/>
  <!-- Eyes (glowing) -->
  <rect x="50" y="28" width="10" height="8" rx="2" fill="#f39c12"/>
  <rect x="68" y="28" width="10" height="8" rx="2" fill="#f39c12"/>
  <!-- Eye glow -->
  <rect x="52" y="30" width="6" height="4" fill="#f1c40f"/>
  <rect x="70" y="30" width="6" height="4" fill="#f1c40f"/>
  <!-- Mouth -->
  <rect x="54" y="40" width="20" height="6" rx="2" fill="#5d6d7e"/>
  <!-- Left Arm -->
  <rect x="14" y="50" width="22" height="16" rx="4" fill="#7f8c8d"/>
  <rect x="10" y="62" width="18" height="25" rx="4" fill="#95a5a6"/>
  <!-- Left fist -->
  <rect x="8" y="85" width="22" height="18" rx="4" fill="#7f8c8d"/>
  <!-- Right Arm -->
  <rect x="92" y="50" width="22" height="16" rx="4" fill="#7f8c8d"/>
  <rect x="100" y="62" width="18" height="25" rx="4" fill="#95a5a6"/>
  <!-- Right fist -->
  <rect x="98" y="85" width="22" height="18" rx="4" fill="#7f8c8d"/>
  <!-- Legs -->
  <rect x="38" y="98" width="20" height="25" rx="4" fill="#7f8c8d"/>
  <rect x="70" y="98" width="20" height="25" rx="4" fill="#7f8c8d"/>
  <!-- Feet -->
  <rect x="35" y="118" width="26" height="8" rx="3" fill="#5d6d7e"/>
  <rect x="67" y="118" width="26" height="8" rx="3" fill="#5d6d7e"/>
  <!-- Runes/magic symbols -->
  <circle cx="64" cy="70" r="12" stroke="#3498db" stroke-width="2" fill="none" opacity="0.7"/>
  <path d="M58 70 L64 62 L70 70 L64 78 Z" stroke="#3498db" stroke-width="1.5" fill="none" opacity="0.7"/>
  <!-- Shoulder stones -->
  <circle cx="36" cy="48" r="8" fill="#5d6d7e"/>
  <circle cx="92" cy="48" r="8" fill="#5d6d7e"/>
  <!-- Head cracks -->
  <path d="M50 22 L55 35" stroke="#5d6d7e" stroke-width="1.5" fill="none"/>
  <path d="M78 22 L73 32" stroke="#5d6d7e" stroke-width="1.5" fill="none"/>
</svg>
```

**Step 2: Commit**

```bash
git add extension/media/sprites/bosses/golem.svg
git commit -m "art: add golem boss sprite"
```

---

### Task 3.4: Create Shadow Knight SVG

**Files:**
- Create: `extension/media/sprites/bosses/shadow-knight.svg`

**Step 1: Create the SVG**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <!-- Cape -->
  <path d="M30 40 Q25 80 35 120 L64 110 L93 120 Q103 80 98 40" fill="#1a1a2e"/>
  <!-- Body armor -->
  <path d="M40 45 L64 40 L88 45 L90 85 L64 90 L38 85 Z" fill="#2c3e50"/>
  <!-- Chest plate -->
  <path d="M48 50 L64 46 L80 50 L82 75 L64 80 L46 75 Z" fill="#34495e"/>
  <!-- Chest emblem -->
  <circle cx="64" cy="62" r="8" fill="#9b59b6" opacity="0.8"/>
  <path d="M64 56 L68 62 L64 68 L60 62 Z" fill="#8e44ad"/>
  <!-- Helmet -->
  <path d="M44 20 L64 15 L84 20 L86 42 L64 45 L42 42 Z" fill="#2c3e50"/>
  <!-- Helmet visor -->
  <rect x="48" y="28" width="32" height="10" rx="2" fill="#1a1a2e"/>
  <!-- Glowing eyes -->
  <circle cx="54" cy="33" r="3" fill="#e74c3c"/>
  <circle cx="74" cy="33" r="3" fill="#e74c3c"/>
  <!-- Eye glow effect -->
  <circle cx="54" cy="33" r="5" fill="#e74c3c" opacity="0.3"/>
  <circle cx="74" cy="33" r="5" fill="#e74c3c" opacity="0.3"/>
  <!-- Helmet horns -->
  <path d="M44 22 L38 8 L46 20" fill="#2c3e50"/>
  <path d="M84 22 L90 8 L82 20" fill="#2c3e50"/>
  <!-- Left arm -->
  <rect x="28" y="48" width="14" height="35" rx="3" fill="#34495e"/>
  <!-- Left gauntlet -->
  <rect x="26" y="80" width="18" height="12" rx="2" fill="#2c3e50"/>
  <!-- Right arm -->
  <rect x="86" y="48" width="14" height="35" rx="3" fill="#34495e"/>
  <!-- Right gauntlet -->
  <rect x="84" y="80" width="18" height="12" rx="2" fill="#2c3e50"/>
  <!-- Sword -->
  <rect x="100" y="30" width="4" height="60" fill="#7f8c8d"/>
  <rect x="98" y="85" width="8" height="12" rx="1" fill="#5d4e37"/>
  <path d="M102 30 L102 20 L100 25 L104 25 Z" fill="#bdc3c7"/>
  <!-- Sword glow -->
  <rect x="100" y="30" width="4" height="60" fill="#9b59b6" opacity="0.3"/>
  <!-- Legs -->
  <rect x="46" y="88" width="14" height="30" rx="3" fill="#2c3e50"/>
  <rect x="68" y="88" width="14" height="30" rx="3" fill="#2c3e50"/>
  <!-- Boots -->
  <path d="M44 115 L42 125 L62 125 L60 115" fill="#1a1a2e"/>
  <path d="M68 115 L66 125 L86 125 L84 115" fill="#1a1a2e"/>
  <!-- Shadow aura -->
  <ellipse cx="64" cy="122" rx="35" ry="6" fill="#1a1a2e" opacity="0.5"/>
</svg>
```

**Step 2: Commit**

```bash
git add extension/media/sprites/bosses/shadow-knight.svg
git commit -m "art: add shadow knight boss sprite"
```

---

### Task 3.5: Create Slime King SVG

**Files:**
- Create: `extension/media/sprites/bosses/slime-king.svg`

**Step 1: Create the SVG**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <!-- Shadow -->
  <ellipse cx="64" cy="118" rx="45" ry="8" fill="#1a5276" opacity="0.4"/>
  <!-- Main body -->
  <ellipse cx="64" cy="78" rx="50" ry="40" fill="#3498db"/>
  <!-- Body highlight -->
  <ellipse cx="50" cy="65" rx="20" ry="15" fill="#5dade2" opacity="0.6"/>
  <!-- Body shine -->
  <ellipse cx="42" cy="58" rx="8" ry="6" fill="#85c1e9" opacity="0.7"/>
  <!-- Crown -->
  <path d="M40 35 L45 20 L55 30 L64 15 L73 30 L83 20 L88 35 L85 40 L43 40 Z" fill="#f1c40f"/>
  <!-- Crown jewels -->
  <circle cx="64" cy="30" r="4" fill="#e74c3c"/>
  <circle cx="50" cy="33" r="3" fill="#9b59b6"/>
  <circle cx="78" cy="33" r="3" fill="#9b59b6"/>
  <!-- Crown base -->
  <rect x="43" y="38" width="42" height="6" rx="2" fill="#d4ac0d"/>
  <!-- Eyes -->
  <ellipse cx="50" cy="65" rx="10" ry="12" fill="white"/>
  <ellipse cx="78" cy="65" rx="10" ry="12" fill="white"/>
  <!-- Pupils -->
  <ellipse cx="52" cy="67" rx="5" ry="6" fill="#2c3e50"/>
  <ellipse cx="80" cy="67" rx="5" ry="6" fill="#2c3e50"/>
  <!-- Eye shine -->
  <circle cx="48" cy="63" r="3" fill="white"/>
  <circle cx="76" cy="63" r="3" fill="white"/>
  <!-- Smile -->
  <path d="M50 85 Q64 95 78 85" stroke="#2980b9" stroke-width="3" fill="none" stroke-linecap="round"/>
  <!-- Cheeks -->
  <ellipse cx="38" cy="80" rx="6" ry="4" fill="#f8b4d9" opacity="0.5"/>
  <ellipse cx="90" cy="80" rx="6" ry="4" fill="#f8b4d9" opacity="0.5"/>
  <!-- Slime drips -->
  <ellipse cx="25" cy="100" rx="8" ry="12" fill="#3498db" opacity="0.8"/>
  <ellipse cx="103" cy="105" rx="6" ry="10" fill="#3498db" opacity="0.8"/>
  <ellipse cx="40" cy="112" rx="5" ry="8" fill="#3498db" opacity="0.7"/>
  <ellipse cx="88" cy="114" rx="4" ry="6" fill="#3498db" opacity="0.7"/>
  <!-- Bubbles -->
  <circle cx="85" cy="55" r="4" fill="#85c1e9" opacity="0.6"/>
  <circle cx="92" cy="70" r="3" fill="#85c1e9" opacity="0.5"/>
  <circle cx="30" cy="75" r="3" fill="#85c1e9" opacity="0.5"/>
</svg>
```

**Step 2: Commit**

```bash
git add extension/media/sprites/bosses/slime-king.svg
git commit -m "art: add slime king boss sprite"
```

---

### Task 3.6: Create Necromancer SVG

**Files:**
- Create: `extension/media/sprites/bosses/necromancer.svg`

**Step 1: Create the SVG**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <!-- Robe bottom -->
  <path d="M30 70 Q25 100 30 125 L98 125 Q103 100 98 70" fill="#1a1a2e"/>
  <!-- Robe body -->
  <path d="M38 45 L64 40 L90 45 L95 75 L64 80 L33 75 Z" fill="#2d2d44"/>
  <!-- Hood -->
  <path d="M35 25 Q64 10 93 25 Q95 50 64 55 Q33 50 35 25" fill="#1a1a2e"/>
  <!-- Hood shadow/depth -->
  <path d="M40 30 Q64 18 88 30 Q90 48 64 52 Q38 48 40 30" fill="#0d0d1a"/>
  <!-- Skull face -->
  <ellipse cx="64" cy="42" rx="16" ry="18" fill="#ecf0f1"/>
  <!-- Eye sockets -->
  <ellipse cx="56" cy="38" rx="6" ry="7" fill="#1a1a2e"/>
  <ellipse cx="72" cy="38" rx="6" ry="7" fill="#1a1a2e"/>
  <!-- Glowing eyes -->
  <circle cx="56" cy="38" r="3" fill="#9b59b6"/>
  <circle cx="72" cy="38" r="3" fill="#9b59b6"/>
  <!-- Eye glow -->
  <circle cx="56" cy="38" r="5" fill="#9b59b6" opacity="0.4"/>
  <circle cx="72" cy="38" r="5" fill="#9b59b6" opacity="0.4"/>
  <!-- Nose hole -->
  <path d="M62 45 L64 48 L66 45" fill="#1a1a2e"/>
  <!-- Teeth -->
  <rect x="54" y="52" width="4" height="5" fill="#ecf0f1"/>
  <rect x="59" y="52" width="4" height="5" fill="#ecf0f1"/>
  <rect x="64" y="52" width="4" height="5" fill="#ecf0f1"/>
  <rect x="69" y="52" width="4" height="5" fill="#ecf0f1"/>
  <!-- Left arm/sleeve -->
  <path d="M33 50 Q20 60 15 80 Q18 85 25 82 Q28 65 38 55" fill="#2d2d44"/>
  <!-- Right arm/sleeve -->
  <path d="M95 50 Q108 60 113 80 Q110 85 103 82 Q100 65 90 55" fill="#2d2d44"/>
  <!-- Skeletal hands -->
  <g fill="#ecf0f1">
    <!-- Left hand -->
    <rect x="12" y="78" width="3" height="12" rx="1"/>
    <rect x="16" y="76" width="3" height="14" rx="1"/>
    <rect x="20" y="78" width="3" height="12" rx="1"/>
    <rect x="24" y="80" width="3" height="10" rx="1"/>
    <!-- Right hand -->
    <rect x="101" y="78" width="3" height="12" rx="1"/>
    <rect x="105" y="76" width="3" height="14" rx="1"/>
    <rect x="109" y="78" width="3" height="12" rx="1"/>
    <rect x="113" y="80" width="3" height="10" rx="1"/>
  </g>
  <!-- Staff -->
  <rect x="105" y="20" width="4" height="100" fill="#5d4e37"/>
  <!-- Staff orb -->
  <circle cx="107" cy="18" r="10" fill="#9b59b6"/>
  <circle cx="107" cy="18" r="14" fill="#9b59b6" opacity="0.3"/>
  <circle cx="104" cy="15" r="3" fill="#d4b5e9" opacity="0.6"/>
  <!-- Magic particles -->
  <circle cx="20" cy="90" r="2" fill="#9b59b6" opacity="0.7"/>
  <circle cx="108" cy="95" r="2" fill="#9b59b6" opacity="0.7"/>
  <circle cx="95" cy="100" r="1.5" fill="#9b59b6" opacity="0.5"/>
  <circle cx="35" cy="95" r="1.5" fill="#9b59b6" opacity="0.5"/>
  <!-- Robe trim -->
  <path d="M30 125 L98 125" stroke="#9b59b6" stroke-width="2"/>
</svg>
```

**Step 2: Commit**

```bash
git add extension/media/sprites/bosses/necromancer.svg
git commit -m "art: add necromancer boss sprite"
```

---

### Task 3.7: Create Forest Guardian SVG

**Files:**
- Create: `extension/media/sprites/bosses/forest-guardian.svg`

**Step 1: Create the SVG**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <!-- Roots/base -->
  <path d="M35 110 Q30 120 25 125 L40 125 Q38 115 42 108" fill="#5d4037"/>
  <path d="M55 115 Q52 122 50 125 L65 125 Q60 118 58 112" fill="#5d4037"/>
  <path d="M75 115 Q78 122 80 125 L65 125 Q70 118 72 112" fill="#5d4037"/>
  <path d="M93 110 Q98 120 103 125 L88 125 Q90 115 86 108" fill="#5d4037"/>
  <!-- Main trunk/body -->
  <path d="M40 50 Q35 80 40 110 L88 110 Q93 80 88 50 Q64 45 40 50" fill="#6d4c41"/>
  <!-- Bark texture -->
  <path d="M50 55 Q48 75 52 95" stroke="#4e342e" stroke-width="2" fill="none"/>
  <path d="M78 58 Q80 78 76 98" stroke="#4e342e" stroke-width="2" fill="none"/>
  <path d="M64 52 L64 105" stroke="#4e342e" stroke-width="1.5" fill="none"/>
  <!-- Face area (lighter bark) -->
  <ellipse cx="64" cy="70" rx="20" ry="25" fill="#8d6e63"/>
  <!-- Eyes -->
  <ellipse cx="54" cy="65" rx="7" ry="8" fill="#1b5e20"/>
  <ellipse cx="74" cy="65" rx="7" ry="8" fill="#1b5e20"/>
  <!-- Eye glow -->
  <circle cx="54" cy="65" r="4" fill="#4caf50"/>
  <circle cx="74" cy="65" r="4" fill="#4caf50"/>
  <circle cx="52" cy="63" r="2" fill="#81c784"/>
  <circle cx="72" cy="63" r="2" fill="#81c784"/>
  <!-- Nose (knot) -->
  <ellipse cx="64" cy="75" rx="4" ry="5" fill="#5d4037"/>
  <!-- Mouth -->
  <path d="M52 85 Q64 92 76 85" stroke="#4e342e" stroke-width="3" fill="none" stroke-linecap="round"/>
  <!-- Eyebrows (branches) -->
  <path d="M45 55 Q50 52 55 56" stroke="#5d4037" stroke-width="3" fill="none"/>
  <path d="M83 55 Q78 52 73 56" stroke="#5d4037" stroke-width="3" fill="none"/>
  <!-- Left arm (branch) -->
  <path d="M38 60 Q20 55 10 65 Q15 68 20 65 Q25 70 15 80" stroke="#6d4c41" stroke-width="8" fill="none" stroke-linecap="round"/>
  <!-- Right arm (branch) -->
  <path d="M90 60 Q108 55 118 65 Q113 68 108 65 Q103 70 113 80" stroke="#6d4c41" stroke-width="8" fill="none" stroke-linecap="round"/>
  <!-- Leaves on head -->
  <ellipse cx="45" cy="35" rx="12" ry="8" fill="#2e7d32" transform="rotate(-20 45 35)"/>
  <ellipse cx="64" cy="30" rx="14" ry="9" fill="#388e3c"/>
  <ellipse cx="83" cy="35" rx="12" ry="8" fill="#2e7d32" transform="rotate(20 83 35)"/>
  <ellipse cx="52" cy="25" rx="10" ry="7" fill="#43a047" transform="rotate(-10 52 25)"/>
  <ellipse cx="76" cy="25" rx="10" ry="7" fill="#43a047" transform="rotate(10 76 25)"/>
  <ellipse cx="64" cy="20" rx="8" ry="6" fill="#66bb6a"/>
  <!-- Small leaves on arms -->
  <ellipse cx="12" cy="62" rx="6" ry="4" fill="#43a047" transform="rotate(-30 12 62)"/>
  <ellipse cx="17" cy="78" rx="5" ry="3" fill="#66bb6a" transform="rotate(20 17 78)"/>
  <ellipse cx="116" cy="62" rx="6" ry="4" fill="#43a047" transform="rotate(30 116 62)"/>
  <ellipse cx="111" cy="78" rx="5" ry="3" fill="#66bb6a" transform="rotate(-20 111 78)"/>
  <!-- Flowers -->
  <circle cx="55" cy="28" r="3" fill="#f48fb1"/>
  <circle cx="73" cy="32" r="3" fill="#fff176"/>
  <!-- Moss patches -->
  <ellipse cx="45" cy="100" rx="8" ry="4" fill="#81c784" opacity="0.7"/>
  <ellipse cx="80" cy="95" rx="6" ry="3" fill="#a5d6a7" opacity="0.6"/>
</svg>
```

**Step 2: Commit**

```bash
git add extension/media/sprites/bosses/forest-guardian.svg
git commit -m "art: add forest guardian boss sprite"
```

---

### Task 3.8: Code Review Phase 3

**Action:** Run `superpowers:code-reviewer` agent to review all boss SVG sprites for consistency and quality.

---

## Phase 4: UI Integration

### Task 4.1: Add boss battle commands to extension

**Files:**
- Modify: `extension/src/extension.ts`
- Modify: `extension/package.json`

**Step 1: Add commands to package.json**

Add to the `contributes.commands` array:
```json
{
  "command": "gitrpg.challengeBoss",
  "title": "GitRPG: Challenge Boss with Friend"
},
{
  "command": "gitrpg.viewDailyBoss",
  "title": "GitRPG: View Today's Boss"
}
```

**Step 2: Add boss battle service and commands to extension.ts**

Add import at top:
```typescript
import { CoopBattleService, BossBattle } from './services/coopBattleService';
import { BOSS_DEFINITIONS, getBossEmoji } from './services/bossService';
```

Add service initialization after pvpBattleService:
```typescript
let coopBattleService: CoopBattleService;
// In activate():
coopBattleService = new CoopBattleService(supabaseClient);
```

Add commands:
```typescript
const viewDailyBossCmd = vscode.commands.registerCommand('gitrpg.viewDailyBoss', async () => {
  if (!supabaseClient.isAuthenticated()) {
    vscode.window.showWarningMessage('Connect your account first!');
    return;
  }

  const bossType = await coopBattleService.getDailyBoss();
  const boss = BOSS_DEFINITIONS[bossType];
  const canFight = await coopBattleService.canFightBoss();

  vscode.window.showInformationMessage(
    `${getBossEmoji(bossType)} Today's Boss: ${boss.name}\n` +
    `HP: ${boss.baseHp} | ATK: ${boss.baseAttack} | DEF: ${boss.baseDefense}\n` +
    `${canFight ? '✅ You can fight!' : '❌ Already defeated today'}`,
    canFight ? 'Challenge with Friend' : 'OK'
  ).then(action => {
    if (action === 'Challenge with Friend') {
      vscode.commands.executeCommand('gitrpg.challengeBoss');
    }
  });
});

const challengeBossCmd = vscode.commands.registerCommand('gitrpg.challengeBoss', async () => {
  if (!supabaseClient.isAuthenticated()) {
    vscode.window.showWarningMessage('Connect your account first!');
    return;
  }

  const canFight = await coopBattleService.canFightBoss();
  if (!canFight) {
    vscode.window.showWarningMessage('You already defeated today\'s boss!');
    return;
  }

  const friends = await friendsService.getFriends();
  const acceptedFriends = friends.filter(f => f.status === 'accepted');

  if (acceptedFriends.length === 0) {
    vscode.window.showWarningMessage('Add some friends first to challenge the boss together!');
    return;
  }

  const items = acceptedFriends.map(f => ({
    label: `$(person) ${f.displayName}`,
    description: `Lv.${f.level} ${f.characterClass}`,
    friend: f
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a friend to challenge the boss with'
  });

  if (selected) {
    const result = await coopBattleService.createBossLobby(selected.friend.odea);
    if (result.success) {
      vscode.window.showInformationMessage(
        `Boss challenge sent to ${selected.friend.displayName}! Waiting for them to join...`
      );
      // TODO: Open boss battle webview
    } else {
      vscode.window.showErrorMessage(result.error || 'Failed to create boss lobby');
    }
  }
});
```

Add to subscriptions:
```typescript
context.subscriptions.push(
  // ... existing commands
  viewDailyBossCmd,
  challengeBossCmd
);
```

**Step 3: Verify compilation**

Run: `npm run compile`
Expected: No errors

**Step 4: Commit**

```bash
git add extension/src/extension.ts extension/package.json
git commit -m "feat: add boss battle commands"
```

---

### Task 4.2: Subscribe to boss challenges

**Files:**
- Modify: `extension/src/extension.ts`

**Step 1: Add boss challenge notifications**

In the `activate()` function, after PvP challenge subscription:
```typescript
// Subscribe to boss challenges
coopBattleService.subscribeToChallenges((challenge) => {
  vscode.window.showInformationMessage(
    `${getBossEmoji(challenge.bossType)} ${challenge.challengerName} wants to fight ${challenge.bossName} together!`,
    'Join Battle', 'Decline'
  ).then(async (action) => {
    if (action === 'Join Battle') {
      const result = await coopBattleService.joinLobby(challenge.odea);
      if (result.success) {
        vscode.window.showInformationMessage('Joined the boss lobby! Battle starting...');
        // TODO: Open boss battle webview
      }
    }
  });
});
```

**Step 2: Commit**

```bash
git add extension/src/extension.ts
git commit -m "feat: add boss challenge notifications"
```

---

### Task 4.3: Code Review Phase 4

**Action:** Run `superpowers:code-reviewer` agent to review extension.ts changes.

---

## Phase 5: Testing & Polish

### Task 5.1: Manual end-to-end testing

**Steps:**
1. Run extension with F5
2. Run `GitRPG: View Today's Boss` - verify boss info shows
3. Run `GitRPG: Challenge Boss with Friend` - verify friend selection works
4. Test with a friend to verify real-time sync works

### Task 5.2: Final code review

**Action:** Run `superpowers:code-reviewer` agent for final review of all changes.

### Task 5.3: Merge to main

```bash
cd /Users/diyagamah/Documents/gitrpg
git checkout main
git merge feature/boss-battles --no-edit
git worktree remove .worktrees/boss-battles
git branch -d feature/boss-battles
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1.1-1.4 | Database schema + review |
| 2 | 2.1-2.3 | Boss & co-op services + review |
| 3 | 3.1-3.8 | 6 boss SVG sprites + review |
| 4 | 4.1-4.3 | Extension commands + review |
| 5 | 5.1-5.3 | Testing + final review + merge |
