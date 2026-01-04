# SVG Sprite System Design

## Overview

Replace PNG sprite sheets with modular SVG sprites to eliminate coordinate math pain and enable future character customization.

## Problem

- CSS `background-position` math for sprite sheets is error-prone
- Alignment issues in dashboard profile are hard to debug
- Animation system requires row/column coordinate tracking
- No path to equipment customization without explosion of pre-rendered files

## Solution

Modular SVG character system with:
- Individual SVG files per frame (no coordinate math)
- Layered structure for future equipment swapping
- CSS variable-based recoloring
- Clean vector style inspired by pixel art aesthetic

## File Structure

```
dashboard/public/sprites/
├── characters/
│   ├── warrior/
│   │   ├── body.svg
│   │   ├── idle.svg          # Complete default pose
│   │   └── animations/
│   │       ├── idle-1.svg, idle-2.svg, idle-3.svg
│   │       ├── attack-1.svg ... attack-6.svg
│   │       ├── walk-1.svg ... walk-6.svg
│   │       ├── hurt-1.svg ... hurt-3.svg
│   │       ├── death-1.svg ... death-6.svg
│   │       └── victory-1.svg ... victory-3.svg
│   ├── mage/
│   ├── rogue/
│   └── archer/
├── equipment/              # Future: swappable gear
│   ├── weapons/
│   ├── helmets/
│   ├── armor/
│   └── shields/
```

## Component API

### Basic Usage

```tsx
// Static sprite
<CharacterSprite class="warrior" pose="idle" size={128} />

// Animated sprite
<CharacterSprite
  class="warrior"
  animation="idle"
  frameRate={4}
  size={128}
/>

// With animation callback
<CharacterSprite
  class="warrior"
  animation="attack"
  onAnimationComplete={() => setAnimation('idle')}
/>
```

### With Customization (Future)

```tsx
<CharacterSprite
  class="warrior"
  pose="idle"
  size={128}
  equipment={{
    weapon: "longsword",
    helmet: "knight-helm",
    armor: "plate",
    shield: "kite-shield"
  }}
  colors={{
    armorPrimary: "#C9A227",
    armorSecondary: "#8B6914"
  }}
/>
```

## Animation Configuration

```tsx
const ANIMATIONS = {
  warrior: {
    idle: { frames: 3, frameRate: 4, loop: true },
    walk: { frames: 6, frameRate: 8, loop: true },
    attack: { frames: 6, frameRate: 12, loop: false },
    hurt: { frames: 3, frameRate: 6, loop: false },
    death: { frames: 6, frameRate: 6, loop: false },
    victory: { frames: 3, frameRate: 4, loop: true }
  },
  mage: { /* same structure */ },
  rogue: { /* same structure */ },
  archer: { /* same structure */ }
};
```

## SVG Structure

Each character SVG uses layered groups:

```svg
<svg viewBox="0 0 64 64">
  <style>
    :root {
      --armor-primary: #6B7B8C;
      --armor-secondary: #4A5568;
      /* ... */
    }
  </style>

  <g id="body"><!-- Base body --></g>
  <g id="armor"><!-- Armor layer --></g>
  <g id="arms"><!-- Arms --></g>
  <g id="helmet"><!-- Helmet --></g>
  <g id="shield"><!-- Shield --></g>
  <g id="weapon"><!-- Weapon --></g>
</svg>
```

## Visual Style

- Clean vector shapes (not pixel-traced)
- Blocky/geometric forms inspired by pixel art
- Limited color palette per element
- No gradients, sharp edges
- Scales crisp at any size

## Migration Path

1. Create SVG sprites for all 4 classes (warrior, mage, rogue, archer)
2. Build `CharacterSprite` React component
3. Replace existing sprite sheet usage in dashboard
4. Update extension to use new system (or keep PNG for VS Code webview)
5. Future: Split layers into separate files for equipment customization

## Benefits

- No more coordinate math or alignment bugs
- Scales perfectly at any size
- Color variants via CSS (no new files needed)
- Future-ready for mix-and-match customization
- Easier to debug (inspect individual SVG elements)

## Trade-offs

- More files to manage (72 animation frames vs 1 sprite sheet per class)
- Need to create SVG artwork (one-time effort)
- Slightly more HTTP requests (mitigated by bundling/caching)
