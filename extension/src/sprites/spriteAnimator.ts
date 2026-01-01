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
