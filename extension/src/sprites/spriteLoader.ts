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
