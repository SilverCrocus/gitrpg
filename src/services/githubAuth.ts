import { GithubAuthProvider, signInWithPopup } from 'firebase/auth';
import { getAuthInstance } from './firebase';
import type { GitHubAccount } from '../types';

const provider = new GithubAuthProvider();
provider.addScope('repo');
provider.addScope('read:user');

export interface GitHubAuthResult {
  firebaseUid: string;
  githubAccount: GitHubAccount;
}

export async function signInWithGitHub(): Promise<GitHubAuthResult> {
  const auth = getAuthInstance();
  const result = await signInWithPopup(auth, provider);

  const credential = GithubAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error('Failed to get GitHub access token');
  }

  const githubUser = result.user;

  return {
    firebaseUid: githubUser.uid,
    githubAccount: {
      id: githubUser.providerData[0]?.uid || '',
      username: githubUser.displayName || '',
      accessToken: credential.accessToken,
      isEnterprise: false,
      linkedAt: new Date()
    }
  };
}

export async function linkAdditionalGitHubAccount(
  enterpriseUrl?: string
): Promise<GitHubAccount> {
  const auth = getAuthInstance();

  // For enterprise, create provider with custom URL
  const enterpriseProvider = new GithubAuthProvider();
  enterpriseProvider.addScope('repo');
  enterpriseProvider.addScope('read:user');

  if (enterpriseUrl) {
    enterpriseProvider.setCustomParameters({
      login_hint: enterpriseUrl
    });
  }

  const result = await signInWithPopup(auth, enterpriseProvider);
  const credential = GithubAuthProvider.credentialFromResult(result);

  if (!credential?.accessToken) {
    throw new Error('Failed to get GitHub access token');
  }

  return {
    id: result.user.providerData[0]?.uid || '',
    username: result.user.displayName || '',
    accessToken: credential.accessToken,
    isEnterprise: !!enterpriseUrl,
    enterpriseUrl,
    linkedAt: new Date()
  };
}

export async function signOut(): Promise<void> {
  const auth = getAuthInstance();
  await auth.signOut();
}
