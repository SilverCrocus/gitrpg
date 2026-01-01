import { SpriteSheet, SpriteFrame } from './spriteLoader';
export interface AnimationState {
    currentAnimation: string;
    currentFrame: number;
    elapsedTime: number;
    isPlaying: boolean;
    onComplete?: () => void;
}
export declare class SpriteAnimator {
    private spriteSheet;
    private state;
    private lastTimestamp;
    constructor(spriteSheet: SpriteSheet, initialAnimation?: string);
    play(animationName: string, onComplete?: () => void): void;
    stop(): void;
    resume(): void;
    update(timestamp: number): SpriteFrame;
    getCurrentFrame(): SpriteFrame;
    getCurrentAnimation(): string;
    isPlaying(): boolean;
}
export declare function generateAnimationCSS(spriteSheet: SpriteSheet): string;
//# sourceMappingURL=spriteAnimator.d.ts.map