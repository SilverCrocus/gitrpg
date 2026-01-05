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
