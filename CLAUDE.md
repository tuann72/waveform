# Waveform — Project Reference

## Overview

Real-time multiplayer party game. Three modes: Classic (spectrum dials), 2D (spectrum planes), Colorform (color-matching). Players share a room code, write clues, all non-authors guess simultaneously. No single-player mode.

**Stack:** Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui + Liveblocks v3. State-driven views — no React Router.

---

## File Structure

```
src/
├── App.tsx                    ← GameRouter + RoomOrchestrator + RoomNavigator + InRoomViews
├── types/game.ts              ← AppView, ZONE_WIDTHS/POINTS, GameState, SpectrumCard
├── data/spectrumCards.ts      ← 93 cards, 8 categories
├── context/
│   ├── GameContext.tsx        ← view router (goTo/resetGame)
│   └── MultiplayerContext.tsx ← sessionStorage state (name, roomCode, playerId, isHost)
├── hooks/
│   ├── useDialDrag.ts         ← pointer-capture drag
│   └── useLeaveRoom.ts        ← shared leave logic (WaitingRoom + Results)
├── lib/
│   ├── liveblocks.ts          ← Storage/Presence types, clearGameData, typed hooks
│   ├── colorPalette.ts        ← 512-color wheel, chebyshevDistance, calcColorPoints, pickColorOptions
│   ├── scoring.ts             ← calcPoints, calcPoints2D, applyDoubleDown
│   └── utils.ts               ← cn() helper
├── components/game/
│   ├── SpectrumDial.tsx       ← 1D dial; extraNeedles prop for multiplayer reveal
│   ├── SpectrumPlane.tsx      ← Canvas 2D plane; extraPoints prop; 400×400 internal
│   ├── ColorGrid.tsx          ← 32×16 swatch grid; Chebyshev zone borders; target outline
│   ├── MultiGuessBase.tsx     ← shared Classic+2D guess logic (mode discriminated union)
│   ├── ResultsView.tsx        ← shared results layout for all modes (render props)
│   └── EmojiReactions.tsx     ← hamster reactions; floating animation
└── views/multiplayer/
    ├── WaitingRoomView.tsx    ← lobby: mode/rounds/timers/categories/palette, player list
    ├── MultiClueView.tsx      ← Classic clue entry
    ├── MultiGuessView.tsx     ← thin wrapper → MultiGuessBase { kind:"classic" }
    ├── MultiResultsView.tsx   ← thin wrapper → ResultsView
    ├── Multi2DClueView.tsx    ← 2D clue entry (timer ×2, SpectrumPlane)
    ├── Multi2DGuessView.tsx   ← thin wrapper → MultiGuessBase { kind:"2d" }
    ├── Multi2DResultsView.tsx ← thin wrapper → ResultsView (no By Player tab)
    ├── ColorformClueView.tsx  ← 3 large swatches (w-40), pick + clue input
    ├── ColorformGuessView.tsx ← ColorGrid, zone reveal after all locked
    └── ColorformResultsView.tsx ← thin wrapper → ResultsView
```

---

## Liveblocks Storage (`src/lib/liveblocks.ts`)

```ts
type RoomPhase = "lobby" | "clue" | "guessing" | "results"
type GameMode  = "classic" | "2d" | "colorform"

type Storage = {
  phase: RoomPhase;  gameMode: GameMode;  totalRounds: number;
  clueTimerDuration: number;       // seconds; 0 = no limit
  cluePhaseStartTime: number | null;
  guessTimerDuration: number;      // seconds; 0 = no limit
  guessPhaseStartTime: number | null;  // reset per queue entry by advanceGuess
  selectedCategories: string[];    // empty = all (Classic+2D only)
  hostId: string;  roomPassword: string | null;
  players:       LiveMap<string, { name: string; isHost: boolean; color: string }>;
  playerDials:   LiveMap<string, DialConfig[]>;       // Classic
  player2DDials: LiveMap<string, Dial2DConfig[]>;     // 2D
  playerClues:   LiveMap<string, string[]>;
  guessingQueue: LiveList<{ dialIndex: number; authorId: string }>;
  currentGuessIndex: number;
  guessResults:  LiveMap<string, { position: number; posY?: number; points: number; doubleDown?: boolean }>;
  colorPaletteName: "base" | "deuteranomaly";         // Colorform
  playerColors:  LiveMap<string, number[]>;            // Colorform palette index per round
  colorOptions:  LiveMap<string, number[][]>;          // Colorform 3 swatch options per round
}

type Presence = {
  playerName: string;  cluesComplete: boolean;  playerId: string | null;
  dialPosition: number | null;    // Classic: needle; 2D: x
  dialPositionY: number | null;   // 2D only: y
  reaction: { emoji: string; id: string } | null;  // hamster path + random id
}
```

**`clearGameData(storage)`** — resets phase, both startTimes, gameMode, totalRounds, both timerDurations, selectedCategories, colorPaletteName, clears all collections. Does NOT touch `players`, `hostId`, `roomPassword`.

**Room ID:** `waveform-${roomCode}`

---

## App.tsx

**`InRoomViews`** — reads `gameMode` from storage, routes to correct mode's clue/guess/results components. WaitingRoom is mode-agnostic.

**`RoomOrchestrator`** (null-rendering) — host promotion: watches presence for `hostId`; if host absent, schedules `promoteToHost` after 3s debounce. Atomic mutation checks `hostId === oldHostId` to prevent races. Also syncs `setIsHost(true)` when `hostId` changes to own playerId. Kick detection: `wasRegisteredRef` + `isInPlayers` watch → `clearRoom()` + `goTo("start")`.

**`RoomNavigator`** (null-rendering) — on mount, if `state.view === "waitingRoom"` and phase is mid-game, redirects to correct view.

**initialStorage:** `phase:"lobby"`, `gameMode:"classic"`, `clueTimerDuration:90`, `guessTimerDuration:90`, both startTimes `null`, empty collections.

---

## Shared Components

### `ResultsView` (all three modes)

Reads shared storage itself. Accepts two render props:
- `renderByRoundEntry(ctx)` — inner content per (dialIndex, authorId) card in By Round
- `renderByPlayerGuess?(ctx)` — inner content per guess in By Player; omit to hide tab (2D)

Wrapper views only read mode-specific storage and pass closures.

### `MultiGuessBase` (Classic + 2D)

```ts
type GuessMode =
  | { kind: "classic"; playerDials: Record<string, DialConfig[]> }
  | { kind: "2d"; player2DDials: Record<string, Dial2DConfig[]> }
```

Owns: `{x,y}` position state (Classic ignores y), guess timer, auto-lock-in on expiry, 12s auto-advance, guesser status list, Double Down, Lock In / Next, `advanceGuess` mutation.

Switches on `mode.kind` for: dial lookup, scoring (`calcPoints` vs `calcPoints2D`), result shape (`posY`), presence fields, timer multiplier (×1 vs ×2), rendered component (`SpectrumDial` vs `SpectrumPlane`).

---

## Timer System

Options: 30s / 1 min / 90s / 2 min / No limit (0). Default 90s. Configured independently in WaitingRoom.

**2D doubling:** base value stored as-is (e.g. 90). WaitingRoom renders `label2x` when `gameMode === "2d"`. Views multiply internally. Switching to 2D auto-sets both timers to 60 (shows as "2 min").

**Clue timer:** `effectiveTimerDuration = clueTimerDuration × totalRounds` (×2 for 2D). Timestamp-based — survives refresh. On expiry: auto-save partial clues, set `presence.cluesComplete = true`; host advances with 5s fallback.

**Guess timer:** `effectiveTimer = guessTimerDuration` (×2 for 2D). `guessPhaseStartTime` set on `advanceToGuessing`, reset on each `advanceGuess`. On expiry: `savedOnExpiryRef` guards auto-lock-in.

---

## Game Flow

**WaitingRoom:** `initRoom` (host) / `registerPlayer` (non-host) on storage load — both no-op if already registered. `startGame` sets `cluePhaseStartTime` + `phase:"clue"`. Host navigates directly; non-hosts watch `phase` via `seenLobby` ref. Leave: host+only → delete room API; host+others → promote next player; non-host → remove self.

**Clue phase:** Each player saves their dials/colors on mount (no-op if set). Timer bar color: green → amber (≤30%) → red (≤10%). On full submission (or timer expiry), `advanceToGuessing` builds the queue and sets `guessPhaseStartTime`. Empty queue → jumps to results.

**Queue format:** `for d in [0..maxDials): for authorId: if clue[d] non-empty → push {dialIndex:d, authorId}`

**Guess phase:** Works through `guessingQueue[currentGuessIndex]`. Author sees live extraNeedles/extraPoints (presence) + zones always. Guessers see own needle only until `allGuessersLocked`, then zones reveal. After all locked: 12s countdown; author clicks Next or auto-advances. `advanceGuess` increments index and resets `guessPhaseStartTime`.

**Results:** Score = sum of `guessResults[key].points` per guesser. By Round: two-level collapsible (round → author). By Player: per-player collapsible with colored border. Play Again: `clearGameData` keeping `players` intact.

---

## Scoring

| Mode | Function | Points |
|---|---|---|
| Classic | `calcPoints(pos, target)` | 4/3/2/0 — zone widths ±2/±6/±10 |
| 2D | `calcPoints2D(x,y,tx,ty)` | 4/3/2/0 — Euclidean radii 3/8/12 |
| Colorform | `calcColorPoints(guess, target)` | 3/2/1/0 — Chebyshev 0/1/2 |

`applyDoubleDown(raw, dd)`: non-zero → ×2; zero → −2.

---

## Key Patterns / Gotchas

- **`useMutation` before `useEffect`:** block-scoped `const` is not hoisted — mutations used in effects must be declared first.
- **`useStorage` returns null during load:** always add `?? fallback` after the call.
- **`Dial2DConfig` type cast:** use `as unknown as Record<string, Dial2DConfig[]>` when reading from storage.
- **`DialConfig` vs `SpectrumCard`:** `category` is optional on `SpectrumCard` so both types pass as `card` prop.
- **Motion `Variants`:** annotate at module level (`const item: Variants = {...}`), not inside JSX.
- **`savedOnExpiryRef`:** reset on `currentGuessIndex` change; guards both clue auto-save and guess auto-lock.
- **Host navigation guard:** hosts navigate via button only, never via phase `useEffect`. Non-hosts use `seenLobby` ref.

---

## ColorGrid (`src/components/game/ColorGrid.tsx`)

32×16 grid, 1px gap, black background. Zone borders drawn as absolute `2px` spans on outer edges of zone-boundary cells (`BORDER_Z1 = rgba(255,255,255,0.95)` for dist≤1, `BORDER_Z2 = rgba(255,255,255,0.55)` for dist≤2). Target cell (`targetIndex`) gets same-style white border on all 4 edges + semi-transparent overlay. Selected cell shows centered white dot.

---

## Color Palette (`src/lib/colorPalette.ts`)

512 cells (32×16). `atan2` angle → hue; distance from center → saturation/lightness. Base: red/blue/green/yellow. Deuteranomaly: cyan/yellow/magenta/blue (180° rotation, avoids red-green axis). `pickColorOptions()` returns 3 vivid (dist ≥ 0.5) random indices.

---

## Environment

```
VITE_LIVEBLOCKS_PUBLIC_KEY=pk_...   ← browser
LIVEBLOCKS_SECRET_KEY=sk_...        ← server only
```

`DELETE /api/delete-room?roomId=` — Vite middleware proxies to Liveblocks REST without leaking secret. Called when last player leaves.
