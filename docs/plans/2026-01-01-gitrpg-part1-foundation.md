# GitRPG Implementation Plan - Part 1: Foundation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a VSCode extension where developers earn XP from coding, level up pixel characters, and battle friends.

**Architecture:** VSCode extension with webview UI, Firebase backend for real-time sync, GitHub OAuth for auth, git-based activity tracking. Sprite system renders pixel characters with animations.

**Tech Stack:** TypeScript, VSCode Extension API, Firebase (Auth, Firestore, Functions), React (webview), GitHub OAuth

---

## Parallel Workstream Overview

This plan is designed for **parallel execution with multiple subagents**:

| Workstream | Tasks | Can Run In Parallel With |
|------------|-------|--------------------------|
| **A: Backend/Firebase** | 1-4 | B, C, D |
| **B: Extension Shell** | 5-8 | A, C, D |
| **C: Git Tracking** | 9-12 | A, B, D |
| **D: Sprite System** | 13-16 | A, B, C |

**Recommended Agent Allocation:**
- 2 code-executor agents per workstream (8 total)
- 1 code-reviewer agent per workstream (4 total)
- Total: 12 agents for Part 1

---

## Workstream A: Backend Infrastructure (Firebase)

### Task 1: Initialize Firebase Project

**Files:**
- Create: `firebase.json`
- Create: `firestore.rules`
- Create: `firestore.indexes.json`
- Create: `.firebaserc`

**Step 1: Install Firebase CLI and initialize**

```bash
cd /Users/diyagamah/Documents/gitrpg
npm init -y
npm install firebase-admin firebase
npm install -D typescript @types/node
npx tsc --init
```

**Step 2: Create firebase.json**

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "functions": {
    "source": "functions",
    "predeploy": ["npm --prefix functions run build"]
  }
}
```

**Step 3: Create firestore.rules**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Characters belong to users
    match /users/{userId}/characters/{characterId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Public leaderboards
    match /leaderboards/{leaderboardId} {
      allow read: if true;
      allow write: if false; // Only functions can write
    }

    // Battles - participants can read
    match /battles/{battleId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update: if request.auth != null &&
        (request.auth.uid == resource.data.player1Id ||
         request.auth.uid == resource.data.player2Id);
    }
  }
}
```

**Step 4: Create firestore.indexes.json**

```json
{
  "indexes": [
    {
      "collectionGroup": "characters",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "level", "order": "DESCENDING" },
        { "fieldPath": "xp", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

**Step 5: Commit**

```bash
git init
git add -A
git commit -m "feat: initialize firebase project structure"
```

---

### Task 2: Define Data Models (TypeScript Types)

**Files:**
- Create: `src/types/user.ts`
- Create: `src/types/character.ts`
- Create: `src/types/battle.ts`
- Create: `src/types/quest.ts`
- Create: `src/types/worker.ts`
- Create: `src/types/index.ts`

**Step 1: Create src/types/user.ts**

```typescript
export interface GitHubAccount {
  id: string;
  username: string;
  accessToken: string;
  isEnterprise: boolean;
  enterpriseUrl?: string;
  linkedAt: Date;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  githubAccounts: GitHubAccount[];
  activeCharacterId: string | null;
  gold: number;
  createdAt: Date;
  updatedAt: Date;
  settings: UserSettings;
}

export interface UserSettings {
  notifications: boolean;
  autoTrackRepos: boolean;
  trackedRepos: string[]; // repo full names like "owner/repo"
}

export interface UserStats {
  totalCommits: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  totalFilesChanged: number;
  longestStreak: number;
  currentStreak: number;
  lastActivityAt: Date | null;
}
```

**Step 2: Create src/types/character.ts**

```typescript
export type CharacterClass = 'warrior' | 'mage' | 'rogue' | 'archer';

export interface CharacterStats {
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  critChance: number;
  critDamage: number;
}

export interface Character {
  id: string;
  userId: string;
  name: string;
  class: CharacterClass;
  level: number;
  xp: number;
  xpToNextLevel: number;
  stats: CharacterStats;
  equippedWeaponId: string | null;
  equippedArmorId: string | null;
  equippedSpellIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CharacterClassConfig {
  name: CharacterClass;
  displayName: string;
  description: string;
  baseStats: CharacterStats;
  statGrowth: CharacterStats; // stats gained per level
  spriteSheet: string;
}

export const CLASS_CONFIGS: Record<CharacterClass, CharacterClassConfig> = {
  warrior: {
    name: 'warrior',
    displayName: 'Warrior',
    description: 'High HP and attack, can take and deal heavy damage',
    baseStats: { maxHp: 120, attack: 15, defense: 12, speed: 8, critChance: 0.05, critDamage: 1.5 },
    statGrowth: { maxHp: 12, attack: 2, defense: 1.5, speed: 0.5, critChance: 0.005, critDamage: 0.02 },
    spriteSheet: 'warrior.png'
  },
  mage: {
    name: 'mage',
    displayName: 'Mage',
    description: 'Low HP but devastating spell power',
    baseStats: { maxHp: 70, attack: 20, defense: 5, speed: 10, critChance: 0.1, critDamage: 2.0 },
    statGrowth: { maxHp: 6, attack: 3, defense: 0.5, speed: 1, critChance: 0.01, critDamage: 0.05 },
    spriteSheet: 'mage.png'
  },
  rogue: {
    name: 'rogue',
    displayName: 'Rogue',
    description: 'Fast and deadly, strikes first with high crit chance',
    baseStats: { maxHp: 85, attack: 14, defense: 7, speed: 18, critChance: 0.2, critDamage: 2.5 },
    statGrowth: { maxHp: 8, attack: 1.5, defense: 0.8, speed: 2, critChance: 0.015, critDamage: 0.08 },
    spriteSheet: 'rogue.png'
  },
  archer: {
    name: 'archer',
    displayName: 'Archer',
    description: 'Balanced fighter with consistent damage output',
    baseStats: { maxHp: 90, attack: 16, defense: 8, speed: 14, critChance: 0.12, critDamage: 1.8 },
    statGrowth: { maxHp: 9, attack: 2, defense: 1, speed: 1.5, critChance: 0.008, critDamage: 0.04 },
    spriteSheet: 'archer.png'
  }
};
```

**Step 3: Create src/types/battle.ts**

```typescript
import { CharacterStats, CharacterClass } from './character';

export type BattleStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface BattleParticipant {
  oderId: string;
  odeName: string;
  characterId: string;
  characterName: string;
  characterClass: CharacterClass;
  characterLevel: number;
  stats: CharacterStats;
  currentHp: number;
}

export interface BattleAction {
  turn: number;
  timestamp: Date;
  actorId: string;
  actionType: 'attack' | 'spell' | 'defend';
  targetId: string;
  damage: number;
  isCrit: boolean;
  resultingHp: number;
}

export interface Battle {
  id: string;
  status: BattleStatus;
  player1: BattleParticipant;
  player2: BattleParticipant;
  actions: BattleAction[];
  winnerId: string | null;
  createdAt: Date;
  completedAt: Date | null;
  rewards: BattleRewards | null;
}

export interface BattleRewards {
  oderId: string;
  xpGained: number;
  goldGained: number;
}
```

**Step 4: Create src/types/quest.ts**

```typescript
export type QuestType = 'daily' | 'streak' | 'achievement' | 'social';
export type QuestStatus = 'active' | 'completed' | 'expired';

export interface QuestRequirement {
  type: 'commits' | 'lines_added' | 'files_changed' | 'streak_days' | 'battles_won' | 'reviews_given';
  target: number;
  current: number;
}

export interface Quest {
  id: string;
  type: QuestType;
  title: string;
  description: string;
  requirement: QuestRequirement;
  rewards: QuestRewards;
  expiresAt: Date | null; // null for achievements
  status: QuestStatus;
}

export interface QuestRewards {
  xp: number;
  gold: number;
}

export interface UserQuests {
  oderId: string;
  activeQuests: Quest[];
  completedQuestIds: string[];
  lastDailyRefresh: Date;
}

// Quest templates for daily generation
export const DAILY_QUEST_TEMPLATES = [
  { title: 'Commit Warrior', description: 'Make {target} commits today', type: 'commits' as const, targetRange: [3, 10], xp: 50, gold: 25 },
  { title: 'Code Crafter', description: 'Add {target} lines of code', type: 'lines_added' as const, targetRange: [50, 200], xp: 75, gold: 40 },
  { title: 'File Explorer', description: 'Modify {target} different files', type: 'files_changed' as const, targetRange: [3, 8], xp: 40, gold: 20 },
];
```

**Step 5: Create src/types/worker.ts**

```typescript
export interface Worker {
  id: string;
  oderId: string;
  level: number;
  goldPerHour: number;
  purchasedAt: Date;
  lastCollectedAt: Date;
}

export interface WorkerConfig {
  baseCost: number;
  baseGoldPerHour: number;
  upgradeCostMultiplier: number;
  upgradeGoldMultiplier: number;
}

export const WORKER_CONFIG: WorkerConfig = {
  baseCost: 100,
  baseGoldPerHour: 5,
  upgradeCostMultiplier: 1.5,
  upgradeGoldMultiplier: 1.3
};

export function calculateWorkerUpgradeCost(currentLevel: number): number {
  return Math.floor(WORKER_CONFIG.baseCost * Math.pow(WORKER_CONFIG.upgradeCostMultiplier, currentLevel));
}

export function calculateWorkerGoldPerHour(level: number): number {
  return Math.floor(WORKER_CONFIG.baseGoldPerHour * Math.pow(WORKER_CONFIG.upgradeGoldMultiplier, level - 1));
}

export function calculatePendingGold(worker: Worker): number {
  const now = new Date();
  const hoursSinceCollection = (now.getTime() - worker.lastCollectedAt.getTime()) / (1000 * 60 * 60);
  return Math.floor(hoursSinceCollection * worker.goldPerHour);
}
```

**Step 6: Create src/types/index.ts**

```typescript
export * from './user';
export * from './character';
export * from './battle';
export * from './quest';
export * from './worker';
```

**Step 7: Commit**

```bash
git add src/types/
git commit -m "feat: add TypeScript data models for all game entities"
```

---

### Task 3: Create Firebase Service Layer

**Files:**
- Create: `src/services/firebase.ts`
- Create: `src/services/userService.ts`
- Create: `src/services/characterService.ts`
- Test: `tests/services/characterService.test.ts`

**Step 1: Create src/services/firebase.ts**

```typescript
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export function initializeFirebase(config: FirebaseConfig): void {
  if (app) return; // Already initialized

  app = initializeApp(config);
  db = getFirestore(app);
  auth = getAuth(app);
}

export function getDb(): Firestore {
  if (!db) throw new Error('Firebase not initialized. Call initializeFirebase first.');
  return db;
}

export function getAuthInstance(): Auth {
  if (!auth) throw new Error('Firebase not initialized. Call initializeFirebase first.');
  return auth;
}
```

**Step 2: Create src/services/userService.ts**

```typescript
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getDb } from './firebase';
import { User, UserStats, GitHubAccount, UserSettings } from '../types';

const USERS_COLLECTION = 'users';

export async function createUser(userId: string, email: string, displayName: string): Promise<User> {
  const db = getDb();
  const userRef = doc(db, USERS_COLLECTION, oderId);

  const newUser: User = {
    id: oderId,
    email,
    displayName,
    avatarUrl: undefined,
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
  const userRef = doc(db, USERS_COLLECTION, oderId);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) return null;
  return snapshot.data() as User;
}

export async function updateUserGold(userId: string, goldDelta: number): Promise<void> {
  const db = getDb();
  const userRef = doc(db, USERS_COLLECTION, oderId);
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
  const userRef = doc(db, USERS_COLLECTION, oderId);
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
  const userRef = doc(db, USERS_COLLECTION, oderId);

  await updateDoc(userRef, {
    activeCharacterId: characterId,
    updatedAt: serverTimestamp()
  });
}
```

**Step 3: Create src/services/characterService.ts**

```typescript
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { getDb } from './firebase';
import { Character, CharacterClass, CLASS_CONFIGS, CharacterStats } from '../types';
import { v4 as uuidv4 } from 'uuid';

const CHARACTERS_COLLECTION = 'characters';

export function calculateXpForLevel(level: number): number {
  // XP curve: each level requires 100 * level^1.5 XP
  return Math.floor(100 * Math.pow(level, 1.5));
}

export function calculateStatsForLevel(characterClass: CharacterClass, level: number): CharacterStats {
  const config = CLASS_CONFIGS[characterClass];
  const base = config.baseStats;
  const growth = config.statGrowth;
  const levelsGained = level - 1;

  return {
    maxHp: Math.floor(base.maxHp + growth.maxHp * levelsGained),
    attack: Math.floor(base.attack + growth.attack * levelsGained),
    defense: Math.floor(base.defense + growth.defense * levelsGained),
    speed: Math.floor(base.speed + growth.speed * levelsGained),
    critChance: Math.min(0.5, base.critChance + growth.critChance * levelsGained),
    critDamage: base.critDamage + growth.critDamage * levelsGained
  };
}

export async function createCharacter(
  userId: string,
  name: string,
  characterClass: CharacterClass
): Promise<Character> {
  const db = getDb();
  const characterId = uuidv4();
  const characterRef = doc(db, `users/${userId}/${CHARACTERS_COLLECTION}`, characterId);

  const character: Character = {
    id: characterId,
    oderId,
    name,
    class: characterClass,
    level: 1,
    xp: 0,
    xpToNextLevel: calculateXpForLevel(2),
    stats: calculateStatsForLevel(characterClass, 1),
    equippedWeaponId: null,
    equippedArmorId: null,
    equippedSpellIds: [],
    createdAt: new Date(),
    updatedAt: new Date()
  };

  await setDoc(characterRef, {
    ...character,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return character;
}

export async function getCharacter(userId: string, characterId: string): Promise<Character | null> {
  const db = getDb();
  const characterRef = doc(db, `users/${userId}/${CHARACTERS_COLLECTION}`, characterId);
  const snapshot = await getDoc(characterRef);

  if (!snapshot.exists()) return null;
  return snapshot.data() as Character;
}

export async function getUserCharacters(userId: string): Promise<Character[]> {
  const db = getDb();
  const charactersRef = collection(db, `users/${userId}/${CHARACTERS_COLLECTION}`);
  const snapshot = await getDocs(charactersRef);

  return snapshot.docs.map(doc => doc.data() as Character);
}

export async function addXpToCharacter(
  userId: string,
  characterId: string,
  xpAmount: number
): Promise<{ levelsGained: number; goldEarned: number }> {
  const character = await getCharacter(userId, characterId);
  if (!character) throw new Error('Character not found');

  let currentXp = character.xp + xpAmount;
  let currentLevel = character.level;
  let levelsGained = 0;
  let goldEarned = 0;

  // Check for level ups
  while (currentXp >= character.xpToNextLevel) {
    currentXp -= character.xpToNextLevel;
    currentLevel++;
    levelsGained++;
    goldEarned += currentLevel * 50; // Gold reward per level
  }

  const db = getDb();
  const characterRef = doc(db, `users/${userId}/${CHARACTERS_COLLECTION}`, characterId);

  const newStats = calculateStatsForLevel(character.class, currentLevel);
  const newXpToNext = calculateXpForLevel(currentLevel + 1);

  await updateDoc(characterRef, {
    xp: currentXp,
    level: currentLevel,
    xpToNextLevel: newXpToNext,
    stats: newStats,
    updatedAt: serverTimestamp()
  });

  return { levelsGained, goldEarned };
}

export const CLASS_CHANGE_COST = 500;

export async function changeCharacterClass(
  userId: string,
  characterId: string,
  newClass: CharacterClass,
  userGold: number
): Promise<void> {
  if (userGold < CLASS_CHANGE_COST) {
    throw new Error(`Not enough gold. Need ${CLASS_CHANGE_COST}, have ${userGold}`);
  }

  const character = await getCharacter(userId, characterId);
  if (!character) throw new Error('Character not found');

  if (character.class === newClass) {
    throw new Error('Character is already this class');
  }

  const db = getDb();
  const characterRef = doc(db, `users/${userId}/${CHARACTERS_COLLECTION}`, characterId);

  // Recalculate stats for new class at current level
  const newStats = calculateStatsForLevel(newClass, character.level);

  await updateDoc(characterRef, {
    class: newClass,
    stats: newStats,
    updatedAt: serverTimestamp()
  });
}
```

**Step 4: Write test file tests/services/characterService.test.ts**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateXpForLevel,
  calculateStatsForLevel,
  CLASS_CHANGE_COST
} from '../../src/services/characterService';
import { CLASS_CONFIGS } from '../../src/types';

describe('characterService', () => {
  describe('calculateXpForLevel', () => {
    it('should require more XP for higher levels', () => {
      const level2Xp = calculateXpForLevel(2);
      const level3Xp = calculateXpForLevel(3);
      const level10Xp = calculateXpForLevel(10);

      expect(level2Xp).toBeLessThan(level3Xp);
      expect(level3Xp).toBeLessThan(level10Xp);
    });

    it('should return reasonable values', () => {
      expect(calculateXpForLevel(2)).toBeGreaterThan(100);
      expect(calculateXpForLevel(2)).toBeLessThan(500);
      expect(calculateXpForLevel(10)).toBeGreaterThan(1000);
    });
  });

  describe('calculateStatsForLevel', () => {
    it('should return base stats at level 1', () => {
      const warriorStats = calculateStatsForLevel('warrior', 1);
      const config = CLASS_CONFIGS.warrior;

      expect(warriorStats.maxHp).toBe(config.baseStats.maxHp);
      expect(warriorStats.attack).toBe(config.baseStats.attack);
    });

    it('should increase stats with level', () => {
      const level1 = calculateStatsForLevel('mage', 1);
      const level10 = calculateStatsForLevel('mage', 10);

      expect(level10.maxHp).toBeGreaterThan(level1.maxHp);
      expect(level10.attack).toBeGreaterThan(level1.attack);
      expect(level10.speed).toBeGreaterThan(level1.speed);
    });

    it('should cap crit chance at 50%', () => {
      const level100 = calculateStatsForLevel('rogue', 100);
      expect(level100.critChance).toBeLessThanOrEqual(0.5);
    });

    it('should give different stats per class', () => {
      const warrior = calculateStatsForLevel('warrior', 5);
      const mage = calculateStatsForLevel('mage', 5);
      const rogue = calculateStatsForLevel('rogue', 5);

      // Warrior should have most HP
      expect(warrior.maxHp).toBeGreaterThan(mage.maxHp);
      expect(warrior.maxHp).toBeGreaterThan(rogue.maxHp);

      // Rogue should be fastest
      expect(rogue.speed).toBeGreaterThan(warrior.speed);
      expect(rogue.speed).toBeGreaterThan(mage.speed);
    });
  });

  describe('CLASS_CHANGE_COST', () => {
    it('should be 500 gold', () => {
      expect(CLASS_CHANGE_COST).toBe(500);
    });
  });
});
```

**Step 5: Set up Vitest and run tests**

```bash
npm install -D vitest
```

Add to package.json scripts:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

**Step 6: Run tests to verify**

```bash
npm test
```

Expected: All tests pass

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Firebase service layer with user and character services"
```

---

### Task 4: GitHub OAuth Service

**Files:**
- Create: `src/services/githubAuth.ts`
- Create: `src/services/githubApi.ts`
- Test: `tests/services/githubApi.test.ts`

**Step 1: Create src/services/githubAuth.ts**

```typescript
import { GithubAuthProvider, signInWithPopup, signInWithCredential, OAuthCredential } from 'firebase/auth';
import { getAuthInstance } from './firebase';
import { GitHubAccount } from '../types';

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
```

**Step 2: Create src/services/githubApi.ts**

```typescript
import { Octokit } from '@octokit/rest';
import { GitHubAccount } from '../types';

export interface CommitStats {
  totalCommits: number;
  linesAdded: number;
  linesRemoved: number;
  filesChanged: number;
}

export interface RepoCommitData {
  repo: string;
  commits: CommitStats;
  since: Date;
  until: Date;
}

export function createOctokit(account: GitHubAccount): Octokit {
  return new Octokit({
    auth: account.accessToken,
    baseUrl: account.isEnterprise && account.enterpriseUrl
      ? `${account.enterpriseUrl}/api/v3`
      : 'https://api.github.com'
  });
}

export async function getRepoCommitStats(
  account: GitHubAccount,
  owner: string,
  repo: string,
  since: Date,
  until: Date = new Date()
): Promise<CommitStats> {
  const octokit = createOctokit(account);

  const { data: commits } = await octokit.repos.listCommits({
    owner,
    repo,
    since: since.toISOString(),
    until: until.toISOString(),
    per_page: 100
  });

  let linesAdded = 0;
  let linesRemoved = 0;
  let filesChanged = 0;

  // Get detailed stats for each commit
  for (const commit of commits) {
    const { data: details } = await octokit.repos.getCommit({
      owner,
      repo,
      ref: commit.sha
    });

    linesAdded += details.stats?.additions || 0;
    linesRemoved += details.stats?.deletions || 0;
    filesChanged += details.files?.length || 0;
  }

  return {
    totalCommits: commits.length,
    linesAdded,
    linesRemoved,
    filesChanged
  };
}

export async function getUserRepos(account: GitHubAccount): Promise<string[]> {
  const octokit = createOctokit(account);

  const { data: repos } = await octokit.repos.listForAuthenticatedUser({
    per_page: 100,
    sort: 'pushed'
  });

  return repos.map(repo => repo.full_name);
}

export async function getTodayCommitStats(
  account: GitHubAccount,
  repoFullNames: string[]
): Promise<CommitStats> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const totals: CommitStats = {
    totalCommits: 0,
    linesAdded: 0,
    linesRemoved: 0,
    filesChanged: 0
  };

  for (const repoFullName of repoFullNames) {
    const [owner, repo] = repoFullName.split('/');
    try {
      const stats = await getRepoCommitStats(account, owner, repo, today);
      totals.totalCommits += stats.totalCommits;
      totals.linesAdded += stats.linesAdded;
      totals.linesRemoved += stats.linesRemoved;
      totals.filesChanged += stats.filesChanged;
    } catch (error) {
      // Repo might not be accessible, skip
      console.warn(`Failed to get stats for ${repoFullName}:`, error);
    }
  }

  return totals;
}
```

**Step 3: Install Octokit**

```bash
npm install @octokit/rest
```

**Step 4: Create tests/services/githubApi.test.ts**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createOctokit } from '../../src/services/githubApi';
import { GitHubAccount } from '../../src/types';

describe('githubApi', () => {
  describe('createOctokit', () => {
    it('should create Octokit with default GitHub URL for non-enterprise', () => {
      const account: GitHubAccount = {
        id: '123',
        username: 'testuser',
        accessToken: 'test-token',
        isEnterprise: false,
        linkedAt: new Date()
      };

      const octokit = createOctokit(account);
      expect(octokit).toBeDefined();
    });

    it('should create Octokit with enterprise URL when specified', () => {
      const account: GitHubAccount = {
        id: '456',
        username: 'enterpriseuser',
        accessToken: 'enterprise-token',
        isEnterprise: true,
        enterpriseUrl: 'https://github.mycompany.com',
        linkedAt: new Date()
      };

      const octokit = createOctokit(account);
      expect(octokit).toBeDefined();
    });
  });
});
```

**Step 5: Run tests**

```bash
npm test
```

Expected: All tests pass

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add GitHub OAuth and API services"
```

---

## Workstream B: VSCode Extension Shell

### Task 5: Initialize VSCode Extension

**Files:**
- Create: `extension/package.json`
- Create: `extension/src/extension.ts`
- Create: `extension/tsconfig.json`
- Create: `extension/.vscodeignore`

**Step 1: Create extension directory structure**

```bash
mkdir -p /Users/diyagamah/Documents/gitrpg/extension/src
mkdir -p /Users/diyagamah/Documents/gitrpg/extension/media
```

**Step 2: Create extension/package.json**

```json
{
  "name": "gitrpg",
  "displayName": "GitRPG",
  "description": "Turn your coding into an RPG - earn XP, level up characters, battle friends!",
  "version": "0.0.1",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["Other"],
  "activationEvents": ["onStartupFinished"],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "gitrpg.showDashboard",
        "title": "GitRPG: Show Dashboard"
      },
      {
        "command": "gitrpg.showCharacter",
        "title": "GitRPG: Show Character"
      },
      {
        "command": "gitrpg.startBattle",
        "title": "GitRPG: Start Battle"
      }
    ],
    "viewsContainers": {
      "activitybar": [
        {
          "id": "gitrpg",
          "title": "GitRPG",
          "icon": "media/icon.svg"
        }
      ]
    },
    "views": {
      "gitrpg": [
        {
          "type": "webview",
          "id": "gitrpg.mainView",
          "name": "GitRPG"
        }
      ]
    }
  },
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "lint": "eslint src --ext ts"
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "@types/node": "^20.x",
    "typescript": "^5.3.0"
  },
  "dependencies": {
    "firebase": "^10.7.0"
  }
}
```

**Step 3: Create extension/tsconfig.json**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "lib": ["ES2022"],
    "outDir": "out",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "exclude": ["node_modules", ".vscode-test"]
}
```

**Step 4: Create extension/src/extension.ts**

```typescript
import * as vscode from 'vscode';

let mainPanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('GitRPG extension is now active!');

  // Register commands
  const showDashboardCmd = vscode.commands.registerCommand('gitrpg.showDashboard', () => {
    showMainPanel(context, 'dashboard');
  });

  const showCharacterCmd = vscode.commands.registerCommand('gitrpg.showCharacter', () => {
    showMainPanel(context, 'character');
  });

  const startBattleCmd = vscode.commands.registerCommand('gitrpg.startBattle', () => {
    showMainPanel(context, 'battle');
  });

  context.subscriptions.push(showDashboardCmd, showCharacterCmd, startBattleCmd);

  // Register webview provider for sidebar
  const provider = new GitRPGViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('gitrpg.mainView', provider)
  );
}

function showMainPanel(context: vscode.ExtensionContext, view: string) {
  if (mainPanel) {
    mainPanel.reveal();
    mainPanel.webview.postMessage({ type: 'navigate', view });
    return;
  }

  mainPanel = vscode.window.createWebviewPanel(
    'gitrpg',
    'GitRPG',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
    }
  );

  mainPanel.webview.html = getWebviewContent(mainPanel.webview, context.extensionUri, view);

  mainPanel.onDidDispose(() => {
    mainPanel = undefined;
  });

  // Handle messages from webview
  mainPanel.webview.onDidReceiveMessage(
    message => {
      switch (message.type) {
        case 'alert':
          vscode.window.showInformationMessage(message.text);
          break;
        case 'error':
          vscode.window.showErrorMessage(message.text);
          break;
      }
    },
    undefined,
    context.subscriptions
  );
}

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri, initialView: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:;">
  <title>GitRPG</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 20px;
      margin: 0;
    }
    h1 { color: var(--vscode-textLink-foreground); }
    .container { max-width: 800px; margin: 0 auto; }
    .loading { text-align: center; padding: 40px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="loading">
      <h1>GitRPG</h1>
      <p>Loading ${initialView}...</p>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const initialView = '${initialView}';

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'navigate') {
        // Handle navigation
        console.log('Navigating to:', message.view);
      }
    });
  </script>
</body>
</html>`;
}

class GitRPGViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.html = this.getSidebarContent(webviewView.webview);
  }

  private getSidebarContent(webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      padding: 10px;
      margin: 0;
    }
    .stat { margin: 8px 0; }
    .stat-label { font-size: 11px; opacity: 0.7; }
    .stat-value { font-size: 16px; font-weight: bold; }
    .character-preview {
      width: 64px;
      height: 64px;
      margin: 10px auto;
      background: var(--vscode-editor-background);
      border: 2px solid var(--vscode-textLink-foreground);
      image-rendering: pixelated;
    }
    button {
      width: 100%;
      padding: 8px;
      margin: 4px 0;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      cursor: pointer;
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
  </style>
</head>
<body>
  <div class="character-preview" id="characterSprite"></div>

  <div class="stat">
    <div class="stat-label">Level</div>
    <div class="stat-value" id="level">1</div>
  </div>

  <div class="stat">
    <div class="stat-label">XP</div>
    <div class="stat-value" id="xp">0 / 100</div>
  </div>

  <div class="stat">
    <div class="stat-label">Gold</div>
    <div class="stat-value" id="gold">0</div>
  </div>

  <div class="stat">
    <div class="stat-label">Today's Commits</div>
    <div class="stat-value" id="commits">0</div>
  </div>

  <button onclick="openDashboard()">Open Dashboard</button>
  <button onclick="startBattle()">Battle!</button>

  <script>
    const vscode = acquireVsCodeApi();

    function openDashboard() {
      vscode.postMessage({ type: 'command', command: 'gitrpg.showDashboard' });
    }

    function startBattle() {
      vscode.postMessage({ type: 'command', command: 'gitrpg.startBattle' });
    }
  </script>
</body>
</html>`;
  }
}

export function deactivate() {}
```

**Step 5: Create extension/.vscodeignore**

```
.vscode/**
.vscode-test/**
src/**
.gitignore
tsconfig.json
**/*.map
**/*.ts
```

**Step 6: Install extension dependencies and compile**

```bash
cd /Users/diyagamah/Documents/gitrpg/extension
npm install
npm run compile
```

**Step 7: Commit**

```bash
cd /Users/diyagamah/Documents/gitrpg
git add extension/
git commit -m "feat: initialize VSCode extension with webview panels"
```

---

### Task 6: Create Sprite Loading System

**Files:**
- Create: `extension/src/sprites/spriteLoader.ts`
- Create: `extension/src/sprites/spriteAnimator.ts`
- Create: `extension/media/sprites/.gitkeep`
- Test: `extension/tests/sprites/spriteLoader.test.ts`

**Step 1: Create extension/src/sprites/spriteLoader.ts**

```typescript
import * as vscode from 'vscode';
import * as path from 'path';

export interface SpriteFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SpriteAnimation {
  name: string;
  frames: SpriteFrame[];
  frameRate: number; // frames per second
  loop: boolean;
}

export interface SpriteSheet {
  imagePath: string;
  imageUri: vscode.Uri;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  animations: Map<string, SpriteAnimation>;
}

// Magenta chroma key color to filter out
export const CHROMA_KEY_COLOR = '#FF00FF';

export interface SpriteSheetConfig {
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  animations: {
    name: string;
    row: number;
    frameCount: number;
    frameRate: number;
    loop: boolean;
  }[];
}

// Configuration for our character sprite sheets
export const CHARACTER_SPRITE_CONFIG: SpriteSheetConfig = {
  frameWidth: 64,
  frameHeight: 64,
  columns: 6,
  rows: 6,
  animations: [
    { name: 'idle', row: 0, frameCount: 3, frameRate: 4, loop: true },
    { name: 'walk', row: 1, frameCount: 6, frameRate: 8, loop: true },
    { name: 'attack', row: 2, frameCount: 6, frameRate: 12, loop: false },
    { name: 'hurt', row: 3, frameCount: 3, frameRate: 6, loop: false },
    { name: 'death', row: 4, frameCount: 6, frameRate: 6, loop: false },
    { name: 'victory', row: 5, frameCount: 3, frameRate: 4, loop: true }
  ]
};

export function loadSpriteSheet(
  extensionUri: vscode.Uri,
  spriteName: string,
  config: SpriteSheetConfig
): SpriteSheet {
  const imagePath = path.join('media', 'sprites', `${spriteName}.png`);
  const imageUri = vscode.Uri.joinPath(extensionUri, imagePath);

  const animations = new Map<string, SpriteAnimation>();

  for (const animConfig of config.animations) {
    const frames: SpriteFrame[] = [];

    for (let col = 0; col < animConfig.frameCount; col++) {
      frames.push({
        x: col * config.frameWidth,
        y: animConfig.row * config.frameHeight,
        width: config.frameWidth,
        height: config.frameHeight
      });
    }

    animations.set(animConfig.name, {
      name: animConfig.name,
      frames,
      frameRate: animConfig.frameRate,
      loop: animConfig.loop
    });
  }

  return {
    imagePath,
    imageUri,
    frameWidth: config.frameWidth,
    frameHeight: config.frameHeight,
    columns: config.columns,
    rows: config.rows,
    animations
  };
}

export function getSpriteFrameCss(frame: SpriteFrame, scale: number = 1): string {
  return `
    width: ${frame.width * scale}px;
    height: ${frame.height * scale}px;
    background-position: -${frame.x * scale}px -${frame.y * scale}px;
    background-size: ${frame.width * 6 * scale}px auto;
    image-rendering: pixelated;
  `;
}
```

**Step 2: Create extension/src/sprites/spriteAnimator.ts**

```typescript
import { SpriteSheet, SpriteAnimation, SpriteFrame } from './spriteLoader';

export interface AnimationState {
  currentAnimation: string;
  currentFrame: number;
  elapsedTime: number;
  isPlaying: boolean;
  onComplete?: () => void;
}

export class SpriteAnimator {
  private spriteSheet: SpriteSheet;
  private state: AnimationState;
  private lastTimestamp: number = 0;

  constructor(spriteSheet: SpriteSheet, initialAnimation: string = 'idle') {
    this.spriteSheet = spriteSheet;
    this.state = {
      currentAnimation: initialAnimation,
      currentFrame: 0,
      elapsedTime: 0,
      isPlaying: true
    };
  }

  play(animationName: string, onComplete?: () => void): void {
    const animation = this.spriteSheet.animations.get(animationName);
    if (!animation) {
      console.warn(`Animation '${animationName}' not found`);
      return;
    }

    this.state = {
      currentAnimation: animationName,
      currentFrame: 0,
      elapsedTime: 0,
      isPlaying: true,
      onComplete
    };
  }

  stop(): void {
    this.state.isPlaying = false;
  }

  resume(): void {
    this.state.isPlaying = true;
  }

  update(timestamp: number): SpriteFrame {
    const animation = this.spriteSheet.animations.get(this.state.currentAnimation);
    if (!animation) {
      return { x: 0, y: 0, width: 64, height: 64 };
    }

    if (this.state.isPlaying) {
      const deltaTime = this.lastTimestamp ? (timestamp - this.lastTimestamp) / 1000 : 0;
      this.lastTimestamp = timestamp;

      this.state.elapsedTime += deltaTime;
      const frameDuration = 1 / animation.frameRate;

      while (this.state.elapsedTime >= frameDuration) {
        this.state.elapsedTime -= frameDuration;
        this.state.currentFrame++;

        if (this.state.currentFrame >= animation.frames.length) {
          if (animation.loop) {
            this.state.currentFrame = 0;
          } else {
            this.state.currentFrame = animation.frames.length - 1;
            this.state.isPlaying = false;
            if (this.state.onComplete) {
              this.state.onComplete();
            }
          }
        }
      }
    }

    return animation.frames[this.state.currentFrame];
  }

  getCurrentFrame(): SpriteFrame {
    const animation = this.spriteSheet.animations.get(this.state.currentAnimation);
    if (!animation) {
      return { x: 0, y: 0, width: 64, height: 64 };
    }
    return animation.frames[this.state.currentFrame];
  }

  getCurrentAnimation(): string {
    return this.state.currentAnimation;
  }

  isPlaying(): boolean {
    return this.state.isPlaying;
  }
}

export function generateAnimationCSS(spriteSheet: SpriteSheet): string {
  let css = '';

  for (const [name, animation] of spriteSheet.animations) {
    const keyframes = animation.frames.map((frame, index) => {
      const percentage = (index / animation.frames.length) * 100;
      return `${percentage}% { background-position: -${frame.x}px -${frame.y}px; }`;
    }).join('\n');

    const duration = animation.frames.length / animation.frameRate;
    const iterationCount = animation.loop ? 'infinite' : '1';

    css += `
@keyframes ${name} {
  ${keyframes}
  100% { background-position: -${animation.frames[animation.frames.length - 1].x}px -${animation.frames[animation.frames.length - 1].y}px; }
}

.animation-${name} {
  animation: ${name} ${duration}s steps(1) ${iterationCount};
}
`;
  }

  return css;
}
```

**Step 3: Create media/sprites directory**

```bash
mkdir -p /Users/diyagamah/Documents/gitrpg/extension/media/sprites
touch /Users/diyagamah/Documents/gitrpg/extension/media/sprites/.gitkeep
```

**Step 4: Copy the user's sprite sheet**

```bash
cp /Users/diyagamah/Downloads/Gemini_Generated_Image_a2ent8a2ent8a2en.png /Users/diyagamah/Documents/gitrpg/extension/media/sprites/characters.png
```

**Step 5: Create test file**

```typescript
// extension/tests/sprites/spriteLoader.test.ts
import { describe, it, expect } from 'vitest';
import {
  CHARACTER_SPRITE_CONFIG,
  CHROMA_KEY_COLOR,
  getSpriteFrameCss
} from '../../src/sprites/spriteLoader';

describe('spriteLoader', () => {
  describe('CHARACTER_SPRITE_CONFIG', () => {
    it('should have correct frame dimensions', () => {
      expect(CHARACTER_SPRITE_CONFIG.frameWidth).toBe(64);
      expect(CHARACTER_SPRITE_CONFIG.frameHeight).toBe(64);
    });

    it('should have all required animations', () => {
      const animationNames = CHARACTER_SPRITE_CONFIG.animations.map(a => a.name);
      expect(animationNames).toContain('idle');
      expect(animationNames).toContain('attack');
      expect(animationNames).toContain('hurt');
      expect(animationNames).toContain('death');
    });
  });

  describe('CHROMA_KEY_COLOR', () => {
    it('should be magenta', () => {
      expect(CHROMA_KEY_COLOR).toBe('#FF00FF');
    });
  });

  describe('getSpriteFrameCss', () => {
    it('should generate correct CSS for a frame', () => {
      const frame = { x: 64, y: 128, width: 64, height: 64 };
      const css = getSpriteFrameCss(frame, 2);

      expect(css).toContain('width: 128px');
      expect(css).toContain('height: 128px');
      expect(css).toContain('background-position: -128px -256px');
      expect(css).toContain('image-rendering: pixelated');
    });
  });
});
```

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add sprite loading and animation system"
```

---

## Workstream C: Git Tracking

### Task 7: Create Git Watcher Service

**Files:**
- Create: `src/services/gitWatcher.ts`
- Create: `src/services/activityTracker.ts`
- Test: `tests/services/gitWatcher.test.ts`

**Step 1: Create src/services/gitWatcher.ts**

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export interface GitCommit {
  hash: string;
  author: string;
  email: string;
  date: Date;
  message: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface GitRepoStats {
  repoPath: string;
  totalCommits: number;
  totalInsertions: number;
  totalDeletions: number;
  totalFilesChanged: number;
  commits: GitCommit[];
}

export async function isGitRepo(dirPath: string): Promise<boolean> {
  try {
    const gitPath = path.join(dirPath, '.git');
    return fs.existsSync(gitPath);
  } catch {
    return false;
  }
}

export async function getRepoCommitsSince(
  repoPath: string,
  since: Date,
  authorEmail?: string
): Promise<GitCommit[]> {
  const sinceStr = since.toISOString();
  const authorFilter = authorEmail ? `--author=${authorEmail}` : '';

  const command = `git log --since="${sinceStr}" ${authorFilter} --pretty=format:"%H|%an|%ae|%aI|%s" --shortstat`;

  try {
    const { stdout } = await execAsync(command, { cwd: repoPath });
    return parseGitLog(stdout);
  } catch (error) {
    console.error(`Failed to get commits from ${repoPath}:`, error);
    return [];
  }
}

export function parseGitLog(logOutput: string): GitCommit[] {
  const commits: GitCommit[] = [];
  const lines = logOutput.split('\n').filter(line => line.trim());

  let i = 0;
  while (i < lines.length) {
    const commitLine = lines[i];
    if (!commitLine.includes('|')) {
      i++;
      continue;
    }

    const [hash, author, email, dateStr, message] = commitLine.split('|');

    let filesChanged = 0;
    let insertions = 0;
    let deletions = 0;

    // Check next line for stats
    if (i + 1 < lines.length) {
      const statsLine = lines[i + 1];
      const filesMatch = statsLine.match(/(\d+) files? changed/);
      const insertMatch = statsLine.match(/(\d+) insertions?\(\+\)/);
      const deleteMatch = statsLine.match(/(\d+) deletions?\(-\)/);

      if (filesMatch) filesChanged = parseInt(filesMatch[1], 10);
      if (insertMatch) insertions = parseInt(insertMatch[1], 10);
      if (deleteMatch) deletions = parseInt(deleteMatch[1], 10);

      if (filesMatch || insertMatch || deleteMatch) {
        i++; // Skip stats line
      }
    }

    commits.push({
      hash,
      author,
      email,
      date: new Date(dateStr),
      message,
      filesChanged,
      insertions,
      deletions
    });

    i++;
  }

  return commits;
}

export async function getRepoStats(
  repoPath: string,
  since: Date,
  authorEmail?: string
): Promise<GitRepoStats> {
  const commits = await getRepoCommitsSince(repoPath, since, authorEmail);

  return {
    repoPath,
    totalCommits: commits.length,
    totalInsertions: commits.reduce((sum, c) => sum + c.insertions, 0),
    totalDeletions: commits.reduce((sum, c) => sum + c.deletions, 0),
    totalFilesChanged: commits.reduce((sum, c) => sum + c.filesChanged, 0),
    commits
  };
}

export async function findGitReposInWorkspace(workspacePath: string): Promise<string[]> {
  const repos: string[] = [];

  async function search(dir: string, depth: number = 0): Promise<void> {
    if (depth > 3) return; // Don't search too deep

    if (await isGitRepo(dir)) {
      repos.push(dir);
      return; // Don't search inside git repos
    }

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await search(path.join(dir, entry.name), depth + 1);
        }
      }
    } catch {
      // Permission denied or other error, skip
    }
  }

  await search(workspacePath);
  return repos;
}
```

**Step 2: Create src/services/activityTracker.ts**

```typescript
import { getRepoStats, GitRepoStats, findGitReposInWorkspace } from './gitWatcher';
import { addXpToCharacter } from './characterService';
import { updateUserGold } from './userService';

export interface ActivityStats {
  commits: number;
  linesAdded: number;
  linesRemoved: number;
  filesChanged: number;
  xpEarned: number;
}

export interface XpConfig {
  perCommit: number;
  perLineAdded: number;
  perLineRemoved: number;
  perFileChanged: number;
  maxLinesPerCommit: number; // Cap to prevent gaming
}

export const DEFAULT_XP_CONFIG: XpConfig = {
  perCommit: 10,
  perLineAdded: 0.5,
  perLineRemoved: 0.25,
  perFileChanged: 2,
  maxLinesPerCommit: 500 // Lines beyond this don't count
};

export function calculateXpFromStats(
  stats: GitRepoStats,
  config: XpConfig = DEFAULT_XP_CONFIG
): number {
  let totalXp = 0;

  for (const commit of stats.commits) {
    // Cap lines per commit to prevent gaming
    const cappedInsertions = Math.min(commit.insertions, config.maxLinesPerCommit);
    const cappedDeletions = Math.min(commit.deletions, config.maxLinesPerCommit);

    totalXp += config.perCommit;
    totalXp += cappedInsertions * config.perLineAdded;
    totalXp += cappedDeletions * config.perLineRemoved;
    totalXp += commit.filesChanged * config.perFileChanged;
  }

  return Math.floor(totalXp);
}

export interface TrackedActivity {
  oderId: string;
  lastCheckedAt: Date;
  trackedRepos: string[];
  todayStats: ActivityStats;
}

export async function trackActivityForUser(
  userId: string,
  characterId: string,
  workspacePaths: string[],
  authorEmail: string,
  lastCheckedAt: Date
): Promise<ActivityStats> {
  const now = new Date();
  const stats: ActivityStats = {
    commits: 0,
    linesAdded: 0,
    linesRemoved: 0,
    filesChanged: 0,
    xpEarned: 0
  };

  // Find all git repos in workspaces
  const allRepos: string[] = [];
  for (const workspace of workspacePaths) {
    const repos = await findGitReposInWorkspace(workspace);
    allRepos.push(...repos);
  }

  // Get stats from each repo since last check
  for (const repoPath of allRepos) {
    const repoStats = await getRepoStats(repoPath, lastCheckedAt, authorEmail);

    stats.commits += repoStats.totalCommits;
    stats.linesAdded += repoStats.totalInsertions;
    stats.linesRemoved += repoStats.totalDeletions;
    stats.filesChanged += repoStats.totalFilesChanged;

    const xp = calculateXpFromStats(repoStats);
    stats.xpEarned += xp;
  }

  // Award XP to character if any was earned
  if (stats.xpEarned > 0 && characterId) {
    const result = await addXpToCharacter(userId, characterId, stats.xpEarned);

    // Award gold from level ups
    if (result.goldEarned > 0) {
      await updateUserGold(userId, result.goldEarned);
    }
  }

  return stats;
}
```

**Step 3: Create tests/services/gitWatcher.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { parseGitLog } from '../../src/services/gitWatcher';
import { calculateXpFromStats, DEFAULT_XP_CONFIG } from '../../src/services/activityTracker';

describe('gitWatcher', () => {
  describe('parseGitLog', () => {
    it('should parse a simple commit log', () => {
      const log = `abc123|John Doe|john@example.com|2024-01-01T10:00:00Z|feat: add feature
 3 files changed, 50 insertions(+), 10 deletions(-)`;

      const commits = parseGitLog(log);

      expect(commits).toHaveLength(1);
      expect(commits[0].hash).toBe('abc123');
      expect(commits[0].author).toBe('John Doe');
      expect(commits[0].filesChanged).toBe(3);
      expect(commits[0].insertions).toBe(50);
      expect(commits[0].deletions).toBe(10);
    });

    it('should parse multiple commits', () => {
      const log = `abc123|John|john@example.com|2024-01-01T10:00:00Z|first commit
 1 file changed, 10 insertions(+)
def456|John|john@example.com|2024-01-01T11:00:00Z|second commit
 2 files changed, 20 insertions(+), 5 deletions(-)`;

      const commits = parseGitLog(log);

      expect(commits).toHaveLength(2);
      expect(commits[0].insertions).toBe(10);
      expect(commits[1].insertions).toBe(20);
    });
  });
});

describe('activityTracker', () => {
  describe('calculateXpFromStats', () => {
    it('should calculate XP correctly', () => {
      const stats = {
        repoPath: '/test',
        totalCommits: 2,
        totalInsertions: 100,
        totalDeletions: 20,
        totalFilesChanged: 5,
        commits: [
          { hash: '1', author: 'a', email: 'a@a.com', date: new Date(), message: 'm', filesChanged: 3, insertions: 60, deletions: 10 },
          { hash: '2', author: 'a', email: 'a@a.com', date: new Date(), message: 'm', filesChanged: 2, insertions: 40, deletions: 10 }
        ]
      };

      const xp = calculateXpFromStats(stats);

      // 2 commits * 10 = 20
      // 100 lines * 0.5 = 50
      // 20 deletions * 0.25 = 5
      // 5 files * 2 = 10
      // Total = 85
      expect(xp).toBe(85);
    });

    it('should cap lines per commit to prevent gaming', () => {
      const stats = {
        repoPath: '/test',
        totalCommits: 1,
        totalInsertions: 10000,
        totalDeletions: 0,
        totalFilesChanged: 1,
        commits: [
          { hash: '1', author: 'a', email: 'a@a.com', date: new Date(), message: 'm', filesChanged: 1, insertions: 10000, deletions: 0 }
        ]
      };

      const xp = calculateXpFromStats(stats);

      // Should cap at 500 lines: 500 * 0.5 = 250 + 10 (commit) + 2 (file) = 262
      expect(xp).toBe(262);
    });
  });
});
```

**Step 4: Run tests**

```bash
npm test
```

Expected: All tests pass

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add git watcher and activity tracking services"
```

---

## Workstream D: Continue in Part 2

The remaining tasks are documented in Part 2:
- Tasks 8-12: Git tracking completion
- Tasks 13-16: Battle system
- Tasks 17-20: Quest and worker systems
- Tasks 21-24: Web dashboard

---

## Agent Execution Instructions

**For parallel execution:**

1. **Spawn 4 code-executor agents** (one per workstream A-D)
2. **Each agent works on their workstream's tasks sequentially**
3. **After each task, spawn code-reviewer agent to review**
4. **Merge completed workstreams when done**

**Dependency graph:**
```
Workstream A (Tasks 1-4) ──┐
Workstream B (Tasks 5-6) ──┼──> Integration (Part 2)
Workstream C (Task 7)    ──┤
Workstream D (Sprites)   ──┘
```

All workstreams A-D can run in parallel. Part 2 tasks have dependencies on Part 1 completion.
