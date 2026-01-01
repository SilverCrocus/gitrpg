import * as vscode from 'vscode';
export interface SpriteFrame {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface SpriteAnimation {
    name: string;
    frames: SpriteFrame[];
    frameRate: number;
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
export declare const CHROMA_KEY_COLOR = "#FF00FF";
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
export declare const CHARACTER_SPRITE_CONFIG: SpriteSheetConfig;
export declare function loadSpriteSheet(extensionUri: vscode.Uri, spriteName: string, config: SpriteSheetConfig): SpriteSheet;
export declare function getSpriteFrameCss(frame: SpriteFrame, scale?: number): string;
//# sourceMappingURL=spriteLoader.d.ts.map