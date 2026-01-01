"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHARACTER_SPRITE_CONFIG = exports.CHROMA_KEY_COLOR = void 0;
exports.loadSpriteSheet = loadSpriteSheet;
exports.getSpriteFrameCss = getSpriteFrameCss;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
// Magenta chroma key color to filter out
exports.CHROMA_KEY_COLOR = '#FF00FF';
// Configuration for our character sprite sheets
exports.CHARACTER_SPRITE_CONFIG = {
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
function loadSpriteSheet(extensionUri, spriteName, config) {
    const imagePath = path.join('media', 'sprites', `${spriteName}.png`);
    const imageUri = vscode.Uri.joinPath(extensionUri, imagePath);
    const animations = new Map();
    for (const animConfig of config.animations) {
        const frames = [];
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
function getSpriteFrameCss(frame, scale = 1) {
    return `
    width: ${frame.width * scale}px;
    height: ${frame.height * scale}px;
    background-position: -${frame.x * scale}px -${frame.y * scale}px;
    background-size: ${frame.width * 6 * scale}px auto;
    image-rendering: pixelated;
  `;
}
//# sourceMappingURL=spriteLoader.js.map