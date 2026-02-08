import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import * as vscode from 'vscode';
import { CLASS_BASE_STATS } from '../config/classConfig';
import { CharacterClass } from '../types/index';

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
  gold: number;
  last_quest_refresh: string | null;
  last_boss_win_date: string | null;
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

/**
 * Convert a database user record to a BattleFighter for use in battles
 */
export function dbUserToBattleFighter(user: DbUser, currentHp?: number): {
  id: string;
  name: string;
  class: string;
  level: number;
  stats: {
    maxHp: number;
    attack: number;
    defense: number;
    speed: number;
    critChance: number;
    critDamage: number;
  };
  currentHp: number;
} {
  return {
    id: user.id,
    name: user.display_name,
    class: user.character_class,
    level: user.level,
    stats: {
      maxHp: user.stats_max_hp,
      attack: user.stats_attack,
      defense: user.stats_defense,
      speed: user.stats_speed,
      critChance: user.stats_crit,
      critDamage: CLASS_BASE_STATS[user.character_class as CharacterClass]?.critDamage ?? 1.5,
    },
    currentHp: currentHp ?? user.stats_max_hp,
  };
}

// Supabase configuration (anon key is public, safe to include)
const SUPABASE_URL = 'https://cjohlwagftjsihexyzzw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqb2hsd2FnZnRqc2loZXh5enp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1NjU4OTAsImV4cCI6MjA4MzE0MTg5MH0.zMUNiTg5Un4GODtVXz9GP1jF6Kk9ltoGPLVoGZsVXUQ';

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
    const url = SUPABASE_URL;
    const anonKey = SUPABASE_ANON_KEY;

    this.client = createClient(url, anonKey, {
      auth: {
        storage: {
          getItem: (key: string) => this.context.globalState.get(key) ?? null,
          setItem: (key: string, value: string) => this.context.globalState.update(key, value),
          removeItem: (key: string) => this.context.globalState.update(key, undefined),
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

      // Session restoration failed - clear stale tokens
      await this.context.globalState.update(ACCESS_TOKEN_KEY, undefined);
      await this.context.globalState.update(REFRESH_TOKEN_KEY, undefined);
    }

    return false;
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
        redirectTo: 'vscode://hivindiyagama.gitrpg/auth-callback',
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
