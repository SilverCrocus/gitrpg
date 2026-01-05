# Co-op Boss Battles Design

## Overview

Synchronous co-op boss battles where two friends fight a daily boss together in real-time, watching the battle unfold simultaneously via Supabase real-time subscriptions.

## Core Mechanics

### Battle Flow
1. Player A invites friend (Player B) to a boss fight
2. Player B accepts via notification
3. Both players see a "Boss Lobby" showing the daily boss and both characters
4. Either player can start the battle when both are ready
5. Battle runs on Supabase - both clients subscribe to real-time updates
6. Each turn: both players attack simultaneously → boss attacks one player
7. Battle ends when boss HP hits 0 (win) or both players are defeated (lose)
8. On win: both get XP + Gold with 1.5x co-op multiplier, marked as "completed" for the day

### Combat Mechanics
- Boss stats scale with average player level: `baseStat * (1 + avgLevel * 0.1)`
- Turn order: Player 1 attacks → Player 2 attacks → Boss attacks
- Boss targeting: 70% chance lowest HP player, 30% random
- Boss cannot be crit (prevents being too easy)
- If one player dies, the other continues solo (no co-op bonus if they win alone)

### Daily Limit
- One WIN per day per player
- Can retry failed attempts unlimited times
- Resets at midnight UTC
- Boss type rotates daily through all 6 bosses

## Boss Definitions

| Boss | HP | Attack | Defense | Speed | Special Trait |
|------|-----|--------|---------|-------|---------------|
| Dragon | 500 | 45 | 20 | 30 | High damage, can crit |
| Golem | 600 | 25 | 40 | 10 | Tanky, slow but hits hard |
| Shadow Knight | 450 | 35 | 30 | 35 | Balanced, fast |
| Slime King | 800 | 15 | 15 | 20 | Massive HP pool, weak hits |
| Necromancer | 400 | 40 | 15 | 25 | Heals 50 HP every 3 turns |
| Forest Guardian | 550 | 30 | 35 | 15 | Tanky nature spirit |

Stats scale with average player level for challenge.

## Rewards

| Reward | Solo | Co-op (1.5x) |
|--------|------|--------------|
| Base XP | 150 | 225 |
| Base Gold | 75 | 112 |
| Level bonus | +20 XP per boss level | +30 XP per boss level |

- Losing gives consolation: 25 XP, 10 Gold
- First win of the day locks player out until midnight UTC

## Database Schema

### `boss_battles` table
```sql
CREATE TABLE boss_battles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id UUID REFERENCES users(id),
  player2_id UUID REFERENCES users(id),
  boss_type TEXT NOT NULL,
  status TEXT DEFAULT 'lobby', -- lobby, in_progress, completed, failed
  battle_log JSONB DEFAULT '[]',
  boss_current_hp INTEGER,
  player1_current_hp INTEGER,
  player2_current_hp INTEGER,
  winner_ids UUID[], -- array of winner user IDs
  rewards JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

### `daily_boss` table
```sql
CREATE TABLE daily_boss (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
  boss_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Users table additions
- Add `last_boss_win_date` field to track daily reset

## UI Flow

### Boss Lobby Screen
- Today's boss with SVG sprite and name
- Boss stats display (HP, Attack, Defense)
- Both player characters with HP/stats
- "Ready" checkbox for each player
- "Start Battle" button (enabled when both ready)
- "Leave Lobby" button

### Battle Screen
- Boss sprite (large, 128x128, center-top)
- Both player sprites (64x64, bottom left/right)
- HP bars for all three combatants
- Turn-by-turn action log (scrolling)
- Damage numbers floating up on hits
- Current turn indicator

### Victory/Defeat Screen
- Result banner (Victory! / Defeated...)
- Rewards breakdown (XP, Gold, co-op bonus)
- "Play Again" button (if not daily limit)
- "Return to Dashboard" button

## SVG Sprites

Location: `extension/media/sprites/bosses/`

Files:
- `dragon.svg` - Red/orange dragon, wings spread
- `golem.svg` - Grey stone creature, bulky
- `shadow-knight.svg` - Dark armored figure, glowing eyes
- `slime-king.svg` - Large green/blue slime with crown
- `necromancer.svg` - Hooded skeletal mage, purple magic
- `forest-guardian.svg` - Tree spirit, green/brown, leaves

Size: 128x128px (larger than player sprites to feel imposing)

## Implementation Phases

### Phase 1: Database & Backend
- Create `boss_battles` table in Supabase
- Create `daily_boss` table in Supabase
- Add `last_boss_win_date` to users table
- Set up RLS policies
- Create daily boss rotation function

### Phase 2: Boss Service
- Create `bossService.ts` with boss definitions and stats
- Create `coopBattleService.ts` for:
  - Creating boss lobby
  - Inviting friends
  - Real-time battle state sync
  - Battle execution logic
  - Reward calculation

### Phase 3: Boss SVG Sprites
- Design and create all 6 boss SVGs
- Consistent style with existing character sprites
- 128x128px size

### Phase 4: UI Integration
- Add "Challenge Boss" option in friends list
- Boss lobby webview
- Battle screen webview with real-time updates
- Victory/defeat screens
- Daily boss status in dashboard

### Phase 5: Testing & Polish
- End-to-end co-op testing
- Balance tuning
- Edge case handling (disconnects, timeouts)
- Final review

## Technical Notes

### Real-time Sync
- Use Supabase real-time subscriptions on `boss_battles` table
- Battle state updates trigger UI refresh on both clients
- Optimistic UI updates with server reconciliation

### Battle Execution
- One client (lobby creator) runs battle logic
- Each turn result pushed to Supabase
- Other client receives via subscription
- Prevents race conditions and ensures consistency

### Error Handling
- Disconnect detection with 30-second timeout
- Auto-forfeit if player disconnects mid-battle
- Graceful degradation to solo if partner disconnects before start
