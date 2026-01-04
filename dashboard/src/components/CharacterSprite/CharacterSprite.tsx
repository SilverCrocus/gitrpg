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
