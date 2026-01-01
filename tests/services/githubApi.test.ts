import { describe, it, expect } from 'vitest';
import { createOctokit } from '../../src/services/githubApi';
import type { GitHubAccount } from '../../src/types';

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
