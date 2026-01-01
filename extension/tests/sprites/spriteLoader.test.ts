import { describe, it, expect, vi } from 'vitest';

// Mock vscode module before importing spriteLoader
vi.mock('vscode', () => ({
  Uri: {
    joinPath: vi.fn((uri, ...pathSegments) => ({
      path: pathSegments.join('/'),
      fsPath: pathSegments.join('/')
    }))
  }
}));

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
