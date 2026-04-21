# Waveform

Real-time multiplayer party game with three modes: Classic spectrum dials, 2D spectrum planes, and Colorform color-matching. Players write clues, others guess simultaneously.

## Setup

```bash
bun install
cp .env.example .env.local  # add VITE_LIVEBLOCKS_PUBLIC_KEY and LIVEBLOCKS_SECRET_KEY
bun dev
```

## Game Modes

### Classic
Each player sees a spectrum dial (e.g. "Hot ↔ Cold") with a hidden target. Write a clue, everyone else drags a needle to guess. Scoring: bullseye 4 pts · mid 3 pts · outer 2 pts · miss 0.

### 2D
Each player sees a 2D plane with two spectrum axes (horizontal + vertical). Write one clue covering both axes, others tap a point. Scoring uses Euclidean distance: bullseye (r≤3) 4 pts · mid (r≤8) 3 pts · outer (r≤12) 2 pts · miss 0. All timers are doubled vs Classic.

### Colorform
Players receive 3 random color swatches, pick one, write a clue. Others find that color on a 32×16 color wheel grid. Scoring uses Chebyshev distance: exact 3 pts · 1 cell away 2 pts · 2 cells away 1 pt.

### Double Down
Available in Classic and 2D. Guesser bets before locking in — scores double if they land in any zone, loses 2 pts if they miss.

## Project Structure

```
src/
├── App.tsx                              # RoomProvider, RoomOrchestrator (host promotion),
│                                        # RoomNavigator (reconnect redirect), InRoomViews
│                                        # (routes to correct mode's views), RoomVerifier
├── index.css                            # gradient-flow keyframe animation (StartView)
│
├── types/game.ts                        # AppView, zone constants, GameState, SpectrumCard
├── data/spectrumCards.ts                # 93 spectrum card pairs across 8 categories
│
├── context/
│   ├── GameContext.tsx                  # view router + totalRounds state
│   └── MultiplayerContext.tsx           # session-persisted local state (name, roomCode,
│                                        # playerId, isHost); survives page refresh
│
├── hooks/
│   ├── useDialDrag.ts                   # pointer-capture drag for spectrum needle
│   └── useLeaveRoom.ts                  # shared leave logic used by WaitingRoom + Results
│
├── lib/
│   ├── liveblocks.ts                    # Liveblocks client, Storage/Presence types,
│   │                                    # clearGameData() helper, typed hooks
│   ├── colorPalette.ts                  # 512-color 2D wheel (32×16), base + deuteranomaly
│   │                                    # palettes, chebyshevDistance, calcColorPoints,
│   │                                    # pickColorOptions
│   ├── scoring.ts                       # calcPoints (Classic), calcPoints2D (2D),
│   │                                    # applyDoubleDown
│   └── utils.ts                         # shadcn cn() helper
│
├── components/
│   ├── LavaLampBackground.tsx           # Three.js wave mesh background (StartView)
│   ├── theme-provider.tsx / theme-context.ts
│   ├── ui/                              # shadcn: badge, button, card, input,
│   │   └── ellipsis.tsx                 # label, select, separator + animated ellipsis
│   └── game/
│       ├── SpectrumDial.tsx             # Draggable 1D spectrum needle; zone overlays;
│       │                                # extraNeedles for multiplayer reveal
│       ├── SpectrumPlane.tsx            # Canvas-based 2D interactive plane; circular
│       │                                # zone rings; extraPoints for multiplayer reveal
│       ├── ColorGrid.tsx                # 32×16 color swatch grid; Chebyshev zone borders
│       │                                # as per-edge spans; target cell outlined with
│       │                                # white ring matching zone border style
│       ├── MultiGuessBase.tsx           # Shared guess-phase logic for Classic + 2D;
│       │                                # accepts mode:{kind:"classic"|"2d", dials}
│       ├── ResultsView.tsx              # Shared results layout for all three modes;
│       │                                # render props: renderByRoundEntry,
│       │                                # renderByPlayerGuess (omit to hide By Player tab)
│       └── EmojiReactions.tsx           # Hamster reaction picker; floating animations
│
└── views/
    ├── StartView.tsx                    # Animated wave background, theme toggle
    └── multiplayer/
        ├── JoinOrHostView.tsx           # Name input, host/join, ?room= prefill
        ├── WaitingRoomView.tsx          # Lobby: room code, mode selector, rounds,
        │                                # clue timer, guess timer, categories, player
        │                                # list, kick, color picker, motion animations
        ├── MultiClueView.tsx            # Classic clue entry with timer bar
        ├── MultiGuessView.tsx           # Classic guess (thin wrapper → MultiGuessBase)
        ├── MultiResultsView.tsx         # Classic results (thin wrapper → ResultsView)
        ├── Multi2DClueView.tsx          # 2D clue entry with timer bar (2× duration)
        ├── Multi2DGuessView.tsx         # 2D guess (thin wrapper → MultiGuessBase)
        ├── Multi2DResultsView.tsx       # 2D results, By Round only (→ ResultsView)
        ├── ColorformClueView.tsx        # Colorform: 3 large swatches, pick + write clue
        ├── ColorformGuessView.tsx       # Colorform: tap color on grid, zone reveal
        └── ColorformResultsView.tsx     # Colorform results (thin wrapper → ResultsView)
```

## Liveblocks Storage Schema

```ts
phase: "lobby" | "clue" | "guessing" | "results"
gameMode: "classic" | "2d" | "colorform"
totalRounds: number
clueTimerDuration: number          // seconds; 0 = unlimited; 2D views apply ×2 internally
cluePhaseStartTime: number | null  // Unix ms; drives timer sync across clients
guessTimerDuration: number         // seconds; 0 = unlimited; 2D views apply ×2 internally
guessPhaseStartTime: number | null // reset for each queue entry on advanceGuess
selectedCategories: string[]       // empty = all 8 categories (Classic + 2D only)
hostId: string
colorPaletteName: "base" | "deuteranomaly"  // Colorform only

players:       LiveMap<id, { name, isHost, color }>
playerDials:   LiveMap<id, DialConfig[]>      // Classic
player2DDials: LiveMap<id, Dial2DConfig[]>    // 2D
playerClues:   LiveMap<id, string[]>
playerColors:  LiveMap<id, number[]>          // Colorform — palette index per round
colorOptions:  LiveMap<id, number[][]>        // Colorform — 3 swatch options per round
guessingQueue: LiveList<{ dialIndex, authorId }>
currentGuessIndex: number
guessResults:  LiveMap<"${guesserId}-${dialIndex}-${authorId}",
                       { position, posY?, points, doubleDown? }>
```

`clearGameData(storage)` resets phase, both phase start times, queue, dials, clues, results but keeps players, gameMode, totalRounds, timer durations, categories, and hostId.

## Timer System

Both clue and guess phases have configurable timers (30s / 1 min / 90s / 2 min / No limit, default 90s). Set independently in WaitingRoom. 2D mode displays doubled labels in the dropdown (e.g. "3 min" for the 90s base) and applies the multiplier internally in the views.

- **Clue timer:** budgeted across all rounds (`clueTimerDuration × totalRounds`). Timestamp-based so it survives page refresh. On expiry, each client auto-saves partial clues and sets presence `cluesComplete: true`; host advances after a 5s fallback.
- **Guess timer:** per queue entry. `guessPhaseStartTime` is reset by `advanceGuess` on each new entry. On expiry, each guesser auto-locks in with their current position.

## Scoring

| Mode | Function | Points |
|------|----------|--------|
| Classic | `calcPoints(pos, target)` | 4 / 3 / 2 / 0 (zone widths: ±2 / ±6 / ±10) |
| 2D | `calcPoints2D(x, y, tx, ty)` | 4 / 3 / 2 / 0 (Euclidean radii: 3 / 8 / 12) |
| Colorform | `calcColorPoints(guess, target)` | 3 / 2 / 1 / 0 (Chebyshev: 0 / 1 / 2 cells) |

Double Down: `applyDoubleDown(raw, dd)` — doubles non-zero score, −2 on miss.

## Color Palette (`src/lib/colorPalette.ts`)

32×16 grid mapped as a 2D color wheel using `atan2` angle → hue and Euclidean distance from center → saturation/lightness.

| Direction | Base | Deuteranomaly |
|-----------|------|---------------|
| Top | Red (0°) | Cyan (180°) |
| Right | Blue (240°) | Yellow (60°) |
| Bottom | Green (120°) | Magenta (300°) |
| Left | Yellow (60°) | Blue (240°) |

Deuteranomaly avoids the red-green axis entirely (180° rotation of base).

## Shared Component Architecture

**`ResultsView`** (`src/components/game/ResultsView.tsx`) — used by all three modes. Owns score computation, leaderboard, collapse state, By Round / By Player toggle, Play Again / Leave buttons. Two render props:
- `renderByRoundEntry(ctx)` — inner content per (dialIndex, authorId) card in By Round
- `renderByPlayerGuess?(ctx)` — inner content per guess in By Player; omit to hide the tab (2D has no By Player view)

**`MultiGuessBase`** (`src/components/game/MultiGuessBase.tsx`) — Classic and 2D share this. Accepts `mode: { kind: "classic", playerDials } | { kind: "2d", player2DDials }`. Owns timer countdown, auto-lock-in on expiry, 12s auto-advance, guesser status list, Double Down toggle, Lock In / Next buttons. Switches on `mode.kind` for scoring function, dial lookup, presence fields, and rendered dial component.

## Environment Variables

```
VITE_LIVEBLOCKS_PUBLIC_KEY=pk_...   # browser-side
LIVEBLOCKS_SECRET_KEY=sk_...        # server-side only (room deletion API)
```

`DELETE /api/delete-room?roomId=` — Vite middleware proxies to Liveblocks REST API without leaking the secret key. Called when the last player leaves a room.
