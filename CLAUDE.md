# Waveform — Project Reference

## Overview

A real-time multiplayer Wavelength board game. Players share a room code, each writes clues for spectrum dials, then all non-authors guess simultaneously. No single-player mode.

**Stack:** Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui + Liveblocks v3 (`@liveblocks/client`, `@liveblocks/react`). All view switching is state-driven — no React Router.

---

## View Flow

```
START ──[Play]──► JOIN_OR_HOST
                    ├─ [Host]  ──────────────────────────────────────────────────────┐
                    └─ [Join + code] ──────────────────────────────────────────────►WAITING_ROOM
                                                                                      │ host picks mode + rounds, ≥2 players
                                                                                 [Start Game]
                                                                                      │
                                                                                 MULTI_CLUE ── all players write clues for every dial
                                                                                      │ when all submitted
                                                                                 MULTI_GUESS ── all non-authors guess simultaneously per (author, dial) pair
                                                                                      │ when all pairs exhausted
                                                                                 MULTI_RESULTS ── leaderboard + per-dial breakdown with spectrum + needle positions
                                                                                      │
                                                                                 [Play Again → WAITING_ROOM (same room)]
```

---

## File Structure

```
src/
├── App.tsx                              ← providers + GameRouter + RoomOrchestrator + RoomNavigator
├── index.css                            ← @keyframes gradient-flow (StartView background)
├── types/
│   └── game.ts                          ← AppView, zone constants, GameState, SpectrumCard
├── data/
│   └── spectrumCards.ts                 ← 43 spectrum card pairs
├── context/
│   ├── GameContext.tsx                  ← minimal view router + totalRounds state
│   └── MultiplayerContext.tsx           ← session-persisted local state (name, roomCode, playerId, isHost)
├── hooks/
│   └── useDialDrag.ts                   ← pointer-capture drag (mouse + touch)
├── lib/
│   ├── liveblocks.ts                    ← Liveblocks client + Storage/Presence types + typed hooks
│   ├── scoring.ts                       ← calcPoints(dial, target): number
│   └── utils.ts                         ← shadcn cn() helper
├── components/
│   ├── theme-provider.tsx
│   ├── ui/                              ← badge, button, card, input, label, select, separator
│   └── game/
│       ├── SpectrumDial.tsx             ← interactive spectrum dial; supports extraNeedles (colored, for multi-player reveal)
│       └── ScoreDisplay.tsx             ← score + round counter (available, not currently used)
└── views/
    ├── StartView.tsx                    ← animated gradient, light/dark toggle (top-right), Play → joinOrHost
    └── multiplayer/
        ├── JoinOrHostView.tsx           ← name input, Host / Join (code)
        ├── WaitingRoomView.tsx          ← lobby: room code, mode/rounds, player list with color dots, host succession on leave
        ├── MultiClueView.tsx            ← clue entry phase, colored player status dots
        ├── MultiGuessView.tsx           ← simultaneous guess phase; author sees all live colored needles, guessers see only their own
        └── MultiResultsView.tsx         ← leaderboard + per-dial breakdown with SpectrumDial showing all guess positions
```

---

## TypeScript Types (`src/types/game.ts`)

```ts
export type AppView =
  | "start" | "joinOrHost" | "waitingRoom"
  | "multiClue" | "multiGuess" | "multiResults";

export const ZONE_WIDTHS = { bullseye: 2, mid: 6, outer: 10 } as const;
export const ZONE_POINTS = { bullseye: 4, mid: 3, outer: 2, miss: 0 } as const;
export const DEFAULT_ROUNDS = 3;
export const ROUND_OPTIONS = [1, 3, 5, 7, 10] as const;

export interface SpectrumCard { id: string; left: string; right: string; }

export interface GameState {
  view: AppView;
  totalRounds: number;
}
```

---

## GameContext (`src/context/GameContext.tsx`)

Minimal state machine — just view routing and round count. All game logic lives in Liveblocks mutations.

**Actions:** `SET_VIEW | SET_TOTAL_ROUNDS | RESET_GAME`

**Context helpers:** `goTo(view)`, `setTotalRounds(n)`, `resetGame()`

---

## MultiplayerContext (`src/context/MultiplayerContext.tsx`)

Pre-room local state — exists outside `RoomProvider`. Persisted to `sessionStorage` so playerId survives page refreshes (enabling reconnect).

```ts
interface MultiplayerState {
  playerName: string;
  roomCode: string;
  playerId: string;   // generated once per session (survives refresh, unique per tab)
  isHost: boolean;
}
```

**Helpers:** `setPlayerName`, `hostRoom()` (generates code, sets isHost=true), `joinRoom(code)`, `clearRoom()`, `setIsHost(v)` (used by RoomOrchestrator when host is promoted)

**Room code generation:** `Math.random().toString(36).slice(2, 8).toUpperCase()`

---

## Liveblocks (`src/lib/liveblocks.ts`)

```ts
export type RoomPhase = "lobby" | "clue" | "guessing" | "results";
export type GameMode = "classic" | "3d";

export type PlayerInfo = {
  name: string;
  isHost: boolean;
  color: string;      // assigned from PLAYER_COLORS palette on join
};

export type GuessEntry = {
  dialIndex: number;
  authorId: string;
  // No guesserId — all non-authors guess simultaneously
};

export type Storage = {
  phase: RoomPhase;
  gameMode: GameMode;
  totalRounds: number;
  hostId: string;
  players: LiveMap<string, PlayerInfo>;          // id → { name, isHost, color }
  playerDials: LiveMap<string, DialConfig[]>;    // playerId → DialConfig[]
  playerClues: LiveMap<string, string[]>;        // playerId → clues[dialIndex]
  guessingQueue: LiveList<GuessEntry>;           // { dialIndex, authorId } per (author, dial) pair
  currentGuessIndex: number;
  guessResults: LiveMap<string, GuessResult>;    // key: `${guesserId}-${dialIndex}-${authorId}`
};

export type Presence = {
  playerName: string;
  cluesComplete: boolean;
  playerId: string | null;     // used to match presence to storage player record
  dialPosition: number | null; // live needle position broadcast during guessing
};
```

**Room ID:** `waveform-${roomCode}`

**Hooks exported:** `RoomProvider`, `useStorage`, `useMutation`, `useOthers`, `useSelf`, `useMyPresence`, `useUpdateMyPresence`

---

## App.tsx Shape

```ts
const ROOM_VIEWS = new Set(["waitingRoom", "multiClue", "multiGuess", "multiResults"]);

// RoomOrchestrator — null-rendering component inside RoomProvider
// • Watches useOthers() presence to detect host disconnection
// • Promotes first connected player (by storage insertion order) via promoteToHost mutation
// • Watches hostId storage: if it changes to mp.playerId, calls setIsHost(true)

// RoomNavigator — null-rendering component inside RoomProvider
// • On mount, checks current phase and redirects if joining mid-game
//   (e.g. reconnect while phase === "guessing" → goTo("multiGuess"))

function MultiplayerRoom() {
  // Wraps RoomProvider for all in-room views
  // initialStorage sets phase:"lobby", gameMode:"classic", totalRounds, empty collections
  // Renders: <RoomOrchestrator /> <RoomNavigator /> + view components
}
```

---

## Player Colors

Assigned in `WaitingRoomView` when players join. Stored in `PlayerInfo.color` in Liveblocks storage so all clients see consistent colors throughout the session.

```ts
// src/views/multiplayer/WaitingRoomView.tsx
const PLAYER_COLORS = [
  "#f87171", "#fb923c", "#facc15", "#4ade80",
  "#22d3ee", "#60a5fa", "#a78bfa", "#e879f9",
  "#f472b6", "#34d399", "#818cf8", "#94a3b8",
];
// Host always gets index 0; each joiner gets players.size % PLAYER_COLORS.length
```

Colors shown as dots next to player names in: WaitingRoom, MultiClue status list, MultiGuess guesser list, Results breakdown.

---

## SpectrumDial (`src/components/game/SpectrumDial.tsx`)

```ts
export interface ExtraNeedle { position: number; color: string; }

interface SpectrumDialProps {
  card: SpectrumCard;
  dialPosition: number;           // 0–100 (main/local needle)
  onDialChange: (pos: number) => void;
  showTarget: boolean;            // reveals zone segments
  targetPosition?: number;        // required when showTarget=true
  disabled?: boolean;
  hideNeedle?: boolean;           // hides the white main needle (used for author view + clue phase)
  smooth?: boolean;               // CSS transition on main needle (spectator views)
  extraNeedles?: ExtraNeedle[];   // colored needles for other players (always smooth)
}
```

**Zones** (5 non-overlapping segments, rendered only when `showTarget=true`):

| Segment | Range | Color |
|---|---|---|
| outer-left / outer-right | ±6–10% from target | `rgba(251,191,36,0.5)` |
| mid-left / mid-right | ±2–6% from target | `rgba(250,204,21,0.65)` |
| bullseye | ±2% of target | `rgba(74,222,128,0.75)` |

**Track:** `bg-gradient-to-r from-purple-700 to-zinc-300`

**Extra needles** rendered below the main white needle (so main is always on top). Each has a colored glow via `boxShadow`.

---

## Scoring (`src/lib/scoring.ts`)

```ts
export function calcPoints(dial: number, target: number): number {
  const delta = Math.abs(dial - target);
  if (delta <= ZONE_WIDTHS.bullseye) return ZONE_POINTS.bullseye; // 4
  if (delta <= ZONE_WIDTHS.mid)      return ZONE_POINTS.mid;      // 3
  if (delta <= ZONE_WIDTHS.outer)    return ZONE_POINTS.outer;    // 2
  return ZONE_POINTS.miss;                                         // 0
}
```

---

## Multiplayer Game Flow

### WaitingRoom
- Host enters → `initRoom` mutation fires when storage loads: skips if player already registered (returning after play again), otherwise does full reset (clears all game data, re-registers host with color index 0)
- Non-hosts: registered via `registerPlayer` (no-op if already registered); enforces **MAX_PLAYERS = 12**
- Host selects game mode (Classic active, 3D locked/coming soon) and round count
- Host clicks "Start Game" (requires ≥2 players) → `startGame` sets `phase = "clue"` → host navigates directly; non-hosts follow via `seenLobby` ref pattern

**Leave Room behavior:**
- Host + only player → calls `/api/delete-room` (Vite server middleware → Liveblocks REST `DELETE /v2/rooms/{id}`) → navigates; 400ms delay to flush mutation
- Host + other players → `leaveRoom` mutation removes host from players, promotes next player (first by storage insertion order), sets new `hostId`; remaining clients' `RoomOrchestrator` syncs via `hostId` storage watch
- Non-host → `leaveRoom` mutation removes from players list

**Navigation guard:** Hosts NEVER navigate via phase `useEffect` — only via `handleStart`. Non-hosts use `seenLobby` ref.

### MultiClue
- On mount, each player calls `savePlayerDials(playerId, pickDials(totalRounds))` to generate random cards + targets. No-op if already set.
- Each player sees their own dials with target visible (`hideNeedle=true`) and writes one clue per dial
- Host watches `playerClues` + `playerDials`; when every player has both, builds `guessingQueue` and sets `phase = "guessing"`

**Guessing queue format** — one entry per (dial, author) pair; all non-authors guess simultaneously:
```
for each dial d:
  for each authorId:
    push { dialIndex: d, authorId }
```

`advanceToGuessing` mutation guards against duplicate calls with `if (phase !== "clue") return`.

**Result key format:** `` `${guesserId}-${dialIndex}-${authorId}` ``

### MultiGuess
- Works through `guessingQueue[currentGuessIndex]` — each entry is `{ dialIndex, authorId }`
- All non-authors guess simultaneously by dragging their own needle
- **Author view:** `hideNeedle=true` + `extraNeedles` showing all guessers' live colored positions from `useOthers` presence (or locked result position once submitted)
- **Guesser view:** own white needle only (no extra needles); `smooth={false}` for instant drag feedback
- Live needle positions broadcast via `presence.dialPosition` → `useUpdateMyPresence` on every drag
- `showTarget` only reveals after **all guessers** have locked in (`allGuessersLocked`)
- Each guesser locks in independently via `recordGuess` mutation
- When `allGuessersLocked` → zones reveal for everyone; author clicks **Next** → `advanceGuess` mutation
- Score points not shown after lock-in — only the visual dial with zones + colored needles

### MultiResults
- Leaderboard: scores summed from `guessResults` keys (parsed as `${guesserId}-${dialIndex}-${authorId}`)
- Per-dial breakdown: each card shows author/clue, full `SpectrumDial` with `showTarget=true` + `extraNeedles` for all guessers' locked positions, per-player score row
- **Play Again** (host only): `resetForNewGame` mutation clears game data but **keeps `players` LiveMap** (colors + host preserved) → sets `phase="lobby"` → host navigates to waitingRoom; non-hosts follow via `phase` watch

---

## Views Summary

| View | Key Elements |
|---|---|
| `StartView` | Animated gradient (light/dark variants), light/dark toggle button (top-right, defaults to system), Play → joinOrHost |
| `JoinOrHostView` | Name input (required), Host / Join (code entry) |
| `WaitingRoomView` | Room code + copy, Classic/3D mode selector, rounds dropdown (`[1,3,5,7,10]`), player list with colored dots + Host/You badges, Start Game, Leave Room (with host succession logic) |
| `MultiClueView` | Dial tabs with color dots on status, `SpectrumDial` `showTarget=true hideNeedle=true`, clue input, Submit All Clues |
| `MultiGuessView` | Clue display, SpectrumDial (author: extraNeedles for all guessers; guesser: own needle only), Lock In, Next (author after all locked), guesser status list |
| `MultiResultsView` | Ranked leaderboard with color dots, per-dial SpectrumDial breakdown with all guess needle positions, Play Again (host) / waiting message (non-host) |

---

## Theme

`StartView` supports light and dark gradient variants. Toggle in top-right corner (sun/moon icon). Defaults to system preference via `matchMedia`. Preference persisted in `localStorage` via shadcn `ThemeProvider`.

```ts
const GRADIENTS = {
  light: "linear-gradient(-45deg, #2563eb, #7c3aed, #a855f7, #f97316)",
  dark:  "linear-gradient(-45deg, #1e3a8a, #4c1d95, #581c87, #7c2d12)",
};
```

Both use `backgroundImage` (not `background` shorthand) + `backgroundSize: "300% 300%"` + `gradient-flow` keyframe animation.

---

## Vite Server Middleware (`vite.config.ts`)

A custom Vite plugin adds a server-side API route to delete Liveblocks rooms without exposing the secret key to the browser.

```
DELETE /api/delete-room?roomId={id}
→ calls Liveblocks REST API: DELETE https://api.liveblocks.io/v2/rooms/{id}
   Authorization: Bearer LIVEBLOCKS_SECRET_KEY
```

**Key implementation details:**
- Uses `loadEnv(mode, process.cwd(), '')` (empty prefix = loads ALL env vars including non-`VITE_` ones)
- Middleware registered as catch-all (not path-prefixed) to prevent Connect stripping `req.url` and losing the query string
- Used in `configureServer` (dev); can be extended to `configurePreviewServer`

---

## Environment Variables

```
# .env.local
VITE_LIVEBLOCKS_PUBLIC_KEY=pk_...   ← exposed to browser (Liveblocks client)
LIVEBLOCKS_SECRET_KEY=sk_...        ← server-side only (room deletion API)
```

---

## shadcn Components Installed

```bash
bunx shadcn add badge button card input label select separator
```

All `<Button>` components have `cursor-pointer` in the base CVA class.

---

## Spectrum Cards (`src/data/spectrumCards.ts`)

43 total cards. Examples: Hot/Cold, Good/Evil, Overrated/Underrated, Niche/Mainstream, Instinct/Logic, Fantasy/Sci-Fi, Chaotic/Orderly, Timeless/Trendy.

---

## Future: 3D Mode (React Three Fiber)

The 3D mode button is present in WaitingRoom as a locked placeholder. When implemented:

**Install:**
```bash
bun add @react-three/fiber @react-three/drei three
bun add -d @types/three
```

**Concept:** Replace the flat spectrum bar with a 3D scene — a glowing tunnel/corridor where the target zone is a band of light along the Z-axis. The needle becomes a 3D marker the player drags.

The `GameMode` type and `gameMode` Liveblocks storage field are already in place. Scoring, card data, and the guessing queue are shared with Classic.
