# Character Art Rework Design

## Problem

The current player character sprites (Warrior, Mage, Rogue, Archer) use a blocky, rectangle-heavy construction that looks primitive. Proportions are stubby, faces are minimal (2px dot eyes), and the classes lack distinct visual personality. The art quality gap between player characters and boss sprites is too large.

## Design Direction

**Style:** Chibi-anime with refined vector shapes. Move from pure `<rect>` construction to `<path>` curves, rounded shapes, and bezier curves. Flat colors with 3-4 shades per material. Gradients allowed only on magical effects.

**Canvas:** 96x96 viewBox (up from 64x64).

**Proportions:** 3-head-tall chibi ratio. Head ~35% of figure height (~28px on ~80px figure). Legs slightly longer than current for dynamic poses.

**Poses:** Dynamic mid-action (not idle stance).

**Faces:** Full anime-style -- large oval eyes with iris, pupil, and double-highlight shine. Defined eyebrows showing emotion. Small nose stroke. Expressive mouth matching the action.

## Character Designs

### Warrior -- Mid-Overhead Sword Swing

- Body twisted mid-swing, one foot lunging forward, cape flaring from momentum
- Open-face helmet with short crest, full face visible for battle cry expression
- Fierce expression: angled eyebrows, open mouth, intense eyes
- Broad longsword raised overhead with both hands, motion trail lines
- Steel blue-silver armor (`#8A9BB5`), crimson cape (`#8B2020`), gold accents
- Steel gray iris

### Mage -- Mid-Spell Cast, Hovering

- One arm thrust forward with spell orb forming, other arm holding staff diagonally
- Floating 2-3px above shadow, robes billowing from magical energy
- Hood pushed back revealing silver-white hair flowing in magical wind
- Concentrated expression: furrowed brows, set mouth, cyan-tinted eyes
- Spell orb: layered circles (glow, mid-ring, bright core) with orbiting particles
- Staff with crystal head emitting glow (radial gradient + blur filter allowed)
- Deep indigo-purple robes (`#3B2D6B`), cyan magic (`#00D4FF`), gold sash
- Cyan iris (`#00C8E8`)

### Rogue -- Mid-Air Dagger Slash

- Leaping pose with legs tucked/extended, body twisted mid-slash
- Dual daggers: one slashing forward, one trailing behind
- Hood down resting on shoulders, dark messy hair, red scarf trailing
- Confident smirk: one eyebrow raised, asymmetric grin, slightly narrowed eyes
- X-pattern chest straps, belt with pouches, leather bracers
- Small cheek scar detail
- Dark leather (`#3D3D3D`), black hood (`#1A1A1A`), red scarf (`#8B2020`)
- Green iris (`#4A6040`)

### Archer -- Full Bow Draw

- Wide stable stance, left arm drawing bowstring back to cheek, right arm holding bow extended
- Longbow with visible bowstring drawn taut, arrow nocked and aimed
- Quiver on back with arrow shafts and red fletching visible
- Calm focused expression: one eye slightly squinted (aiming), subtle smile
- Golden-brown hair with bangs, no helmet
- Green cloak flowing behind, leather vest over tunic
- Forest green tunic (`#2D5A2D`), brown leather (`#5A3A1A`), gold belt buckle
- Green iris (`#5A8040`)

## Technical Details

### Files to Replace

| File | Change |
|------|--------|
| `extension/media/sprites/characters/{class}/idle.svg` (x4) | Replace with new 96x96 designs |
| `dashboard/public/sprites/characters/{class}/idle.svg` (x4) | Replace with identical copies |
| `extension/media/sprites/characters/warrior/animations/idle-{1,2,3}.svg` | Regenerate breathing frames with new warrior design |

### No Code Changes Required

All rendering contexts load sprites via `<img src="...">` with container-based sizing. The viewBox change from 64x64 to 96x96 is transparent -- SVGs scale to their container automatically.

### Preserved Conventions

- CSS custom properties for all colors (recoloring/equipment swap capability)
- Layered SVG groups (`body`, `armor`, `arms`, `head`, `weapon`) for future mix-and-match
- Ground shadow ellipse beneath each figure
- No inline SVG in code -- standalone `.svg` files only

### Out of Scope

- Boss sprites (already high quality)
- Animation frames for non-warrior classes (none exist currently)
- Battle UI sprite integration (separate issue -- sprites not connected in battleUI.ts)
- Equipment visual system (future feature using the CSS custom property + group layer system)
