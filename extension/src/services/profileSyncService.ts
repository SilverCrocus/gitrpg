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
