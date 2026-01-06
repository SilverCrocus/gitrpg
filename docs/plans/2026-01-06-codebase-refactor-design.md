# GitRPG Codebase Refactor Design

**Date:** 2026-01-06
**Goal:** Refactor for maintainability - make it easier to add features in the future

---

## Problem Statement

The codebase has grown organically and has several maintainability issues:

1. **extension.ts is 1566 lines** - Contains all commands, webview HTML, message handling, and initialization
2. **Type duplication** - Types scattered across `types.ts`, `localStateManager.ts`, and inline in services
3. **Inline webview HTML** - ~500 lines of template strings with embedded CSS/JS
4. **Documentation drift** - Plans reference Firebase but implementation uses Supabase

---

## Solution: New Directory Structure

```
extension/src/
├── extension.ts              # Entry point only (~50 lines)
├── types/
│   └── index.ts              # All types consolidated here
├── commands/
│   ├── index.ts              # Command registration
│   ├── characterCommands.ts  # setName, setClass, showStats
│   ├── socialCommands.ts     # friends, challenges, boss battles
│   ├── economyCommands.ts    # quests, workers, gold
│   └── battleCommand.ts      # (already exists, keep)
├── services/
│   └── (existing services stay here)
├── webview/
│   ├── dashboard/
│   │   ├── DashboardPanel.ts # Panel management
│   │   ├── template.html     # Separate HTML template
│   │   ├── styles.css        # Separate styles
│   │   └── script.js         # Separate client JS
│   └── sidebar/
│       ├── SidebarProvider.ts
│       └── sidebar.html
├── statusbar/
│   └── StatusBarManager.ts   # Status bar logic
└── config/
    └── classConfig.ts        # CLASS_BASE_STATS, xpForLevel, etc.
```

---

## Type Consolidation

### Current Problem
- `CharacterClass` defined as lowercase in `types.ts`
- `CharacterData.class` defined as capitalized in `localStateManager.ts`
- `CLASS_BASE_STATS` duplicated in multiple places

### Solution: Single `types/index.ts`

```typescript
// === Core Game Types ===
export type CharacterClass = 'Warrior' | 'Mage' | 'Rogue' | 'Archer';

export interface CharacterStats {
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  critChance: number;
  critDamage: number;
}

export interface Character {
  name: string;
  class: CharacterClass;
  level: number;
  xp: number;
  xpToNextLevel: number;
  gold: number;
  stats: CharacterStats;
}

// === Battle Types ===
export interface BattleAction { ... }
export interface BattleRewards { ... }
export interface BattleFighter { ... }

// === Economy Types ===
export interface Quest { ... }
export interface Worker { ... }

// === State Types ===
export interface TodayStats { ... }
export interface LocalGameState { ... }
```

**Migration:** Standardize on capitalized class names (`'Warrior'` not `'warrior'`)

---

## Webview Extraction

### Current Problem
- `getWebviewContent()` is ~500 lines of template string
- No syntax highlighting, linting, or formatting for HTML/CSS/JS

### Solution: Separate Files

```
extension/src/webview/dashboard/
├── DashboardPanel.ts      # Panel lifecycle, message handling
├── template.html          # HTML structure with {{placeholders}}
├── styles.css             # All dashboard CSS
└── script.js              # Client-side JavaScript
```

**DashboardPanel.ts:**
```typescript
export class DashboardPanel {
  private panel: vscode.WebviewPanel;

  constructor(context: vscode.ExtensionContext) {
    this.panel = vscode.window.createWebviewPanel(...);
    this.panel.webview.html = this.buildHtml();
    this.setupMessageHandling();
  }

  private buildHtml(): string {
    return buildWebviewHtml(this.panel.webview, {
      template: 'dashboard/template.html',
      styles: 'dashboard/styles.css',
      scripts: 'dashboard/script.js',
      data: { character, todayStats, ... }
    });
  }
}
```

---

## Command Organization

### Current Problem
- All 20+ command handlers defined inline in `activate()`
- Each command is 10-50 lines of code

### Solution: Group by Feature

```typescript
// commands/characterCommands.ts
export function registerCharacterCommands(
  context: vscode.ExtensionContext,
  stateManager: LocalStateManager
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('gitrpg.setName', async () => { ... }),
    vscode.commands.registerCommand('gitrpg.setClass', async () => { ... }),
    vscode.commands.registerCommand('gitrpg.showStats', () => { ... }),
    vscode.commands.registerCommand('gitrpg.reset', async () => { ... }),
  ];
}

// commands/index.ts
export function registerAllCommands(context, services): vscode.Disposable[] {
  return [
    ...registerCharacterCommands(context, services.stateManager),
    ...registerSocialCommands(context, services),
    ...registerEconomyCommands(context, services),
  ];
}
```

**New extension.ts (~50 lines):**
```typescript
export async function activate(context: vscode.ExtensionContext) {
  const services = await initializeServices(context);
  const commands = registerAllCommands(context, services);
  const statusBar = new StatusBarManager(services.stateManager);

  context.subscriptions.push(...commands, statusBar);
}
```

---

## Implementation Plan

### Phase 1: Foundation (Low Risk)
1. Create new directory structure
2. Consolidate types into `types/index.ts`
3. Create `config/classConfig.ts` with constants
4. Update imports across codebase

### Phase 2: Commands Extraction (Medium Risk)
5. Extract character commands
6. Extract social commands
7. Extract economy commands
8. Slim down `extension.ts` to wire-up only

### Phase 3: Webview Extraction (Higher Risk)
9. Create webview utility for loading templates
10. Extract dashboard HTML/CSS/JS
11. Extract sidebar HTML/CSS/JS
12. Extract status bar to `StatusBarManager`

### Phase 4: Cleanup & Documentation
13. Update/create documentation
14. Remove dead code
15. Final review

---

## Subagent Workflow

For each task:
1. **code-executor** implements the task
2. **code-reviewer** reviews the changes
3. Fix any issues found
4. Commit and move to next task

---

## Success Criteria

- [x] `extension.ts` reduced from 1567 to 212 lines (86% reduction)
- [x] All types in single `types/index.ts`
- [x] Webview HTML/CSS/JS in separate files
- [x] Commands organized by feature
- [x] Extension compiles and runs

---

## Implementation Results (2026-01-06)

**Completed:**

| Phase | Task | Status |
|-------|------|--------|
| 1 | Create directory structure | Done |
| 1 | Consolidate types into types/index.ts | Done |
| 1 | Create config/classConfig.ts | Done |
| 1 | Update imports across codebase | Done |
| 2 | Extract character commands | Done |
| 2 | Extract social commands | Done |
| 2 | Extract economy commands | Done |
| 2 | Create commands/index.ts | Done |
| 3 | Create webview utility | Done |
| 3 | Extract dashboard HTML/CSS/JS | Done |
| 3 | Extract sidebar HTML/CSS/JS | Done |
| 3 | Extract StatusBarManager | Done |

**Metrics:**
- extension.ts: 1567 → 212 lines (86% reduction)
- Types: Consolidated in types/index.ts (268 lines)
- Config: Centralized in config/classConfig.ts (290 lines)
- Commands: Split into characterCommands, socialCommands, economyCommands

**New Directory Structure:**
```
extension/src/
├── extension.ts              # 212 lines - entry point and orchestration
├── types/
│   └── index.ts              # Consolidated types
├── commands/
│   ├── index.ts              # Command registration hub
│   ├── characterCommands.ts  # setName, setClass, showStats, reset
│   ├── socialCommands.ts     # friends, challenges, boss battles
│   └── economyCommands.ts    # quests, workers, gold
├── config/
│   └── classConfig.ts        # Game constants and calculations
├── webview/
│   ├── webviewUtils.ts       # Template loading utility
│   ├── dashboard/
│   │   ├── DashboardPanel.ts
│   │   ├── template.html
│   │   ├── styles.css
│   │   └── script.js
│   └── sidebar/
│       ├── SidebarProvider.ts
│       ├── template.html
│       ├── styles.css
│       └── script.js
├── statusbar/
│   └── StatusBarManager.ts
└── services/
    └── (existing services unchanged)
```
