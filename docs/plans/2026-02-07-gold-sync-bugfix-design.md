# Gold Sync & Quest Tracking Bugfix Design

## Problem

Four related bugs prevent the game economy from functioning:

1. **Gold shows 0** -- `profileSyncService.syncProfileToCloud()` never includes `gold` in its Supabase upsert. Gold earned from level-ups is stored locally but never reaches Supabase. The UI reads from local state, but economy services (workers, quests) read from Supabase.
2. **Cannot buy workers** -- Worker purchase reads `users.gold` from Supabase (always 0). Fails with "Not enough gold."
3. **Cannot collect gold** -- No workers exist (cannot purchase them), so collection yields 0.
4. **Quest tracking broken** -- Two sub-issues:
   - `gitTracker.setQuestService()` was missing (already fixed in working tree)
   - Dashboard debounce sends `quests: undefined` in immediate state updates, blanking the quest list for 5 seconds between refreshes

## Root Cause

Split-brain between local state (`LocalStateManager`) and cloud state (Supabase `users.gold`). Gold mutations from level-ups write to local only. Economy services read from Supabase only. The two never agree.

## Fix 1: Gold Sync

### profileSyncService.ts

- Add `gold` to the upsert payload in `syncProfileToCloud()` so gold is pushed to Supabase on every state change.

### localStateManager.ts

- Add `setGold(amount: number)` method that sets gold to an absolute value (currently only `addGold` exists). Needed for startup hydration.

### profileSyncService.ts (new method)

- Add `hydrateLocalStateFromCloud()`:
  1. Read user profile from Supabase (including `gold`)
  2. Read local gold from `stateManager.getCharacter().gold`
  3. Take `max(supabaseGold, localGold)`
  4. Write winner to both Supabase and local state via `setGold()`
  5. This is a one-time reconciliation to recover gold stranded in either location due to the sync bug

### extension.ts

- After `supabaseClient.initialize()` and successful auth, call `profileSyncService.hydrateLocalStateFromCloud()` before other services start.

### Steady-state after fix

- Level-up -> local `addGold()` -> `onStateChange` -> `syncProfileToCloud()` (now includes gold) -> Supabase updated
- Worker collection -> Supabase updated -> local `addGold()` (already in working tree)
- Quest reward -> Supabase updated -> local `addGold()` (already in working tree)
- Startup -> hydrate local from Supabase (ongoing, no longer needs max() after first reconciliation)

## Fix 2: Quest UI Flicker

### DashboardPanel.ts

- Add instance properties `cachedQuests` and `cachedWorkerSummary` to `DashboardPanel`
- When the full network refresh completes, store the results in these caches
- In the immediate debounced message, include the cached values instead of omitting them
- Result: quest list and worker summary never blank out between updates

### No changes needed in script.js

`renderQuests()` already handles data correctly when present. The bug is that it receives `undefined` from the immediate message.

## Files Changed

| File | Change |
|------|--------|
| `extension/src/services/profileSyncService.ts` | Add `gold` to upsert; add `hydrateLocalStateFromCloud()` |
| `extension/src/services/localStateManager.ts` | Add `setGold(amount)` method |
| `extension/src/extension.ts` | Call hydration on startup after auth |
| `extension/src/webview/dashboard/DashboardPanel.ts` | Cache quests/workers in debounced state updates |
