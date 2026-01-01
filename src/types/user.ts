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
