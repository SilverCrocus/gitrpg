# SVG Sprite System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace PNG sprite sheets with modular SVG sprites to eliminate coordinate math and enable character customization.

**Architecture:** Create individual SVG files for each animation frame, build a `CharacterSprite` React component that loads and animates them, then replace the existing 150-line canvas-based `AnimatedSprite` in `page.tsx`.

**Tech Stack:** React, TypeScript, SVG, CSS animations

---

## Task 1: Create SVG Directory Structure

**Files:**
- Create: `dashboard/public/sprites/characters/warrior/idle.svg`
- Create: `dashboard/public/sprites/characters/warrior/animations/` directory

**Step 1: Create directory structure**

```bash
mkdir -p dashboard/public/sprites/characters/warrior/animations
mkdir -p dashboard/public/sprites/characters/mage/animations
mkdir -p dashboard/public/sprites/characters/rogue/animations
mkdir -p dashboard/public/sprites/characters/archer/animations
```

**Step 2: Move sample warrior SVG to proper location**

```bash
cp dashboard/public/sprites/warrior-sample.svg dashboard/public/sprites/characters/warrior/idle.svg
```

**Step 3: Commit**

```bash
git add dashboard/public/sprites/characters/
git commit -m "feat: create SVG sprite directory structure"
```

---

## Task 2: Create CharacterSprite Component - Types and Config

**Files:**
- Create: `dashboard/src/components/CharacterSprite/types.ts`

**Step 1: Create the types file**

```typescript
// dashboard/src/components/CharacterSprite/types.ts

export type CharacterClass = 'warrior' | 'mage' | 'rogue' | 'archer';

export type AnimationName = 'idle' | 'walk' | 'attack' | 'hurt' | 'death' | 'victory';

export interface AnimationConfig {
  frames: number;
  frameRate: number;
  loop: boolean;
}

export interface CharacterSpriteProps {
  /** Character class determines which sprite set to load */
  characterClass: CharacterClass;

  /** Static pose to display (ignored if animation is set) */
  pose?: AnimationName;

  /** Animation to play (overrides pose) */
  animation?: AnimationName;

  /** Size in pixels (SVG scales cleanly) */
  size?: number;

  /** Frame rate override (default from animation config) */
  frameRate?: number;

  /** Callback when non-looping animation completes */
  onAnimationComplete?: () => void;

  /** Custom colors (future: for equipment recoloring) */
  colors?: {
    armorPrimary?: string;
    armorSecondary?: string;
  };
}

export const ANIMATION_CONFIG: Record<CharacterClass, Record<AnimationName, AnimationConfig>> = {
  warrior: {
    idle: { frames: 3, frameRate: 4, loop: true },
    walk: { frames: 6, frameRate: 8, loop: true },
    attack: { frames: 6, frameRate: 12, loop: false },
    hurt: { frames: 3, frameRate: 6, loop: false },
    death: { frames: 6, frameRate: 6, loop: false },
    victory: { frames: 3, frameRate: 4, loop: true },
  },
  mage: {
    idle: { frames: 3, frameRate: 4, loop: true },
    walk: { frames: 6, frameRate: 8, loop: true },
    attack: { frames: 6, frameRate: 12, loop: false },
    hurt: { frames: 3, frameRate: 6, loop: false },
    death: { frames: 6, frameRate: 6, loop: false },
    victory: { frames: 3, frameRate: 4, loop: true },
  },
  rogue: {
    idle: { frames: 3, frameRate: 4, loop: true },
    walk: { frames: 6, frameRate: 8, loop: true },
    attack: { frames: 6, frameRate: 12, loop: false },
    hurt: { frames: 3, frameRate: 6, loop: false },
    death: { frames: 6, frameRate: 6, loop: false },
    victory: { frames: 3, frameRate: 4, loop: true },
  },
  archer: {
    idle: { frames: 3, frameRate: 4, loop: true },
    walk: { frames: 6, frameRate: 8, loop: true },
    attack: { frames: 6, frameRate: 12, loop: false },
    hurt: { frames: 3, frameRate: 6, loop: false },
    death: { frames: 6, frameRate: 6, loop: false },
    victory: { frames: 3, frameRate: 4, loop: true },
  },
};
```

**Step 2: Verify file was created correctly**

```bash
cat dashboard/src/components/CharacterSprite/types.ts
```

**Step 3: Commit**

```bash
git add dashboard/src/components/CharacterSprite/types.ts
git commit -m "feat: add CharacterSprite types and animation config"
```

---

## Task 3: Create CharacterSprite Component - Main Component

**Files:**
- Create: `dashboard/src/components/CharacterSprite/CharacterSprite.tsx`

**Step 1: Create the main component**

```tsx
// dashboard/src/components/CharacterSprite/CharacterSprite.tsx

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CharacterSpriteProps,
  CharacterClass,
  AnimationName,
  ANIMATION_CONFIG,
} from './types';

/**
 * Get the path to a sprite SVG file
 */
function getSpritePath(
  characterClass: CharacterClass,
  animation: AnimationName,
  frame?: number
): string {
  if (frame !== undefined) {
    return `/sprites/characters/${characterClass}/animations/${animation}-${frame + 1}.svg`;
  }
  // Static pose uses the base idle.svg
  return `/sprites/characters/${characterClass}/idle.svg`;
}

/**
 * CharacterSprite - Displays animated or static character sprites using SVG
 *
 * Usage:
 * ```tsx
 * // Static sprite
 * <CharacterSprite characterClass="warrior" size={128} />
 *
 * // Animated sprite
 * <CharacterSprite characterClass="warrior" animation="idle" size={128} />
 * ```
 */
export function CharacterSprite({
  characterClass,
  pose = 'idle',
  animation,
  size = 64,
  frameRate: frameRateOverride,
  onAnimationComplete,
}: CharacterSpriteProps) {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [imageSrc, setImageSrc] = useState<string>('');

  // Determine if we're animating or showing static
  const isAnimating = animation !== undefined;
  const activeAnimation = animation || pose;
  const config = ANIMATION_CONFIG[characterClass][activeAnimation];
  const frameRate = frameRateOverride ?? config.frameRate;

  // Update image source when frame or animation changes
  useEffect(() => {
    if (isAnimating) {
      setImageSrc(getSpritePath(characterClass, activeAnimation, currentFrame));
    } else {
      setImageSrc(getSpritePath(characterClass, pose));
    }
  }, [characterClass, activeAnimation, pose, currentFrame, isAnimating]);

  // Animation loop
  useEffect(() => {
    if (!isAnimating) {
      setCurrentFrame(0);
      return;
    }

    const interval = setInterval(() => {
      setCurrentFrame((prev) => {
        const nextFrame = prev + 1;

        if (nextFrame >= config.frames) {
          if (config.loop) {
            return 0;
          } else {
            // Non-looping animation complete
            clearInterval(interval);
            onAnimationComplete?.();
            return prev; // Stay on last frame
          }
        }

        return nextFrame;
      });
    }, 1000 / frameRate);

    return () => clearInterval(interval);
  }, [isAnimating, config.frames, config.loop, frameRate, onAnimationComplete]);

  // Reset frame when animation changes
  useEffect(() => {
    setCurrentFrame(0);
  }, [animation, characterClass]);

  // Handle missing sprite gracefully
  const handleError = useCallback(() => {
    // Fall back to static idle sprite if animation frame not found
    setImageSrc(getSpritePath(characterClass, 'idle'));
  }, [characterClass]);

  return (
    <img
      src={imageSrc}
      alt={`${characterClass} ${activeAnimation}`}
      width={size}
      height={size}
      onError={handleError}
      style={{
        display: 'block',
        imageRendering: 'auto', // SVG doesn't need pixelated
      }}
    />
  );
}
```

**Step 2: Verify file was created**

```bash
head -20 dashboard/src/components/CharacterSprite/CharacterSprite.tsx
```

**Step 3: Commit**

```bash
git add dashboard/src/components/CharacterSprite/CharacterSprite.tsx
git commit -m "feat: add CharacterSprite component with animation support"
```

---

## Task 4: Create CharacterSprite Index Export

**Files:**
- Create: `dashboard/src/components/CharacterSprite/index.ts`

**Step 1: Create the index file**

```typescript
// dashboard/src/components/CharacterSprite/index.ts

export { CharacterSprite } from './CharacterSprite';
export type {
  CharacterSpriteProps,
  CharacterClass,
  AnimationName,
  AnimationConfig,
} from './types';
export { ANIMATION_CONFIG } from './types';
```

**Step 2: Commit**

```bash
git add dashboard/src/components/CharacterSprite/index.ts
git commit -m "feat: add CharacterSprite index export"
```

---

## Task 5: Create Animation Frame SVGs for Warrior

**Files:**
- Create: `dashboard/public/sprites/characters/warrior/animations/idle-1.svg`
- Create: `dashboard/public/sprites/characters/warrior/animations/idle-2.svg`
- Create: `dashboard/public/sprites/characters/warrior/animations/idle-3.svg`

**Step 1: Create idle-1.svg (sword down)**

Create the base idle pose - this is the warrior-sample.svg we already have.

```bash
cp dashboard/public/sprites/characters/warrior/idle.svg \
   dashboard/public/sprites/characters/warrior/animations/idle-1.svg
```

**Step 2: Create idle-2.svg (slight movement)**

Create a variation with slight changes for animation (modify weapon position slightly):

```svg
<!-- dashboard/public/sprites/characters/warrior/animations/idle-2.svg -->
<!-- Same as idle-1 but with sword raised slightly - weapon group y offset -2 -->
```

**Step 3: Create idle-3.svg (return to base)**

```bash
cp dashboard/public/sprites/characters/warrior/animations/idle-1.svg \
   dashboard/public/sprites/characters/warrior/animations/idle-3.svg
```

**Note:** For a proper breathing/idle animation, idle-2 would have:
- Slight vertical shift on body
- Weapon held slightly higher
- This creates a subtle "breathing" effect

**Step 4: Commit**

```bash
git add dashboard/public/sprites/characters/warrior/animations/
git commit -m "feat: add warrior idle animation frames"
```

---

## Task 6: Update Dashboard to Use New CharacterSprite

**Files:**
- Modify: `dashboard/src/app/page.tsx`

**Step 1: Remove old AnimatedSprite component and SPRITE_CONFIG**

Delete lines 128-305 in `page.tsx`:
- `SPRITE_CONFIG` object (lines 131-152)
- `AnimatedSprite` function component (lines 155-305)

**Step 2: Add import for new CharacterSprite**

At top of file, add:

```typescript
import { CharacterSprite } from '@/components/CharacterSprite';
```

**Step 3: Update CharacterCard component**

Replace the `AnimatedSprite` usage in `CharacterCard` (around line 335):

```tsx
// Before:
<AnimatedSprite characterClass={character.class} width={92} height={108} />

// After:
<CharacterSprite
  characterClass={character.class.toLowerCase() as 'warrior' | 'mage' | 'rogue' | 'archer'}
  size={92}
/>
```

**Step 4: Run the dev server and verify**

```bash
cd dashboard && npm run dev
```

Open http://localhost:3000 and verify the warrior sprite displays correctly.

**Step 5: Commit**

```bash
git add dashboard/src/app/page.tsx
git commit -m "refactor: replace AnimatedSprite with new SVG CharacterSprite"
```

---

## Task 7: Create Remaining Class Sprites (Mage, Rogue, Archer)

**Files:**
- Create: `dashboard/public/sprites/characters/mage/idle.svg`
- Create: `dashboard/public/sprites/characters/rogue/idle.svg`
- Create: `dashboard/public/sprites/characters/archer/idle.svg`

**Step 1: Create mage idle.svg**

Based on warrior template, modify for mage:
- Replace sword with staff
- Replace shield with spell book or remove
- Change armor to robes
- Add hood or wizard hat

**Step 2: Create rogue idle.svg**

Based on warrior template, modify for rogue:
- Replace sword with dual daggers
- Remove shield
- Lighter armor, hood
- Dark colors

**Step 3: Create archer idle.svg**

Based on warrior template, modify for archer:
- Replace sword with bow
- Add quiver
- Replace shield with nothing or small buckler
- Lighter armor, green colors

**Step 4: Commit**

```bash
git add dashboard/public/sprites/characters/
git commit -m "feat: add mage, rogue, archer idle sprites"
```

---

## Task 8: Clean Up Demo Files

**Files:**
- Delete: `dashboard/public/sprites/demo.html`
- Delete: `dashboard/public/sprites/warrior-sample.svg` (moved to characters/)

**Step 1: Remove demo files**

```bash
rm dashboard/public/sprites/demo.html
rm dashboard/public/sprites/warrior-sample.svg
```

**Step 2: Commit**

```bash
git add -A
git commit -m "chore: clean up sprite demo files"
```

---

## Task 9: Add TypeScript Path Alias (if not exists)

**Files:**
- Modify: `dashboard/tsconfig.json`

**Step 1: Check if @/ alias exists**

```bash
cat dashboard/tsconfig.json | grep -A5 "paths"
```

**Step 2: Add paths if missing**

If not present, add to `compilerOptions`:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

**Step 3: Commit if changed**

```bash
git add dashboard/tsconfig.json
git commit -m "chore: add TypeScript path alias"
```

---

## Summary

After completing all tasks:

1. ✅ SVG directory structure created
2. ✅ CharacterSprite component with animation support
3. ✅ Warrior sprite (idle + animation frames)
4. ✅ Dashboard updated to use new component
5. ✅ Other class sprites created
6. ✅ Demo files cleaned up

**Next steps (future):**
- Create full animation sets (walk, attack, hurt, death, victory)
- Split SVG layers for equipment customization
- Add color prop support for armor recoloring
