# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**Jewel Box** is a Lost Ark guild-management PWA: weekly raid scheduling, gold ledger, mission board ("Jewel Bet"), and shared schedule calendar. React 19 + TypeScript + Vite + Tailwind + Firestore. Korean-first UI/comments — preserve Korean strings and Korean inline comments when editing existing code.

A companion Cloudflare Worker (`cloudflareworker.js`) hosts a Discord bot and scheduled (cron) jobs, sharing a Firestore backend with the web app.

## Commands

```bash
npm run dev                  # vite dev — strict port 5177
npm run build                # vite build → dist/
npm run preview              # serve built bundle
npm run deploy               # gh-pages -d dist  (publishes to /jewel-box/ basename)
npm run gen:worker-raids     # regenerate raid block in Worker from src/data/raids.ts
npm run gen:worker-raids -- --write   # write to dist/worker-raids.generated.js
```

There is no configured test runner and no `lint` script in package.json. ESLint is configured (flat config in `eslint.config.js`) — invoke with `npx eslint .` if needed.

## Architecture

### Single source of truth: `src/data/raids.ts`
All raid metadata (`RaidId`, `RAID_META`, `RAIDS` array, eligibility, party-size config, single-mode flags, gold values, item-level gates) lives in this one file. Adding/changing a raid only requires editing the `RAIDS` array; downstream types and helpers (`getEligibleRaids`, `getRaidPartyConfig`, `getCharTopRaidIds`, etc.) derive from it.

The Worker (`cloudflareworker.js`) embeds a generated copy of this registry between markers:
```
// === GEN:RAID-LEDGER-BEGIN ===
... // do NOT hand-edit
// === GEN:RAID-LEDGER-END ===
```
After changing `src/data/raids.ts`, run `npm run gen:worker-raids` and replace that block in `cloudflareworker.js`. Hand-editing the block causes Worker/web drift.

### Gold ledger model
`raidData/clears` (Firestore) is a per-character per-raid ledger of `ClearEntry` objects, each storing a **snapshot** of `generalGold`/`boundGold`/`clearedItemLevel` at clear time — so retroactive item-level changes never alter past weekly gold. The exclusion map used by the scheduler is **derived** from `clears` via `deriveExclusionsFromClears` (no separate exclusion document).

Per-user weekly total = sum of each character's **top-3** entries by effective gold (`general + (ignoreBound ? 0 : bound)`). `computeIgnoreBoundGold` in `src/App.tsx` decides bound-gold receipt: modern field `receiveBoundGold` takes precedence over legacy `goldOption` (`ALL_MAX` / `GENERAL_MAX` / `MAIN_ALL_ALT_GENERAL`). The same logic is duplicated in `cloudflareworker.js` — keep them in sync.

Weekly reset (`handleResetExclusions` in `App.tsx`): aggregate top-3 by user → add to `raidData/accumulatedGold` → wipe `clears` and `swaps`. Never wipe ledger without folding into `accumulatedGold` first.

Gold policy (post-2026-04-22 patch, encoded in `raids.ts`): `minItemLevel > 1710` raids are 100% general; `≤ 1710` split 50/50 general/bound; `HORIZON` is bound-only.

### Roster (원정대) identity
A discord user can have multiple `rosterId`s (alts as separate roster). Default `rosterId = discordName` (back-compat shim — `fetchCharacters` injects this on read in `firebaseApi.ts`). Read with `ch.rosterId ?? ch.discordName`. Roster-scoped raids (`KAZEROS` family) use `raidData/rosterRaidState` to pick one representative character per roster.

### Firestore layout
- `users/{discordName}` — `{ characters: Character[] }`. Active redesign plans to migrate to `users/{discordId}` (snowflake) — see active plan below.
- `raidData/settings` — `{ supportShortageByRaid: { [raidId]: boolean } }` (Valkyrie flex-to-support).
- `raidData/swaps` — `{ swaps: RaidSwap[] }` (resets weekly with clears).
- `raidData/clears` — gold ledger (see above).
- `raidData/rosterRaidState` — `{ [rosterId]: { [family]: RosterRaidSelection } }`.
- `raidData/accumulatedGold` — `{ [discordName]: { general, bound } }`.
- `personalSchedules` — collection of absence entries.
- (mission board collection — see `MissionBoard`/`firebaseApi`).

`db` is initialized with `ignoreUndefinedProperties: true` so optional fields like `rosterLabel` can be omitted safely.

### Scheduling engine: `src/raidLogic.ts`
~2400 lines. Entry points:
- `buildRaidSchedule(characters, exclusions, balanceMode, raidSettings, raidSwaps, raidGuests, clears, rosterRaidState)` → `RaidSchedule`.
- `buildRaidCandidatesMap(...)` → per-raid candidate lists for the user-progress panel.
- `calculateHoldbacksSpecific(absentees, schedule, ...)` → impact analysis when a user is absent.

`BalanceMode = 'overall' | 'role' | 'speed'`; currently hardcoded to `'speed'` in `App.tsx`. Party size, four-player detection, and run-size caps all flow from `getRaidPartyConfig` / `isFourPlayerRaid` in `raids.ts` — never hardcode by family-prefix string.

### App shell: `src/App.tsx`
~990-line file holds the layout shell, theme/sidebar state, all Firestore refresh effects, and the `<Routes>`. Routes: `/` (개인별 현황), `/schedule`, `/absentee`, `/calendar`, `/missions`. Modals (CharacterFormList, LadderGame, etc.) are owned at the App level via `isXxxModalOpen` state.

`localSquad` (the user's current edit-buffer roster) is **layered onto** `allCharacters` to produce `effectiveCharacters` — most computed views key off `effectiveCharacters`, while `inactiveUsers` filters out users with all `isParticipating === false`.

### Theming & design system
- `data-theme="dark" | "light"` on `<html>` is the single switch (set in `main.tsx` pre-hydration and synced from `App.tsx`). Initial value: `localStorage.raidTheme_v1` → `prefers-color-scheme`.
- `tailwind.config.cjs` declares `darkMode: ['selector', '[data-theme="dark"]']` so existing `dark:` Tailwind variants still match. Active redesign aims to phase out `dark:` in favor of CSS-variable tokens — when adding new UI, prefer semantic Tailwind classes that map to tokens (`bg-bg-normal`, `text-label-normal`, `border-line-normal`, `bg-primary`, etc.) over `dark:`/`zinc-*` literals.
- `src/styles/tokens.css` defines atomic + semantic CSS variables (raid-manager-design-system).
- `src/ds/` is the primitive component library (`Button`, `Card`, `Chip`, `Avatar`, `JobIcon`, `Tooltip`, `Switch`, `Segmented`, `StatusAlert`, `AccordionRow`, …). Prefer composing these over building ad-hoc Tailwind buttons/cards in new UI.
- Icons: `lucide-react` only.

### Routing & deploy basename
Vite `base: '/jewel-box/'` (vite.config.ts) and `<BrowserRouter basename="/jewel-box/">` (main.tsx) **must stay aligned** — this is a GitHub Pages deploy. Changing one without the other breaks routing in production.

### External integrations
- `src/api/lostArkApi.ts` — Lost Ark official API for character sync (item level / combat power). `syncCharactersWithLostArkAPI` skips updates that would *lower* combat power (defensive against API flakes); skipped chars are surfaced via `skippedMessages`.
- Cloudflare Worker (`cloudflareworker.js`) — Discord slash commands + cron `scheduled()` handler. Talks to Firestore via REST (not the SDK) using `FIREBASE_API_KEY` / `FIRESTORE_COLLECTION` env. Worker URL: `https://discord-bot.sunnypop424.workers.dev/`.
- `scripts/registerDiscordCommands.mjs` — registers the bot's slash commands.

## Conventions

- **Korean tone**: use "공대원 / 원정대 / 우리 채널" — *not* "길드". Gold renders as `45,000 G` (with comma + space + G); item levels render as `1720` (no comma).
- **No emojis** in code or comments unless they already exist in the file.
- **Single source for raid rules** — never duplicate raid lists, family-prefix string checks, or party-size constants outside `src/data/raids.ts`. If logic also runs in the Worker, edit `raids.ts` and regenerate.
- **Bound-gold logic** lives in *three* places that must stay aligned: `App.tsx#computeIgnoreBoundGold`, `raidLogic.ts`, and `cloudflareworker.js`'s `computeIgnoreBound`. When changing the rule, update all three.
- **Optional Character fields**: `rosterId`, `rosterLabel`, `receiveBoundGold`, `goldOption`, `singleRaids`, `isParticipating`, `isGuest`, `serkaNightmare`, `valkyCanSupport`, `belgardinNightmare`. Tolerate `undefined` (Firestore is configured to drop undefined keys).

## Active redesign

There's an in-progress migration to the `raid-manager-design-system` token/component bundle. Tracking memory: `~/.claude/projects/C--Users-OS-LAPTOP-Desktop-jewel-box/memory/project_jewel_box_redesign.md`. Plan file: `~/.claude/plans/dapper-floating-seal.md` (single source of truth for the redesign). Highlights:
- Top nav (3 items + 더보기) replaces left sidebar.
- Discord OAuth replaces free-text discord-name entry; Firestore key migrates `users/{discordName}` → `users/{discordId}`.
- Drops remaining `/schedule` and `/absentee` routes (absence handling moves into `/calendar`); `/sequence` is already removed. Adds `/raids` (per-raid × per-user × uncleared characters).
- `dev` mode bypasses OAuth via `VITE_AUTH_MODE=impersonate` + `VITE_AUTH_IMPERSONATE_USER`; writes default to dry-run.

Check the plan file before starting structural work — much of the existing sidebar/route code is scheduled for removal, so don't invest in polishing it.

## Behavioral guidelines

Reduce common LLM coding mistakes. Bias toward caution over speed; use judgment for trivial tasks.

### 1. Think before coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:
- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity first

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical changes

Touch only what you must. Clean up only your own mess.

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

Test: every changed line should trace directly to the user's request.

### 4. Goal-driven execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

These guidelines are working if: fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
