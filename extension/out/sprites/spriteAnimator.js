"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpriteAnimator = void 0;
exports.generateAnimationCSS = generateAnimationCSS;
class SpriteAnimator {
    spriteSheet;
    state;
    lastTimestamp = 0;
    constructor(spriteSheet, initialAnimation = 'idle') {
        this.spriteSheet = spriteSheet;
        this.state = {
            currentAnimation: initialAnimation,
            currentFrame: 0,
            elapsedTime: 0,
            isPlaying: true
        };
    }
    play(animationName, onComplete) {
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
    stop() {
        this.state.isPlaying = false;
    }
    resume() {
        this.state.isPlaying = true;
    }
    update(timestamp) {
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
                    }
                    else {
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
    getCurrentFrame() {
        const animation = this.spriteSheet.animations.get(this.state.currentAnimation);
        if (!animation) {
            return { x: 0, y: 0, width: 64, height: 64 };
        }
        return animation.frames[this.state.currentFrame];
    }
    getCurrentAnimation() {
        return this.state.currentAnimation;
    }
    isPlaying() {
        return this.state.isPlaying;
    }
}
exports.SpriteAnimator = SpriteAnimator;
function generateAnimationCSS(spriteSheet) {
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
//# sourceMappingURL=spriteAnimator.js.map