import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getDb } from './firebase';
import type { User, GitHubAccount } from '../types';

const USERS_COLLECTION = 'users';

export async function createUser(userId: string, email: string, displayName: string): Promise<User> {
  const db = getDb();
  const userRef = doc(db, USERS_COLLECTION, userId);

  const newUser: User = {
    id: userId,
    email,
    displayName,
    // avatarUrl is optional, omit to leave undefined
    githubAccounts: [],
    activeCharacterId: null,
    gold: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    settings: {
      notifications: true,
      autoTrackRepos: true,
      trackedRepos: []
    }
  };

  await setDoc(userRef, {
    ...newUser,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return newUser;
}

export async function getUser(userId: string): Promise<User | null> {
  const db = getDb();
  const userRef = doc(db, USERS_COLLECTION, userId);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) return null;
  return snapshot.data() as User;
}

export async function updateUserGold(userId: string, goldDelta: number): Promise<void> {
  const db = getDb();
  const userRef = doc(db, USERS_COLLECTION, userId);
  const user = await getUser(userId);

  if (!user) throw new Error('User not found');

  const newGold = Math.max(0, user.gold + goldDelta);
  await updateDoc(userRef, {
    gold: newGold,
    updatedAt: serverTimestamp()
  });
}

export async function linkGitHubAccount(userId: string, account: GitHubAccount): Promise<void> {
  const db = getDb();
  const userRef = doc(db, USERS_COLLECTION, userId);
  const user = await getUser(userId);

  if (!user) throw new Error('User not found');

  // Check if account already linked
  const existingIndex = user.githubAccounts.findIndex(a => a.id === account.id);
  if (existingIndex >= 0) {
    user.githubAccounts[existingIndex] = account;
  } else {
    user.githubAccounts.push(account);
  }

  await updateDoc(userRef, {
    githubAccounts: user.githubAccounts,
    updatedAt: serverTimestamp()
  });
}

export async function setActiveCharacter(userId: string, characterId: string): Promise<void> {
  const db = getDb();
  const userRef = doc(db, USERS_COLLECTION, userId);

  await updateDoc(userRef, {
    activeCharacterId: characterId,
    updatedAt: serverTimestamp()
  });
}
