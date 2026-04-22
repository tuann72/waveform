# Waveform — Project Reference

## Overview

Real-time multiplayer party game. Four modes: Classic (spectrum dials), 2D (spectrum planes), Colorform (color-matching), Deception (social deduction). Players share a room code. No single-player mode.

**Stack:** Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui + Liveblocks v3. State-driven views — no React Router.

---

## File Structure

```
src/
├── App.tsx                    ← GameRouter + RoomOrchestrator + RoomNavigator + InRoomViews
├── types/game.ts              ← AppView, ZONE_WIDTHS/POINTS, GameState, SpectrumCard
├── types/deception.ts         ← DeceptionRole, DeceptionPhase, MurdererSolution, blobs
├── data/spectrumCards.ts      ← 93 cards, 8 categories
├── data/deceptionCards.ts     ← 104 means, 215 evidence, 30 scene tiles, 6 location sets
├── context/
│   ├── GameContext.tsx        ← view router (goTo/resetGame)
│   └── MultiplayerContext.tsx ← sessionStorage state (name, roomCode, playerId, isHost)
├── hooks/
│   ├── useDialDrag.ts         ← pointer-capture drag
│   ├── useLeaveRoom.ts        ← shared leave logic (WaitingRoom + Results)
│   └── useCountdown.ts        ← timestamp-based countdown; returns timeLeft | null
├── lib/
│   ├── liveblocks.ts          ← Storage/Presence types, clearGameData, typed hooks
│   ├── crypto.ts              ← deriveKey / encryptJson / decryptJson (Web Crypto AES-GCM)
│   ├── deceptionDealer.ts     ← assignRoles, dealCards, drawSceneTiles (returns tiles+pool)
│   ├── colorPalette.ts        ← 512-color wheel, chebyshevDistance, calcColorPoints
│   ├── scoring.ts             ← calcPoints, calcPoints2D, applyDoubleDown
│   └── utils.ts               ← cn() helper
├── components/game/
│   ├── SpectrumDial.tsx       ← 1D dial; extraNeedles prop
│   ├── SpectrumPlane.tsx      ← Canvas 2D plane; extraPoints prop; 400×400 internal
│   ├── ColorGrid.tsx          ← 32×16 swatch grid; Chebyshev zone borders
│   ├── TimerBar.tsx           ← shared timer bar (green→amber→red); props: timeLeft, duration
│   ├── PlayerStatusList.tsx   ← shared player status rows; DoneNode/WaitingNode helpers
│   ├── MultiGuessBase.tsx     ← shared Classic+2D guess logic (mode discriminated union)
│   ├── ResultsView.tsx        ← shared results layout for Classic/2D/Colorform (render props)
│   └── EmojiReactions.tsx     ← hamster reactions; floating animation
└── views/multiplayer/
    ├── WaitingRoomView.tsx    ← lobby; all mode settings; async handleStartDeception
    ├── MultiClueView.tsx / MultiGuessView.tsx / MultiResultsView.tsx
    ├── Multi2DClueView.tsx / Multi2DGuessView.tsx / Multi2DResultsView.tsx
    ├── ColorformClueView.tsx / ColorformGuessView.tsx / ColorformResultsView.tsx
    └── ../deception/
        ├── RoleRevealView.tsx          ← decrypt role; murderer picks solution; readiness gate
        ├── FsPlacementView.tsx         ← marker placement; 1 tile swap per round
        ├── DiscussionView.tsx          ← accusation log + form; wrong vote loses vote, not game
        └── DeceptionResultsView.tsx    ← reveal truth; Play Again resets all
```

---

## Liveblocks Storage (`src/lib/liveblocks.ts`)

```ts
type RoomPhase = "lobby" | "clue" | "guessing" | "results"
type GameMode  = "classic" | "2d" | "colorform" | "deception"
type DeceptionPhase = "role-reveal" | "fs-placement" | "discussion" | "results"
```

Classic/2D/Colorform fields unchanged (players, playerDials, player2DDials, playerClues, guessingQueue, currentGuessIndex, guessResults, colorPaletteName, playerColors, colorOptions).

Deception-specific:
```ts
deceptionPhase: DeceptionPhase | null
deceptionDealtCards:              LiveMap<id, { meansCards, evidenceCards }>
deceptionSceneTiles:              Array<{ category, options }> | null   // 6 tiles
deceptionTilePool:                Array<{ category, options }>           // swappable reserve
deceptionMarkers:                 LiveMap<category, optionIndex>
deceptionEncryptedRoles:          LiveMap<id, string>   // per-player AES-GCM blob
deceptionEncryptedRoleMapForHost: string | null
deceptionEncryptedSolutionForHost: string | null        // written by murderer
deceptionRevealedSolution:        { murdererPlayerId, meansCard, evidenceCard } | null
deceptionRoleAcknowledged:        LiveMap<id, boolean>
deceptionAccusations:             LiveMap<id, { accusedPlayerId, meansCard, evidenceCard }>
deceptionEliminatedPlayers:       LiveMap<id, boolean>   // voted wrong; lose vote but stay active
deceptionCurrentRound:            number
deceptionFsTimerDuration:         number    // seconds; 0 = no limit
deceptionFsTimerStart:            number | null
deceptionDiscussionTimerDuration: number
deceptionDiscussionTimerStart:    number | null
deceptionFsRerolledTiles:         number[]  // indices of non-fixed tiles already swapped this round
deceptionEnableAccomplice:        boolean
```

**`clearGameData(storage)`** — resets all per-game fields including all deception maps. Does NOT touch `players`, `hostId`, `roomPassword`.

---

## App.tsx

**`ROOM_VIEWS`** — set of all view names that render inside `RoomProvider`. Must include deception views or `GameRouter` returns null.

**`InRoomViews`** — checks `gameMode` first, routes deception views before falling through to other modes.

**`RoomNavigator`** — on mount with `state.view === "waitingRoom"`: checks `gameMode === "deception"` + `deceptionPhase` first, then falls back to existing `phase`-based redirect for other modes.

**`initialStorage`** — must include all deception LiveMap fields initialized as `new LiveMap()` and scalar fields with defaults.

---

## Deception Game Flow

**WaitingRoom → start:** host calls async `handleStartDeception()` → assigns roles, deals cards, draws 6 scene tiles + tile pool, encrypts role blob per player (AES-GCM, key = `PBKDF2(roomCode + playerId)`), encrypts role map + solution slot for host → calls `startDeceptionGame` mutation → `goTo("deceptionRoleReveal")`.

**Role Reveal:** each client decrypts own blob. Murderer picks solution cards → encrypts for host → writes `deceptionEncryptedSolutionForHost` → acknowledges. Others acknowledge directly. Host watches: all acknowledged + solution written → advance to `fs-placement`.

**FS Placement (each round):** FS adjusts markers freely on all 6 tiles. Can swap ONE non-permanent tile (indices 2–5; index 0=Location, 1=Cause of Death are fixed) from the pool per round — `deceptionFsRerolledTiles` tracks which tiles have been swapped this round. Timer or "Done" → advance to `discussion`.

**Discussion (each round):** Any player except the accomplice and FS can submit one accusation (one shot per game — including the murderer as a bluff). All accusations are logged and visible to everyone. Host decrypts solution once on mount, watches `deceptionAccusations` via `processedAccusers` ref. Correct → write `deceptionRevealedSolution` + set phase `results`. Wrong → mark accuser in `deceptionEliminatedPlayers` (they lose their vote but can still use Marker mode). Host has "Next Round" (not final) or "End Game — Murderer Escapes" (final round) buttons. `advanceToNextRound` clears accusations and `deceptionFsRerolledTiles`, increments round.

**Results:** `deceptionRevealedSolution` is always written before phase becomes `results`. Non-hosts watch `deceptionPhase === null` (after host Play Again → `clearGameData`) to navigate back to `waitingRoom`.

---

## Shared Components

### `TimerBar` + `useCountdown`
```tsx
const timeLeft = useCountdown(startTime, duration, tickMs?); // null = not started
<TimerBar timeLeft={timeLeft} duration={duration} label="..." />
```
Used in: MultiGuessBase, MultiClueView, FsPlacementView.

### `PlayerStatusList`
```tsx
<PlayerStatusList myPlayerId={id} entries={[{ id, name, color, rightNode }]} />
```
`DoneNode` / `WaitingNode` for common right-side states. Used in: MultiGuessBase, RoleRevealView, DiscussionView.

---

## Timer System

Options: 30s / 1 min / 90s / 2 min / No limit (0). All timers timestamp-based — survive refresh.
- **Clue:** `effectiveTimerDuration = clueTimerDuration × totalRounds` (×2 for 2D internally).
- **Guess:** per queue entry; `guessPhaseStartTime` reset by `advanceGuess`.
- **FS Placement:** `deceptionFsTimerDuration`, independent of other timers.

---

## Key Patterns / Gotchas

- **`useMutation` before `useEffect`:** block-scoped `const` is not hoisted — mutations used in effects must be declared first.
- **`useStorage` returns null during load:** always add `?? fallback` after the call.
- **`ROOM_VIEWS` in App.tsx:** every navigable in-room view name must be in this set or `GameRouter` returns null (blank screen).
- **Async before mutation:** deception game start does crypto work async, then calls a sync mutation with pre-computed data.
- **`processedAccusers` ref:** host-side ref in `DiscussionView` prevents double-processing accusations across re-renders.
- **`Dial2DConfig` type cast:** `as unknown as Record<string, Dial2DConfig[]>` when reading from storage.
- **Motion `Variants`:** annotate at module level, not inside JSX.
- **Host navigation guard:** hosts navigate via button only. Non-hosts use `seenLobby` ref (Classic/2D/Colorform) or `RoomNavigator` (Deception).
- **2D reroll axes independently:** `Multi2DClueView` tracks `rerollsUsedX` / `rerollsUsedY` as separate local state. The `rerollDial2D` mutation accepts `axis: "x" | "y"` and replaces only that axis's cards — `targetX` and `targetY` are always copied from the existing dial unchanged.
- **SpectrumPlane canvas theming:** Canvas doesn't inherit CSS. Use `getComputedStyle(canvas).color` to read the inherited foreground color at render time, then convert `rgb(…)` → `rgba(…, 0.12)` for axis lines — works in both light and dark mode.
- **Toggle positioning:** Use explicit `left-*` classes (`left-0.5` / `left-5`) rather than `translate-x-*` for toggle dot anchoring in Tailwind v4 — transforms without an explicit position anchor produce unexpected offsets.

---

## ColorGrid + Color Palette

32×16 grid. Zone borders as absolute `2px` spans (`BORDER_Z1 = rgba(255,255,255,0.95)` dist≤1, `BORDER_Z2 = rgba(255,255,255,0.55)` dist≤2). 512-cell wheel: `atan2` angle → hue, distance → saturation/lightness. Deuteranomaly: 180° rotation of base, avoids red-green axis.

---

## Environment

```
VITE_LIVEBLOCKS_PUBLIC_KEY=pk_...   ← browser
LIVEBLOCKS_SECRET_KEY=sk_...        ← server only
```

`DELETE /api/delete-room?roomId=` — Vite middleware proxies to Liveblocks REST. Called when last player leaves.
