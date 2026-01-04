# GitRPG Social Features Design

## Overview

Add social features to GitRPG: friends list, PvP battles, and co-op boss battles (v2).

**Stack:** Supabase (auth, database, realtime)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        SUPABASE                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌──────────────┐   │
│  │  Auth   │  │  Users  │  │ Friends │  │   Battles    │   │
│  │ (GitHub)│  │  Table  │  │  Table  │  │    Table     │   │
│  └─────────┘  └─────────┘  └─────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┬────────────────┐
        ▼                             ▼                ▼
┌───────────────┐           ┌───────────────┐  ┌─────────────┐
│  VS Code Ext  │           │  VS Code Ext  │  │     Web     │
│   (You)       │◄─────────►│   (Friend)    │  │  Dashboard  │
│               │  battles  │               │  │  (minimal)  │
│ Local: gold,  │           │               │  │             │
│ workers,quests│           │               │  │ Profile,    │
│               │           │               │  │ friends,    │
│ Synced:       │           │               │  │ invites     │
│ profile,stats │           │               │  │             │
└───────────────┘           └───────────────┘  └─────────────┘
```

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Backend | Supabase | Realtime built-in, PostgreSQL, generous free tier |
| Auth | GitHub OAuth | Developers have GitHub, easy avatar/username |
| Commits | Local tracking | Auth is for social only, commits tracked as before |
| Data sync | Profile + stats only | Gold/workers/quests stay local (simpler) |
| Friend system | Friend codes | Privacy-first, no accounts needed to share |
| PvP battles | Auto-battle | Reuse existing BattleEngine |
| Co-op | Friend group bosses | Private boss with your friends (v2) |
| Web dashboard | Minimal | Profile, friends, invites only |

## Database Schema

```sql
-- USERS TABLE
users (
  id              UUID PRIMARY KEY
  github_id       TEXT UNIQUE
  github_username TEXT
  avatar_url      TEXT
  friend_code     TEXT UNIQUE      -- "GRPG-A7X9-K2M1"

  -- Synced profile data
  display_name    TEXT
  character_class TEXT             -- Warrior/Mage/Rogue/Archer
  level           INTEGER
  total_xp        INTEGER

  -- Combat stats
  stats_max_hp    INTEGER
  stats_attack    INTEGER
  stats_defense   INTEGER
  stats_speed     INTEGER
  stats_crit      DECIMAL

  created_at      TIMESTAMP
  updated_at      TIMESTAMP
)

-- FRIENDSHIPS TABLE
friendships (
  id              UUID PRIMARY KEY
  requester_id    UUID REFERENCES users
  addressee_id    UUID REFERENCES users
  status          TEXT             -- 'pending', 'accepted', 'declined'
  created_at      TIMESTAMP

  UNIQUE(requester_id, addressee_id)
)

-- BATTLES TABLE (PvP)
battles (
  id              UUID PRIMARY KEY
  challenger_id   UUID REFERENCES users
  opponent_id     UUID REFERENCES users
  status          TEXT             -- 'pending', 'accepted', 'completed', 'declined'
  battle_log      JSONB
  winner_id       UUID REFERENCES users
  rewards         JSONB
  created_at      TIMESTAMP
  completed_at    TIMESTAMP
)

-- BOSS BATTLES TABLE (Co-op, v2)
boss_battles (
  id              UUID PRIMARY KEY
  creator_id      UUID REFERENCES users
  boss_type       TEXT
  boss_max_hp     INTEGER
  boss_current_hp INTEGER
  status          TEXT
  participants    JSONB
  expires_at      TIMESTAMP
  created_at      TIMESTAMP
)
```

## User Flows

### Flow 1: First-time Setup
1. User opens extension, sees "Connect Account" button
2. Clicks, VS Code opens browser to web dashboard
3. User signs in with GitHub OAuth
4. Supabase creates user record, generates friend code
5. Web shows friend code with copy button
6. Extension detects auth, syncs profile
7. Extension shows friend code in dashboard

### Flow 2: Adding a Friend
1. Friend shares code via Discord/Slack
2. User opens extension, "Add Friend", enters code
3. Extension creates friendship (pending)
4. Friend gets realtime notification
5. Friend accepts, status = 'accepted'
6. Both see each other in friends list

### Flow 3: PvP Battle
1. User clicks "Challenge" on friend
2. Extension creates battle record (pending)
3. Friend gets notification, accepts
4. BattleEngine.runBattle(challenger, opponent)
5. Battle log saved to Supabase
6. Both see animated battle result
7. Winner gets XP/gold locally

### Flow 4: Co-op Boss (v2)
1. User summons boss, picks type
2. Invites friends, they get notifications
3. Friends join, added to participants
4. Each attacks, deals damage based on stats
5. Boss HP shared, decreases together
6. HP = 0, rewards by contribution

## V1 Scope

**In scope:**
- GitHub OAuth via Supabase
- User profile sync (name, class, level, stats)
- Friend codes + add/accept friends
- Friends list in extension
- PvP auto-battles with friends
- Minimal web dashboard

**Out of scope (v2):**
- Co-op boss battles
- Global leaderboards
- GitHub username search
- Battle history/replays on web

## Implementation Phases

| Phase | What | Files |
|-------|------|-------|
| 1 | Supabase project setup, schema, auth | Supabase console |
| 2 | Extension: Supabase client, auth flow | `supabaseClient.ts` |
| 3 | Extension: Profile sync service | `profileSync.ts` |
| 4 | Extension: Friends service + UI | `friendsService.ts` |
| 5 | Extension: PvP battle flow | `pvpBattleService.ts` |
| 6 | Web dashboard: minimal Next.js | `dashboard/` |
| 7 | Testing & polish | All |

## Technical Details

**Authentication:**
```typescript
// VS Code auth API + Supabase exchange
const session = await vscode.authentication.getSession(
  'github', ['read:user'], { createIfNone: true }
);
```

**Realtime:**
```typescript
supabase
  .channel('notifications')
  .on('postgres_changes', {
    event: 'INSERT',
    table: 'friendships',
    filter: `addressee_id=eq.${userId}`
  }, () => {
    vscode.window.showInformationMessage('New friend request!');
  })
  .subscribe();
```

**Security:**
- Row Level Security on all tables
- Users can only read/update own profile
- Friendships/battles visible only to participants

**Friend Code Format:**
- Pattern: `GRPG-XXXX-XXXX`
- Alphanumeric, no ambiguous chars (0/O, 1/l)
- Generated once, can regenerate if needed
