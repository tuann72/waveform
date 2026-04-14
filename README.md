# Waveform

A real-time multiplayer color guessing game. Players write one-word clues for colors and others try to find the exact color on a 2D color wheel grid.

## Setup

```bash
bun install
cp .env.example .env.local  # add VITE_LIVEBLOCKS_PUBLIC_KEY and LIVEBLOCKS_SECRET_KEY
bun dev
```

## Game Modes

### Classic
Players write clues for positions on a spectrum dial (e.g. "Hot ↔ Cold"). Others drag a needle to guess the target position.

### Colorform
Players receive 3 random color swatches, pick one, and write a one-word clue. Others find that color on a 32×16 color wheel grid. Scoring uses Chebyshev distance: exact = 3 pts, 1 cell away = 2 pts, 2 cells away = 1 pt.

## Project Structure

```
src/
├── App.tsx                          # RoomProvider, RoomOrchestrator (host promotion),
│                                    # RoomNavigator (reconnect redirect), view routing
├── index.css                        # gradient-flow keyframe animation
│
├── types/game.ts                    # AppView, zone constants, GameState
├── data/spectrumCards.ts            # 93 spectrum card pairs across 8 categories
│
├── context/
│   ├── GameContext.tsx              # view router + totalRounds state
│   └── MultiplayerContext.tsx       # session-persisted local state (name, roomCode,
│                                    # playerId, isHost); survives page refresh
│
├── hooks/
│   ├── useDialDrag.ts               # pointer-capture drag for spectrum needle
│   └── useLeaveRoom.ts              # shared leave logic used by WaitingRoom + Results
│
├── lib/
│   ├── liveblocks.ts                # Liveblocks client, Storage/Presence types,
│   │                                # clearGameData() helper, typed hooks
│   ├── colorPalette.ts              # 512-color 2D wheel (32×16), two palettes
│   │                                # (base + deuteranomaly), chebyshevDistance,
│   │                                # calcColorPoints, pickColorOptions
│   ├── scoring.ts                   # calcPoints() for Classic mode dial scoring
│   └── utils.ts                     # shadcn cn() helper
│
├── components/
│   ├── theme-provider.tsx           # ThemeProvider component
│   ├── theme-context.ts             # ThemeProviderContext + useTheme hook
│   ├── LavaLampBackground.tsx       # Three.js wave mesh background (StartView)
│   │                                # — PlaneGeometry with FBM vertex displacement,
│   │                                # height-based coloring, light/dark variants
│   ├── ui/                          # shadcn components (badge, button, card,
│   │                                # input, label, select, separator)
│   │   └── ellipsis.tsx             # animated "..." cycling at 500ms
│   └── game/
│       ├── SpectrumDial.tsx         # draggable spectrum needle; extraNeedles for
│       │                            # multiplayer reveal; zone overlays when revealed
│       ├── ColorGrid.tsx            # 32×16 color swatch grid; Chebyshev zone borders
│       │                            # drawn as per-edge spans forming square outlines
│       └── EmojiReactions.tsx       # hamster reaction picker; floating animations;
│                                    # player-colored borders on floaters
│
└── views/
    ├── StartView.tsx                # animated wave background, theme toggle
    └── multiplayer/
        ├── JoinOrHostView.tsx       # name input, host/join, ?room= prefill
        ├── WaitingRoomView.tsx      # lobby: room code, mode/rounds/timer/categories,
        │                            # color palette selector (Base + Deuteranomaly),
        │                            # player list, kick, staggered motion animations
        ├── MultiClueView.tsx        # Classic clue entry with countdown timer bar
        ├── MultiGuessView.tsx       # Classic simultaneous guessing, live needles,
        │                            # 12s auto-advance after all locked in
        ├── MultiResultsView.tsx     # Classic leaderboard + per-dial breakdown
        ├── ColorformClueView.tsx    # Colorform: pick from 3 swatches, write clue
        ├── ColorformGuessView.tsx   # Colorform: tap color on grid, zone outlines
        │                            # reveal after all guessers lock in
        └── ColorformResultsView.tsx # Colorform: leaderboard + collapsible round/
                                     # player breakdown cards
```

## Liveblocks Storage Schema

```ts
phase: "lobby" | "clue" | "guessing" | "results"
gameMode: "classic" | "colorform"         // "3d" placeholder
totalRounds: number
clueTimerDuration: number                  // seconds; 0 = unlimited
cluePhaseStartTime: number | null          // Unix ms; drives timer sync across clients
selectedCategories: string[]               // empty = all 8 categories
hostId: string
colorPaletteName: "base" | "deuteranomaly"

players:      LiveMap<id, { name, isHost, color }>
playerDials:  LiveMap<id, DialConfig[]>    // Classic
playerClues:  LiveMap<id, string[]>
playerColors: LiveMap<id, number[]>        // Colorform — palette index per round
colorOptions: LiveMap<id, number[][]>      // Colorform — 3 options per round
guessingQueue: LiveList<{ dialIndex, authorId }>
currentGuessIndex: number
guessResults: LiveMap<"${guesserId}-${dialIndex}-${authorId}", { position, points }>
```

## Color Palette (`src/lib/colorPalette.ts`)

32×16 grid mapped as a 2D color wheel using `atan2` angle → hue and Euclidean distance from center → saturation/lightness. Distance is a linear `d = dist` ramp (most pastel at center, boldest at edges).

| Direction | Base | Deuteranomaly |
|-----------|------|---------------|
| Top       | Red (0°) | Cyan (180°) |
| Right     | Blue (240°) | Yellow (60°) |
| Bottom    | Green (120°) | Magenta (300°) |
| Left      | Yellow (60°) | Blue (240°) |

Deuteranomaly avoids the red-green axis entirely (180° rotation of base).

## Environment Variables

```
VITE_LIVEBLOCKS_PUBLIC_KEY=pk_...   # browser-side
LIVEBLOCKS_SECRET_KEY=sk_...        # server-side only (room deletion API)
```

The Vite dev server exposes `DELETE /api/delete-room?roomId=` — proxies to the Liveblocks REST API without leaking the secret key to the client. Used when the last player leaves a room.
