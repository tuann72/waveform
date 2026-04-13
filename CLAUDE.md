# Waveform — Project Reference

## Overview

A real-time multiplayer Wavelength board game. Players share a room code, each writes clues for spectrum dials, then take turns guessing. No single-player mode.

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
                                                                                 MULTI_GUESS ── players alternate guessing via queue
                                                                                      │ when queue exhausted
                                                                                 MULTI_RESULTS ── leaderboard + per-dial breakdown
                                                                                      │
                                                                                 [Play Again → START]
```

---

## File Structure

```
src/
├── App.tsx                              ← providers + GameRouter
├── index.css                            ← @keyframes gradient-flow (StartView background)
├── types/
│   └── game.ts                          ← AppView, zone constants, GameState, SpectrumCard
├── data/
│   └── spectrumCards.ts                 ← spectrum card pairs
├── context/
│   ├── GameContext.tsx                  ← minimal view router + totalRounds state
│   └── MultiplayerContext.tsx           ← pre-room local state (name, roomCode, playerId, isHost)
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
│       ├── SpectrumDial.tsx             ← interactive spectrum dial with 5 non-overlapping zone segments
│       └── ScoreDisplay.tsx             ← score + round counter (available, not currently used)
└── views/
    ├── StartView.tsx                    ← animated gradient, Play → joinOrHost
    └── multiplayer/
        ├── JoinOrHostView.tsx           ← name input, Host (immediate) / Join (code)
        ├── WaitingRoomView.tsx          ← lobby: room code + copy, mode/rounds, player list
        ├── MultiClueView.tsx            ← clue entry phase
        ├── MultiGuessView.tsx           ← alternating guess phase
        └── MultiResultsView.tsx         ← leaderboard + breakdown
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
export const ROUND_OPTIONS = [3, 5, 10, 15, 20] as const;

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

Pre-room local state — exists outside `RoomProvider`.

```ts
interface MultiplayerState {
  playerName: string;   // entered in JoinOrHostView
  roomCode: string;     // 6-char alphanumeric; set by hostRoom() or joinRoom()
  playerId: string;     // module-level constant (unique per tab, not sessionStorage)
  isHost: boolean;
}
```

**Helpers:** `setPlayerName`, `hostRoom()` (generates code, sets isHost=true), `joinRoom(code)`, `clearRoom()`

**Room code generation:** `Math.random().toString(36).slice(2, 8).toUpperCase()`

---

## Liveblocks (`src/lib/liveblocks.ts`)

```ts
export type RoomPhase = "lobby" | "clue" | "guessing" | "results";
export type GameMode = "classic" | "3d";

export type Storage = {
  phase: RoomPhase;
  gameMode: GameMode;
  totalRounds: number;
  hostId: string;
  players: LiveMap<string, PlayerInfo>;          // id → { name, isHost }
  playerDials: LiveMap<string, DialConfig[]>;    // playerId → DialConfig[] (each player picks own cards + targets)
  playerClues: LiveMap<string, string[]>;        // playerId → clues[dialIndex]
  guessingQueue: LiveList<GuessEntry>;           // { dialIndex, authorId, guesserId }
  currentGuessIndex: number;
  guessResults: LiveMap<string, GuessResult>;    // key: `${guesserId}-${dialIndex}-${authorId}`
};

export type Presence = { playerName: string; cluesComplete: boolean };
```

**Room ID:** `waveform-${roomCode}`

**Hooks exported:** `RoomProvider`, `useStorage`, `useMutation`, `useOthers`, `useSelf`, `useMyPresence`, `useUpdateMyPresence`

---

## App.tsx Shape

```ts
const ROOM_VIEWS = new Set(["waitingRoom", "multiClue", "multiGuess", "multiResults"]);

function MultiplayerRoom() {
  // Wraps RoomProvider for all in-room views
  // initialStorage sets phase:"lobby", gameMode:"classic", totalRounds, empty collections
}

function GameRouter() {
  if (ROOM_VIEWS.has(state.view)) return <MultiplayerRoom />;
  switch (state.view) {
    case "start":      return <StartView />;
    case "joinOrHost": return <JoinOrHostView />;
    default:           return null;
  }
}
```

---

## SpectrumDial (`src/components/game/SpectrumDial.tsx`)

```ts
interface SpectrumDialProps {
  card: SpectrumCard;
  dialPosition: number;           // 0–100
  onDialChange: (pos: number) => void;
  showTarget: boolean;            // shows zone segments when true
  targetPosition?: number;        // required when showTarget=true
  disabled?: boolean;
  hideNeedle?: boolean;           // hides the draggable needle (used in clue phase)
}
```

**Zones** (5 non-overlapping segments, rendered only when `showTarget=true`):

| Segment | Range | Color |
|---|---|---|
| outer-left / outer-right | ±6–10% from target | `rgba(251,191,36,0.5)` |
| mid-left / mid-right | ±2–6% from target | `rgba(250,204,21,0.65)` |
| bullseye | ±2% of target | `rgba(74,222,128,0.75)` |

**Track:** `bg-gradient-to-r from-purple-700 to-zinc-300`

**Drag hook** (`useDialDrag.ts`): `setPointerCapture` on `pointerdown`, computes `(clientX - trackLeft) / trackWidth * 100` clamped 0–100 on `pointermove`. Works for mouse and touch.

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
- Host enters → `initRoom` mutation fires when storage loads: resets phase to "lobby", clears all leftover state (dials, clues, results, queue, players), registers host
- Non-hosts: registered via `registerPlayer` mutation (enforces **MAX_PLAYERS = 12**)
- Host selects game mode (Classic active, 3D locked/coming soon) and round count
- Host clicks "Start Game" (requires ≥2 players) → `startGame` mutation sets `phase = "clue"`, then `goTo("multiClue")` directly. No shared dials are generated here — each player generates their own in the clue phase.

**Navigation guard:** Hosts NEVER navigate via the phase `useEffect` — only via `handleStart`. Non-hosts use a `seenLobby` ref and only navigate when phase changes `"lobby" → "clue"` (prevents spurious navigation from stale rooms or Liveblocks optimistic state).

### MultiClue
- On mount, each player calls `savePlayerDials(playerId, pickDials(totalRounds))` to generate their own random cards + targets (stored in `playerDials`). No-op if already set.
- Each player sees their own dials with target visible (`hideNeedle=true`) and writes one clue per dial
- Tab through dials with Prev/Next; final dial shows "Submit All Clues"
- After submitting, `playerClues.set(playerId, clues)` is called and `presence.cluesComplete = true`
- Host watches `playerClues` + `playerDials` via `useEffect`; when every player has both, builds `guessingQueue` and sets `phase = "guessing"`

**Guessing queue logic** — every player authors every dial, every other player guesses:
```
for each dial d:
  for each authorId:
    for each guesserId (≠ authorId):
      push { dialIndex: d, authorId, guesserId }
```

**Result key format:** `` `${guesserId}-${dialIndex}-${authorId}` `` (includes authorId to disambiguate multiple authors per dial index)

### MultiGuess
- Works through `guessingQueue[currentGuessIndex]` one at a time
- Card and target come from `playerDials[authorId][dialIndex]`
- Active guesser drags dial and locks in → `guessResults.set(`${guesserId}-${dialIndex}-${authorId}`, { position, points })`, increment `currentGuessIndex`
- When `currentGuessIndex >= queueLength` → `phase = "results"`
- Score badge shown immediately after lock-in

### MultiResults
- Leaderboard: sum of guessing points per player, ranked descending
- Per-dial breakdown: grouped by (author, dialIndex) pair from queue; card label from `playerDials[authorId][dialIndex]`, clue from `playerClues[authorId][dialIndex]`
- "Play Again" → `clearRoom()` + `goTo("start")`

---

## Views Summary

| View | Key Elements |
|---|---|
| `StartView` | Animated gradient background, Play button → joinOrHost |
| `JoinOrHostView` | Name input (required, shows inline error if missing), Host (immediate) / Join (code entry panel) |
| `WaitingRoomView` | Room code + "Copy Code" button, Classic/3D mode selector (host only), rounds dropdown, player list with Host/You badges, Start Game (disabled until ≥2 players) |
| `MultiClueView` | Dial tabs, SpectrumDial `showTarget=true hideNeedle=true`, clue Input per dial, Prev/Next navigation, Submit All Clues, per-player ready status |
| `MultiGuessView` | Clue display, SpectrumDial (draggable for active guesser), Lock In button, score reveal badge, "Waiting for X…" for others |
| `MultiResultsView` | Ranked leaderboard, per-dial breakdown with clue + per-player scores, Play Again |

---

## Environment Variables

```
# .env.local
VITE_LIVEBLOCKS_PUBLIC_KEY=pk_...
LIVEBLOCKS_SECRET_KEY=sk_...
```

---

## shadcn Components Installed

```bash
bunx shadcn add badge button card input label select separator
```

All `<Button>` components have `cursor-pointer` in the base CVA class.

---

## Future: 3D Mode (React Three Fiber)

The 3D mode button is present in WaitingRoom as a locked placeholder. When implemented:

**Install:**
```bash
bun add @react-three/fiber @react-three/drei three
bun add -d @types/three
```

**Concept:** Replace the flat spectrum bar with a 3D scene — a glowing tunnel/corridor where the target zone is a band of light along the Z-axis. The needle becomes a 3D marker the player drags.

**Key R3F pieces:**
- `<Canvas>` in a new `Multi3DView.tsx`
- `<mesh>` + `<tubeGeometry>` for the spectrum tunnel
- `<MeshStandardMaterial emissive>` for zone highlights
- `useFrame` for idle animation
- Drag maps 3D world space → 0–100 position → same `calcPoints` scoring

The `GameMode` type and `gameMode` Liveblocks storage field are already in place. Scoring, card data, and the guessing queue are shared with Classic.
