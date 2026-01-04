# Social Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add friends list, PvP battles, and GitHub auth to GitRPG.

**Architecture:** Supabase backend (auth, database, realtime) + VS Code extension services + minimal web dashboard. Extension syncs profile/stats only; gold/workers/quests stay local.

**Tech Stack:** Supabase (PostgreSQL, Auth, Realtime), TypeScript, VS Code Extension API, Next.js

---

## Phase 1: Supabase Setup

### Task 1.1: Create Supabase Project

**Manual Steps (Supabase Console):**

1. Go to https://supabase.com and sign in
2. Click "New Project"
3. Name: `gitrpg`
4. Database password: Generate and save securely
5. Region: Choose closest to you
6. Wait for project to provision (~2 min)

**Capture these values:**
- Project URL: `https://xxx.supabase.co`
- Anon Key: `eyJ...` (public, safe for client)
- Service Role Key: `eyJ...` (private, server only)

**Step 1: Create environment file**

Create: `extension/.env.example`

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

**Step 2: Add to .gitignore**

Modify: `extension/.gitignore`

Add:
```
.env
.env.local
```

**Step 3: Commit**

```bash
git add extension/.env.example extension/.gitignore
git commit -m "chore: add supabase env template"
```

---

### Task 1.2: Create Database Schema

**Manual Steps (Supabase SQL Editor):**

Run this SQL in the Supabase dashboard SQL Editor:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- USERS TABLE
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  github_id TEXT UNIQUE,
  github_username TEXT,
  avatar_url TEXT,
  friend_code TEXT UNIQUE,

  -- Synced profile data
  display_name TEXT DEFAULT 'CodeHero',
  character_class TEXT DEFAULT 'Warrior',
  level INTEGER DEFAULT 1,
  total_xp INTEGER DEFAULT 0,

  -- Combat stats
  stats_max_hp INTEGER DEFAULT 120,
  stats_attack INTEGER DEFAULT 15,
  stats_defense INTEGER DEFAULT 12,
  stats_speed INTEGER DEFAULT 8,
  stats_crit DECIMAL DEFAULT 0.1,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- FRIENDSHIPS TABLE
CREATE TABLE friendships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id UUID REFERENCES users(id) ON DELETE CASCADE,
  addressee_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(requester_id, addressee_id)
);

-- BATTLES TABLE
CREATE TABLE battles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  challenger_id UUID REFERENCES users(id) ON DELETE CASCADE,
  opponent_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'completed', 'declined')),
  battle_log JSONB,
  winner_id UUID REFERENCES users(id),
  rewards JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for performance
CREATE INDEX idx_friendships_requester ON friendships(requester_id);
CREATE INDEX idx_friendships_addressee ON friendships(addressee_id);
CREATE INDEX idx_battles_challenger ON battles(challenger_id);
CREATE INDEX idx_battles_opponent ON battles(opponent_id);
CREATE INDEX idx_users_friend_code ON users(friend_code);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE friendships;
ALTER PUBLICATION supabase_realtime ADD TABLE battles;
```

---

### Task 1.3: Create Row Level Security Policies

**Manual Steps (Supabase SQL Editor):**

```sql
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE battles ENABLE ROW LEVEL SECURITY;

-- USERS POLICIES
-- Users can read any profile (for friend lookup)
CREATE POLICY "Users can read all profiles"
  ON users FOR SELECT
  USING (true);

-- Users can only update their own profile
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id);

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- FRIENDSHIPS POLICIES
-- Users can see friendships they're part of
CREATE POLICY "Users can view own friendships"
  ON friendships FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Users can create friend requests
CREATE POLICY "Users can create friend requests"
  ON friendships FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

-- Users can update friendships they're the addressee of
CREATE POLICY "Addressee can update friendship status"
  ON friendships FOR UPDATE
  USING (auth.uid() = addressee_id);

-- BATTLES POLICIES
-- Users can see battles they're part of
CREATE POLICY "Users can view own battles"
  ON battles FOR SELECT
  USING (auth.uid() = challenger_id OR auth.uid() = opponent_id);

-- Users can create battle challenges
CREATE POLICY "Users can create battles"
  ON battles FOR INSERT
  WITH CHECK (auth.uid() = challenger_id);

-- Participants can update battle
CREATE POLICY "Participants can update battle"
  ON battles FOR UPDATE
  USING (auth.uid() = challenger_id OR auth.uid() = opponent_id);
```

---

### Task 1.4: Configure GitHub OAuth

**Manual Steps (Supabase Dashboard):**

1. Go to Authentication → Providers
2. Enable GitHub
3. Go to GitHub → Settings → Developer Settings → OAuth Apps
4. Create new OAuth App:
   - Name: GitRPG
   - Homepage URL: http://localhost:3000
   - Callback URL: `https://your-project.supabase.co/auth/v1/callback`
5. Copy Client ID and Client Secret to Supabase

---

### Task 1.5: Create Friend Code Generator Function

**Manual Steps (Supabase SQL Editor):**

```sql
-- Function to generate unique friend code
CREATE OR REPLACE FUNCTION generate_friend_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := 'GRPG-';
  i INTEGER;
BEGIN
  FOR i IN 1..4 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  result := result || '-';
  FOR i IN 1..4 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate friend code on user creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Generate unique friend code
  LOOP
    NEW.friend_code := generate_friend_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM users WHERE friend_code = NEW.friend_code);
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_user_created
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
```

---

## Phase 2: Extension Supabase Client

### Task 2.1: Install Supabase Client

**Files:**
- Modify: `extension/package.json`

**Step 1: Add dependency**

```bash
cd extension
npm install @supabase/supabase-js
```

**Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add supabase client dependency"
```

---

### Task 2.2: Create Supabase Client Service

**Files:**
- Create: `extension/src/services/supabaseClient.ts`

**Step 1: Write the service**

```typescript
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import * as vscode from 'vscode';

// Database types
export interface DbUser {
  id: string;
  github_id: string;
  github_username: string;
  avatar_url: string;
  friend_code: string;
  display_name: string;
  character_class: string;
  level: number;
  total_xp: number;
  stats_max_hp: number;
  stats_attack: number;
  stats_defense: number;
  stats_speed: number;
  stats_crit: number;
  created_at: string;
  updated_at: string;
}

export interface DbFriendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
}

export interface DbBattle {
  id: string;
  challenger_id: string;
  opponent_id: string;
  status: 'pending' | 'accepted' | 'completed' | 'declined';
  battle_log: any;
  winner_id: string | null;
  rewards: { xp: number; gold: number } | null;
  created_at: string;
  completed_at: string | null;
}

const SUPABASE_URL_KEY = 'gitrpg.supabaseUrl';
const SUPABASE_ANON_KEY_KEY = 'gitrpg.supabaseAnonKey';
const ACCESS_TOKEN_KEY = 'gitrpg.accessToken';
const REFRESH_TOKEN_KEY = 'gitrpg.refreshToken';

export class SupabaseClientService {
  private client: SupabaseClient | null = null;
  private context: vscode.ExtensionContext;
  private currentUser: User | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async initialize(): Promise<boolean> {
    const url = this.context.globalState.get<string>(SUPABASE_URL_KEY);
    const anonKey = this.context.globalState.get<string>(SUPABASE_ANON_KEY_KEY);

    if (!url || !anonKey) {
      return false;
    }

    this.client = createClient(url, anonKey, {
      auth: {
        storage: {
          getItem: (key) => this.context.globalState.get(key) || null,
          setItem: (key, value) => this.context.globalState.update(key, value),
          removeItem: (key) => this.context.globalState.update(key, undefined),
        },
        autoRefreshToken: true,
        persistSession: true,
      },
    });

    // Try to restore session
    const accessToken = this.context.globalState.get<string>(ACCESS_TOKEN_KEY);
    const refreshToken = this.context.globalState.get<string>(REFRESH_TOKEN_KEY);

    if (accessToken && refreshToken) {
      const { data, error } = await this.client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (data.user) {
        this.currentUser = data.user;
        return true;
      }
    }

    return false;
  }

  async configure(url: string, anonKey: string): Promise<void> {
    await this.context.globalState.update(SUPABASE_URL_KEY, url);
    await this.context.globalState.update(SUPABASE_ANON_KEY_KEY, anonKey);
    await this.initialize();
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  isAuthenticated(): boolean {
    return this.currentUser !== null;
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  getClient(): SupabaseClient {
    if (!this.client) {
      throw new Error('Supabase client not initialized');
    }
    return this.client;
  }

  async signInWithGitHub(): Promise<{ url: string } | null> {
    if (!this.client) return null;

    const { data, error } = await this.client.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: 'vscode://gitrpg.auth-callback',
        scopes: 'read:user',
      },
    });

    if (error) {
      console.error('GitHub sign in error:', error);
      return null;
    }

    return { url: data.url };
  }

  async handleAuthCallback(accessToken: string, refreshToken: string): Promise<boolean> {
    if (!this.client) return false;

    const { data, error } = await this.client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error || !data.user) {
      console.error('Auth callback error:', error);
      return false;
    }

    this.currentUser = data.user;
    await this.context.globalState.update(ACCESS_TOKEN_KEY, accessToken);
    await this.context.globalState.update(REFRESH_TOKEN_KEY, refreshToken);

    return true;
  }

  async signOut(): Promise<void> {
    if (this.client) {
      await this.client.auth.signOut();
    }
    this.currentUser = null;
    await this.context.globalState.update(ACCESS_TOKEN_KEY, undefined);
    await this.context.globalState.update(REFRESH_TOKEN_KEY, undefined);
  }
}
```

**Step 2: Commit**

```bash
git add extension/src/services/supabaseClient.ts
git commit -m "feat: add supabase client service"
```

---

### Task 2.3: Create Profile Sync Service

**Files:**
- Create: `extension/src/services/profileSyncService.ts`

**Step 1: Write the service**

```typescript
import { SupabaseClientService, DbUser } from './supabaseClient';
import { LocalStateManager, CharacterData } from './localStateManager';

export class ProfileSyncService {
  private supabase: SupabaseClientService;
  private stateManager: LocalStateManager;

  constructor(supabase: SupabaseClientService, stateManager: LocalStateManager) {
    this.supabase = supabase;
    this.stateManager = stateManager;
  }

  async syncProfileToCloud(): Promise<boolean> {
    if (!this.supabase.isAuthenticated()) {
      return false;
    }

    const user = this.supabase.getCurrentUser();
    if (!user) return false;

    const char = this.stateManager.getCharacter();

    const { error } = await this.supabase.getClient()
      .from('users')
      .upsert({
        id: user.id,
        display_name: char.name,
        character_class: char.class,
        level: char.level,
        total_xp: char.xp,
        stats_max_hp: char.stats.maxHp,
        stats_attack: char.stats.attack,
        stats_defense: char.stats.defense,
        stats_speed: char.stats.speed,
        stats_crit: char.stats.critChance,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'id',
      });

    if (error) {
      console.error('Profile sync error:', error);
      return false;
    }

    return true;
  }

  async getMyProfile(): Promise<DbUser | null> {
    if (!this.supabase.isAuthenticated()) {
      return null;
    }

    const user = this.supabase.getCurrentUser();
    if (!user) return null;

    const { data, error } = await this.supabase.getClient()
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Get profile error:', error);
      return null;
    }

    return data as DbUser;
  }

  async getMyFriendCode(): Promise<string | null> {
    const profile = await this.getMyProfile();
    return profile?.friend_code || null;
  }

  async createInitialProfile(githubUsername: string, avatarUrl: string): Promise<DbUser | null> {
    if (!this.supabase.isAuthenticated()) {
      return null;
    }

    const user = this.supabase.getCurrentUser();
    if (!user) return null;

    const char = this.stateManager.getCharacter();

    const { data, error } = await this.supabase.getClient()
      .from('users')
      .insert({
        id: user.id,
        github_id: user.user_metadata?.provider_id || '',
        github_username: githubUsername,
        avatar_url: avatarUrl,
        display_name: char.name,
        character_class: char.class,
        level: char.level,
        total_xp: char.xp,
        stats_max_hp: char.stats.maxHp,
        stats_attack: char.stats.attack,
        stats_defense: char.stats.defense,
        stats_speed: char.stats.speed,
        stats_crit: char.stats.critChance,
      })
      .select()
      .single();

    if (error) {
      // If already exists, fetch it
      if (error.code === '23505') {
        return this.getMyProfile();
      }
      console.error('Create profile error:', error);
      return null;
    }

    return data as DbUser;
  }
}
```

**Step 2: Commit**

```bash
git add extension/src/services/profileSyncService.ts
git commit -m "feat: add profile sync service"
```

---

### Task 2.4: Create Friends Service

**Files:**
- Create: `extension/src/services/friendsService.ts`

**Step 1: Write the service**

```typescript
import { SupabaseClientService, DbUser, DbFriendship } from './supabaseClient';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface Friend {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  characterClass: string;
  level: number;
  friendCode: string;
  status: 'pending' | 'accepted';
  isRequester: boolean;
}

export class FriendsService {
  private supabase: SupabaseClientService;
  private notificationChannel: RealtimeChannel | null = null;
  private onFriendRequestCallback: ((friend: Friend) => void) | null = null;

  constructor(supabase: SupabaseClientService) {
    this.supabase = supabase;
  }

  async getFriends(): Promise<Friend[]> {
    if (!this.supabase.isAuthenticated()) {
      return [];
    }

    const user = this.supabase.getCurrentUser();
    if (!user) return [];

    // Get all friendships where user is involved
    const { data: friendships, error } = await this.supabase.getClient()
      .from('friendships')
      .select(`
        id,
        requester_id,
        addressee_id,
        status,
        requester:users!friendships_requester_id_fkey(
          id, github_username, display_name, avatar_url, character_class, level, friend_code
        ),
        addressee:users!friendships_addressee_id_fkey(
          id, github_username, display_name, avatar_url, character_class, level, friend_code
        )
      `)
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .in('status', ['pending', 'accepted']);

    if (error) {
      console.error('Get friends error:', error);
      return [];
    }

    return friendships.map((f: any) => {
      const isRequester = f.requester_id === user.id;
      const friendData = isRequester ? f.addressee : f.requester;

      return {
        id: friendData.id,
        username: friendData.github_username,
        displayName: friendData.display_name,
        avatarUrl: friendData.avatar_url,
        characterClass: friendData.character_class,
        level: friendData.level,
        friendCode: friendData.friend_code,
        status: f.status,
        isRequester,
      };
    });
  }

  async sendFriendRequest(friendCode: string): Promise<{ success: boolean; error?: string }> {
    if (!this.supabase.isAuthenticated()) {
      return { success: false, error: 'Not authenticated' };
    }

    const user = this.supabase.getCurrentUser();
    if (!user) return { success: false, error: 'No user' };

    // Find user by friend code
    const { data: targetUser, error: findError } = await this.supabase.getClient()
      .from('users')
      .select('id, friend_code')
      .eq('friend_code', friendCode.toUpperCase())
      .single();

    if (findError || !targetUser) {
      return { success: false, error: 'Friend code not found' };
    }

    if (targetUser.id === user.id) {
      return { success: false, error: "You can't add yourself!" };
    }

    // Check if friendship already exists
    const { data: existing } = await this.supabase.getClient()
      .from('friendships')
      .select('id, status')
      .or(`and(requester_id.eq.${user.id},addressee_id.eq.${targetUser.id}),and(requester_id.eq.${targetUser.id},addressee_id.eq.${user.id})`)
      .single();

    if (existing) {
      if (existing.status === 'accepted') {
        return { success: false, error: 'Already friends!' };
      }
      return { success: false, error: 'Friend request already pending' };
    }

    // Create friendship
    const { error: insertError } = await this.supabase.getClient()
      .from('friendships')
      .insert({
        requester_id: user.id,
        addressee_id: targetUser.id,
        status: 'pending',
      });

    if (insertError) {
      console.error('Send friend request error:', insertError);
      return { success: false, error: 'Failed to send request' };
    }

    return { success: true };
  }

  async acceptFriendRequest(friendId: string): Promise<boolean> {
    if (!this.supabase.isAuthenticated()) {
      return false;
    }

    const user = this.supabase.getCurrentUser();
    if (!user) return false;

    const { error } = await this.supabase.getClient()
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('requester_id', friendId)
      .eq('addressee_id', user.id);

    return !error;
  }

  async declineFriendRequest(friendId: string): Promise<boolean> {
    if (!this.supabase.isAuthenticated()) {
      return false;
    }

    const user = this.supabase.getCurrentUser();
    if (!user) return false;

    const { error } = await this.supabase.getClient()
      .from('friendships')
      .update({ status: 'declined' })
      .eq('requester_id', friendId)
      .eq('addressee_id', user.id);

    return !error;
  }

  async removeFriend(friendId: string): Promise<boolean> {
    if (!this.supabase.isAuthenticated()) {
      return false;
    }

    const user = this.supabase.getCurrentUser();
    if (!user) return false;

    const { error } = await this.supabase.getClient()
      .from('friendships')
      .delete()
      .or(`and(requester_id.eq.${user.id},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${user.id})`);

    return !error;
  }

  subscribeToNotifications(onFriendRequest: (friend: Friend) => void): void {
    if (!this.supabase.isAuthenticated()) return;

    const user = this.supabase.getCurrentUser();
    if (!user) return;

    this.onFriendRequestCallback = onFriendRequest;

    this.notificationChannel = this.supabase.getClient()
      .channel('friend-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'friendships',
          filter: `addressee_id=eq.${user.id}`,
        },
        async (payload) => {
          // Fetch the requester's info
          const { data: requester } = await this.supabase.getClient()
            .from('users')
            .select('*')
            .eq('id', payload.new.requester_id)
            .single();

          if (requester && this.onFriendRequestCallback) {
            this.onFriendRequestCallback({
              id: requester.id,
              username: requester.github_username,
              displayName: requester.display_name,
              avatarUrl: requester.avatar_url,
              characterClass: requester.character_class,
              level: requester.level,
              friendCode: requester.friend_code,
              status: 'pending',
              isRequester: false,
            });
          }
        }
      )
      .subscribe();
  }

  unsubscribeFromNotifications(): void {
    if (this.notificationChannel) {
      this.supabase.getClient().removeChannel(this.notificationChannel);
      this.notificationChannel = null;
    }
  }
}
```

**Step 2: Commit**

```bash
git add extension/src/services/friendsService.ts
git commit -m "feat: add friends service"
```

---

### Task 2.5: Create PvP Battle Service

**Files:**
- Create: `extension/src/services/pvpBattleService.ts`

**Step 1: Write the service**

```typescript
import { SupabaseClientService, DbUser, DbBattle } from './supabaseClient';
import { BattleEngine, BattleFighter, BattleResult } from './battleEngine';
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
    const challengerUser = battle.challenger as DbUser;
    const opponentUser = battle.opponent as DbUser;

    const challenger: BattleFighter = {
      id: challengerUser.id,
      name: challengerUser.display_name,
      class: challengerUser.character_class.toLowerCase() as any,
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
      class: opponentUser.character_class.toLowerCase() as any,
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
```

**Step 2: Commit**

```bash
git add extension/src/services/pvpBattleService.ts
git commit -m "feat: add PvP battle service"
```

---

## Phase 3: Extension UI Integration

### Task 3.1: Add Social Commands to Extension

**Files:**
- Modify: `extension/package.json` (add commands)
- Modify: `extension/src/extension.ts`

**Step 1: Add commands to package.json**

Add to `contributes.commands` array:

```json
{
  "command": "gitrpg.connectAccount",
  "title": "GitRPG: Connect Account"
},
{
  "command": "gitrpg.showFriends",
  "title": "GitRPG: Show Friends"
},
{
  "command": "gitrpg.addFriend",
  "title": "GitRPG: Add Friend"
},
{
  "command": "gitrpg.showFriendCode",
  "title": "GitRPG: Show My Friend Code"
}
```

**Step 2: Initialize services in extension.ts**

Add imports and initialization:

```typescript
import { SupabaseClientService } from './services/supabaseClient';
import { ProfileSyncService } from './services/profileSyncService';
import { FriendsService } from './services/friendsService';
import { PvpBattleService } from './services/pvpBattleService';

let supabaseClient: SupabaseClientService;
let profileSync: ProfileSyncService;
let friendsService: FriendsService;
let pvpBattleService: PvpBattleService;

// In activate():
supabaseClient = new SupabaseClientService(context);
await supabaseClient.initialize();

profileSync = new ProfileSyncService(supabaseClient, stateManager);
friendsService = new FriendsService(supabaseClient);
pvpBattleService = new PvpBattleService(supabaseClient);

// Subscribe to notifications if authenticated
if (supabaseClient.isAuthenticated()) {
  friendsService.subscribeToNotifications((friend) => {
    vscode.window.showInformationMessage(
      `Friend request from ${friend.displayName}!`,
      'Accept', 'Decline'
    ).then(async (action) => {
      if (action === 'Accept') {
        await friendsService.acceptFriendRequest(friend.id);
        vscode.window.showInformationMessage(`You are now friends with ${friend.displayName}!`);
      } else if (action === 'Decline') {
        await friendsService.declineFriendRequest(friend.id);
      }
    });
  });

  pvpBattleService.subscribeToChallenges((challenge) => {
    vscode.window.showInformationMessage(
      `Battle challenge from ${challenge.challengerName} (Lv.${challenge.challengerLevel})!`,
      'Accept', 'Decline'
    ).then(async (action) => {
      if (action === 'Accept') {
        const result = await pvpBattleService.acceptChallenge(challenge.id);
        if (result) {
          // Show battle result (reuse existing battle panel)
          vscode.window.showInformationMessage(
            `Battle complete! ${result.winner.name} wins!`
          );
        }
      } else if (action === 'Decline') {
        await pvpBattleService.declineChallenge(challenge.id);
      }
    });
  });
}
```

**Step 3: Add command handlers**

```typescript
// Connect Account command
const connectAccountCmd = vscode.commands.registerCommand('gitrpg.connectAccount', async () => {
  if (!supabaseClient.isConfigured()) {
    const url = await vscode.window.showInputBox({
      prompt: 'Enter your Supabase URL',
      placeHolder: 'https://xxx.supabase.co'
    });
    const key = await vscode.window.showInputBox({
      prompt: 'Enter your Supabase Anon Key',
      placeHolder: 'eyJ...'
    });

    if (url && key) {
      await supabaseClient.configure(url, key);
    } else {
      return;
    }
  }

  const authResult = await supabaseClient.signInWithGitHub();
  if (authResult?.url) {
    vscode.env.openExternal(vscode.Uri.parse(authResult.url));
  }
});

// Show Friends command
const showFriendsCmd = vscode.commands.registerCommand('gitrpg.showFriends', async () => {
  if (!supabaseClient.isAuthenticated()) {
    vscode.window.showWarningMessage('Connect your account first!', 'Connect').then((action) => {
      if (action === 'Connect') {
        vscode.commands.executeCommand('gitrpg.connectAccount');
      }
    });
    return;
  }

  const friends = await friendsService.getFriends();
  const accepted = friends.filter(f => f.status === 'accepted');
  const pending = friends.filter(f => f.status === 'pending' && !f.isRequester);

  if (friends.length === 0) {
    vscode.window.showInformationMessage('No friends yet! Add friends with their friend code.');
    return;
  }

  const items = [
    ...accepted.map(f => ({
      label: `$(person) ${f.displayName}`,
      description: `Lv.${f.level} ${f.characterClass}`,
      detail: f.friendCode,
      friend: f,
    })),
    ...pending.map(f => ({
      label: `$(mail) ${f.displayName} (pending)`,
      description: `Lv.${f.level} ${f.characterClass}`,
      detail: 'Click to accept/decline',
      friend: f,
    })),
  ];

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Your friends'
  });

  if (selected) {
    if (selected.friend.status === 'pending') {
      const action = await vscode.window.showQuickPick(['Accept', 'Decline'], {
        placeHolder: `Friend request from ${selected.friend.displayName}`
      });
      if (action === 'Accept') {
        await friendsService.acceptFriendRequest(selected.friend.id);
        vscode.window.showInformationMessage(`You are now friends with ${selected.friend.displayName}!`);
      } else if (action === 'Decline') {
        await friendsService.declineFriendRequest(selected.friend.id);
      }
    } else {
      const action = await vscode.window.showQuickPick(['Challenge to Battle', 'Remove Friend'], {
        placeHolder: selected.friend.displayName
      });
      if (action === 'Challenge to Battle') {
        const result = await pvpBattleService.challengeFriend(selected.friend.id);
        if (result.success) {
          vscode.window.showInformationMessage(`Challenge sent to ${selected.friend.displayName}!`);
        } else {
          vscode.window.showErrorMessage(result.error || 'Failed to send challenge');
        }
      } else if (action === 'Remove Friend') {
        await friendsService.removeFriend(selected.friend.id);
        vscode.window.showInformationMessage(`Removed ${selected.friend.displayName} from friends`);
      }
    }
  }
});

// Add Friend command
const addFriendCmd = vscode.commands.registerCommand('gitrpg.addFriend', async () => {
  if (!supabaseClient.isAuthenticated()) {
    vscode.window.showWarningMessage('Connect your account first!');
    return;
  }

  const friendCode = await vscode.window.showInputBox({
    prompt: 'Enter friend code',
    placeHolder: 'GRPG-XXXX-XXXX'
  });

  if (friendCode) {
    const result = await friendsService.sendFriendRequest(friendCode);
    if (result.success) {
      vscode.window.showInformationMessage('Friend request sent!');
    } else {
      vscode.window.showErrorMessage(result.error || 'Failed to send request');
    }
  }
});

// Show Friend Code command
const showFriendCodeCmd = vscode.commands.registerCommand('gitrpg.showFriendCode', async () => {
  if (!supabaseClient.isAuthenticated()) {
    vscode.window.showWarningMessage('Connect your account first!');
    return;
  }

  const code = await profileSync.getMyFriendCode();
  if (code) {
    const action = await vscode.window.showInformationMessage(
      `Your friend code: ${code}`,
      'Copy to Clipboard'
    );
    if (action === 'Copy to Clipboard') {
      await vscode.env.clipboard.writeText(code);
      vscode.window.showInformationMessage('Friend code copied!');
    }
  }
});

// Add to subscriptions
context.subscriptions.push(
  connectAccountCmd,
  showFriendsCmd,
  addFriendCmd,
  showFriendCodeCmd
);
```

**Step 4: Commit**

```bash
git add extension/package.json extension/src/extension.ts
git commit -m "feat: add social commands to extension"
```

---

### Task 3.2: Add Auth Callback Handler

**Files:**
- Modify: `extension/package.json` (add URI handler)
- Create: `extension/src/authHandler.ts`

**Step 1: Register URI handler in package.json**

Add to `contributes`:

```json
"uriHandlers": [
  {
    "scheme": "vscode",
    "authority": "gitrpg.auth-callback"
  }
]
```

**Step 2: Create auth handler**

```typescript
import * as vscode from 'vscode';
import { SupabaseClientService } from './services/supabaseClient';
import { ProfileSyncService } from './services/profileSyncService';

export function registerAuthHandler(
  context: vscode.ExtensionContext,
  supabase: SupabaseClientService,
  profileSync: ProfileSyncService
): void {
  const handler = vscode.window.registerUriHandler({
    async handleUri(uri: vscode.Uri) {
      if (uri.authority !== 'gitrpg.auth-callback') {
        return;
      }

      // Parse tokens from fragment
      const fragment = uri.fragment;
      const params = new URLSearchParams(fragment);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken && refreshToken) {
        const success = await supabase.handleAuthCallback(accessToken, refreshToken);

        if (success) {
          // Get GitHub user info from the token
          const user = supabase.getCurrentUser();
          const githubUsername = user?.user_metadata?.user_name || 'Unknown';
          const avatarUrl = user?.user_metadata?.avatar_url || '';

          // Create or update profile
          await profileSync.createInitialProfile(githubUsername, avatarUrl);
          await profileSync.syncProfileToCloud();

          const friendCode = await profileSync.getMyFriendCode();

          vscode.window.showInformationMessage(
            `Connected as ${githubUsername}! Your friend code: ${friendCode}`,
            'Copy Code'
          ).then(async (action) => {
            if (action === 'Copy Code' && friendCode) {
              await vscode.env.clipboard.writeText(friendCode);
            }
          });
        } else {
          vscode.window.showErrorMessage('Authentication failed. Please try again.');
        }
      }
    }
  });

  context.subscriptions.push(handler);
}
```

**Step 3: Register in extension.ts**

```typescript
import { registerAuthHandler } from './authHandler';

// In activate(), after initializing services:
registerAuthHandler(context, supabaseClient, profileSync);
```

**Step 4: Commit**

```bash
git add extension/package.json extension/src/authHandler.ts extension/src/extension.ts
git commit -m "feat: add OAuth callback handler"
```

---

### Task 3.3: Sync Profile on State Changes

**Files:**
- Modify: `extension/src/extension.ts`

**Step 1: Add profile sync on level up / class change**

```typescript
// In activate(), after stateManager initialization:
stateManager.onStateChange(async () => {
  if (supabaseClient.isAuthenticated()) {
    await profileSync.syncProfileToCloud();
  }
});
```

**Step 2: Commit**

```bash
git add extension/src/extension.ts
git commit -m "feat: sync profile to cloud on state changes"
```

---

## Phase 4: Testing & Polish

### Task 4.1: Test Full Flow

**Manual Testing Checklist:**

1. [ ] Run `npm run compile` - no errors
2. [ ] Launch extension (F5)
3. [ ] Run "GitRPG: Connect Account"
4. [ ] Complete GitHub OAuth in browser
5. [ ] Verify friend code is shown
6. [ ] Run "GitRPG: Show My Friend Code" - should display code
7. [ ] Test with second account (or friend):
   - [ ] Run "GitRPG: Add Friend" with first account's code
   - [ ] First account sees friend request notification
   - [ ] Accept friend request
   - [ ] Both accounts see each other in friends list
8. [ ] Challenge friend to battle
9. [ ] Friend receives challenge notification
10. [ ] Accept challenge, battle runs
11. [ ] Both see result, winner gets rewards

---

### Task 4.2: Final Commit & PR

**Step 1: Verify all changes compile**

```bash
cd extension && npm run compile
```

**Step 2: Create final commit if needed**

```bash
git status
git add -A
git commit -m "feat: complete social features implementation"
```

**Step 3: Push branch**

```bash
git push -u origin feature/social
```

---

## Summary

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| 1. Supabase Setup | 5 tasks | 30 min (manual) |
| 2. Extension Services | 5 tasks | 2-3 hours |
| 3. UI Integration | 3 tasks | 1-2 hours |
| 4. Testing | 2 tasks | 1 hour |

**Total: ~5-6 hours of implementation**
