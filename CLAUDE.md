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
│   └── spectrumCards.ts                 ← 93 spectrum card pairs with categories
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
│   ├── ui/
│   │   ├── ellipsis.tsx                 ← animated cycling ellipsis (. → .. → ...) at 500ms
│   │   └── badge, button, card, input, label, select, separator
│   └── game/
│       ├── SpectrumDial.tsx             ← interactive spectrum dial; supports extraNeedles (colored, for multi-player reveal)
│       └── ScoreDisplay.tsx             ← score + round counter (available, not currently used)
└── views/
    ├── StartView.tsx                    ← animated gradient, light/dark toggle (top-right), Play → joinOrHost
    └── multiplayer/
        ├── JoinOrHostView.tsx           ← name input, Host / Join (code); prefills code from ?room= URL param
        ├── WaitingRoomView.tsx          ← lobby: room code, mode/rounds/timer/categories, player list, host kick, motion animations
        ├── MultiClueView.tsx            ← clue entry phase with countdown timer bar, player status dots
        ├── MultiGuessView.tsx           ← simultaneous guess phase; round counter by dialIndex; status list for locked-in guessers
        └── MultiResultsView.tsx         ← leaderboard + per-dial breakdown (By Round / By Player toggle) + Leave Game
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
export const ROUND_OPTIONS = [1, 2, 3, 4, 5] as const;

export interface SpectrumCard { id: string; left: string; right: string; category?: string; }

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

**Helpers:** `setPlayerName`, `hostRoom()` (generates code, sets isHost=true, pushes `?room=CODE` to URL), `joinRoom(code)` (normalizes code, pushes `?room=CODE` to URL), `clearRoom()` (pushes `/` to URL), `setIsHost(v)` (used by RoomOrchestrator when host is promoted)

**Room code generation:** `Math.random().toString(36).slice(2, 8).toUpperCase()`

**URL sync:** `history.pushState` keeps the URL in sync so joining links work. `JoinOrHostView` reads `?room=` on mount to prefill the join code. `GameRouter` in App.tsx redirects to `joinOrHost` on load if `?room=` is present.

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
  clueTimerDuration: number;      // seconds per round; 0 = no limit; scaled by totalRounds in MultiClueView
  cluePhaseStartTime: number | null;  // Unix ms timestamp set when host starts; used for timer sync across refreshes
  selectedCategories: string[];   // empty = all categories
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
  // initialStorage sets phase:"lobby", gameMode:"classic", totalRounds, clueTimerDuration:90,
  //   cluePhaseStartTime:null, selectedCategories:[], empty collections
  // Renders: <RoomOrchestrator /> <RoomNavigator /> + view components
}

// GameRouter reads ?room= param on mount and navigates to joinOrHost if present
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

## Ellipsis Component (`src/components/ui/ellipsis.tsx`)

Animated ellipsis cycling `.` → `..` → `...` at 500ms. Used for all "waiting/loading" text.

```tsx
export function Ellipsis() {
  const [count, setCount] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setCount((c) => (c % 3) + 1), 500);
    return () => clearInterval(id);
  }, []);
  return <span aria-hidden="true">{"." .repeat(count)}</span>;
}
```

Not used in button labels — only in status/waiting text.

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
- Host selects game mode (Classic active, 3D locked/coming soon), round count, clue timer, and card categories
- Host can kick non-host players — `kickPlayer` mutation removes them from the `players` LiveMap; kick button (×) shown only to host, `cursor-pointer` styled; kicked players are not yet automatically navigated away (to be implemented)
- Host clicks "Start Game" (requires ≥2 players) → `startGame` sets `cluePhaseStartTime = Date.now()` and `phase = "clue"` → host navigates directly; non-hosts follow via `seenLobby` ref pattern
- **Copy options:** Two buttons — "Copy Code" (just the code) and "Copy Link" (`${origin}/?room=${code}`)

**Leave Room behavior:**
- Host + only player → calls `/api/delete-room` (Vite server middleware → Liveblocks REST `DELETE /v2/rooms/{id}`) → navigates; 400ms delay to flush mutation
- Host + other players → `leaveRoom` mutation removes host from players, promotes next player (first by storage insertion order), sets new `hostId`; remaining clients' `RoomOrchestrator` syncs via `hostId` storage watch
- Non-host → `leaveRoom` mutation removes from players list

**Navigation guard:** Hosts NEVER navigate via phase `useEffect` — only via `handleStart`. Non-hosts use `seenLobby` ref.

**Motion animations:** Outer container is a `motion.div` with `staggerChildren: 0.07`; each section is a `motion.div variants={item}` with `hidden: { opacity: 0, y: 12 }` → `show: { opacity: 1, y: 0 }`. `item` is typed as `Variants` and declared at module level (not inside JSX) to avoid TS inference errors.

### MultiClue
- On mount, each player calls `savePlayerDials(playerId, pickDials(totalRounds, selectedCategories))` to generate random cards + targets. No-op if already set.
- `pickDials` filters `spectrumCards` by `selectedCategories` if non-empty; caps at available cards: `Math.min(totalRounds, shuffled.length)`
- Each player sees their own dials with target visible (`hideNeedle=true`) and writes one clue per dial
- Host watches `playerClues` + `playerDials`; when every player has all clues non-empty (using actual dial counts), advances to guessing
- Progress indicator shows "Round X of Y" only — no submitted count (players see status in the player list below)
- **Clue timer**: configurable in WaitingRoom (30s / 1min / 90s / 2min / No limit). Default: 90s. Scales by `totalRounds` (`effectiveTimerDuration = clueTimerDuration * totalRounds`). Timer is timestamp-based (`Date.now() - cluePhaseStartTime`) so it survives page refreshes. When timer expires, each client auto-saves their partial local clues to storage, then host waits 2s (grace period) and advances. Only (player, dial) pairs with a non-empty clue are included in the guessing queue — players who wrote nothing are skipped.
- Timer bar color: green → amber (≤30%) → red (≤10%)

**Guessing queue format** — one entry per (dial, author) pair with a non-empty clue:
```
for each dial d:
  for each authorId:
    if playerClues[authorId][d] is non-empty:
      push { dialIndex: d, authorId }
```

`advanceToGuessing` mutation builds the queue internally from fresh storage, guarding against duplicate calls with `if (phase !== "clue") return`. Uses `maxDials = Math.max(...playerIds.map(id => dialsMap.get(id)?.length ?? 0))` to handle variable dial counts from category filtering. If the resulting queue is empty (no one wrote any clues), jumps directly to `results`.

**Result key format:** `` `${guesserId}-${dialIndex}-${authorId}` ``

### MultiGuess
- Works through `guessingQueue[currentGuessIndex]` — each entry is `{ dialIndex, authorId }`
- **Round counter:** `Round {dialIndex + 1} of {maxDialIndex + 1}` — advances when all players in a dial round are done, not per queue entry
- All non-authors guess simultaneously by dragging their own needle
- **Author view:** `hideNeedle=true` + `showTarget=true` always (author always sees zones) + `extraNeedles` showing all guessers' live colored positions from `useOthers` presence (or locked result position once submitted)
- **Guesser view:** own white needle only (no extra needles until `allGuessersLocked`); `smooth={false}` for instant drag feedback
- Live needle positions broadcast via `presence.dialPosition` → `useUpdateMyPresence` on every drag
- `showTarget` reveals for everyone after **all guessers** have locked in (`allGuessersLocked`)
- After locking in, each guesser sees the status list (who else is still guessing) — condition: `amIAuthor || myLocked || allGuessersLocked`
- Each guesser locks in independently via `recordGuess` mutation
- When `allGuessersLocked` → zones + all needle positions reveal; author sees score preview (`+N pts`) per guesser; author clicks **Next** → `advanceGuess` mutation
- **Double-advance prevention:** `isAdvancing` ref (reset on `currentGuessIndex` change) guards both the manual Next button (`handleAdvance`) and the auto-advance timer effect
- **12s auto-advance:** countdown starts when `allGuessersLocked`; at 0, author auto-calls `advanceGuess()` (guarded by `allGuessersLocked && !isAdvancing.current`); timer resets on `currentGuessIndex` change

**Mutation ordering:** `recordGuess` and `advanceGuess` are declared before `useEffect` hooks to avoid "used before declaration" TS errors.

### MultiResults
- Leaderboard: scores summed from `guessResults` keys (parsed as `${guesserId}-${dialIndex}-${authorId}`)
- **Round Breakdown toggle:** "By Round" (default) or "By Player" — toggles `breakdownView` state
  - By Round: each (dial, author) card with full SpectrumDial + extraNeedles + per-guesser score row
  - By Player: per-player card with colored left border; each guess shows dial with their needle + target + `+N pts`
- **Play Again** (host only): `resetForNewGame` mutation clears game data but **keeps `players` LiveMap** (colors + host preserved) → sets `phase="lobby"` → host navigates to waitingRoom; non-hosts follow via `phase` watch
- **Leave Game** button: same logic as WaitingRoom leave (delete room if last player, otherwise `leaveRoom` mutation + 400ms delay)

---

## Views Summary

| View | Key Elements |
|---|---|
| `StartView` | Animated gradient (light/dark variants), light/dark toggle button (top-right, defaults to system), Play → joinOrHost |
| `JoinOrHostView` | Name input (required), Host / Join (code entry); prefills code from `?room=` URL param |
| `WaitingRoomView` | Room code + Copy Code / Copy Link, Classic/3D mode selector, rounds dropdown (`[1,2,3,4,5]`), clue timer dropdown (30s/1min/90s/2min/No limit), category filter chips (All + 8 categories), player list with colored dots + Host/You badges + kick (×) for host, Start Game, Leave Room; staggered motion fade-in |
| `MultiClueView` | Countdown timer bar (color shifts amber→red), round progress ("Round X of Y"), dial tabs, `SpectrumDial` `showTarget=true hideNeedle=true`, clue input, Submit All Clues; auto-saves partial clues on timer expiry; player status list (Ready/Partial/Writing…) |
| `MultiGuessView` | Round counter by dialIndex, Clue display, SpectrumDial (author: always showTarget + extraNeedles; guesser: own needle, showTarget after all locked), Lock In, guesser status list (visible to locked-in guessers too), score preview after reveal, Next with 12s countdown (author auto-advances) |
| `MultiResultsView` | Ranked leaderboard with color dots, By Round / By Player breakdown toggle, per-dial SpectrumDial with all guess positions, Play Again (host) / waiting message (non-host), Leave Game |

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

93 total cards, all with categories. 8 categories: `Physical`, `Personality`, `Society`, `Opinion`, `Lifestyle`, `Abstract`, `Morality`, `Pop Culture`.

```ts
export const CARD_CATEGORIES = ["Physical", "Personality", "Society", "Opinion", "Lifestyle", "Abstract", "Morality", "Pop Culture"];
```

`SpectrumCard.category` is optional (`category?: string`) to avoid type conflicts when `DialConfig` (which extends the card shape without `category`) is passed to `SpectrumDial`.

---

## Known TypeScript Patterns / Gotchas

- **`useMutation` before `useEffect`:** Any `useMutation` result used inside a `useEffect` must be declared before the effect to avoid "used before declaration" TS errors (block-scoped `const` is not hoisted). Keep all mutations at the top of the component, above effects.
- **Motion `Variants` type:** Must be explicitly annotated at module level (`const item: Variants = { ... }`), not inferred inside JSX return — otherwise TS can't resolve the type.
- **`DialConfig` vs `SpectrumCard`:** `DialConfig` adds `targetPosition` but lacks `category`. `SpectrumCard.category` is optional so both types are compatible as `card` prop on `SpectrumDial`.

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
