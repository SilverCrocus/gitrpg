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
