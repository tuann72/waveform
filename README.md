# Waveform

Real-time multiplayer party game with four modes: Classic spectrum dials, 2D spectrum planes, Colorform color-matching, and Deception social deduction.

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
Each player sees a 2D plane with two spectrum axes. Write one clue covering both axes, others tap a point. Scoring uses Euclidean distance: bullseye (r≤3) 4 pts · mid (r≤8) 3 pts · outer (r≤12) 2 pts. All timers are doubled vs Classic. During the clue phase, each player can independently reroll the X axis or Y axis (separate budgets); rerolling an axis replaces only its label cards — the target dot stays fixed.

### Colorform
Players receive 3 random color swatches, pick one, write a clue. Others find that color on a 32×16 color wheel grid. Scoring uses Chebyshev distance: exact 3 pts · 1 cell away 2 pts · 2 cells away 1 pt.

### Deception
Social deduction. One player is secretly the **Forensic Scientist** (knows the murderer), one is the **Murderer** (picks their weapon + evidence from their dealt cards), optionally one is an **Accomplice** (knows the murderer). Everyone gets 4 means cards + 4 evidence cards dealt face-up. The FS places markers on 6 scene tiles pointing toward the truth — without speaking. Each round investigators (and the murderer, as a bluff) can spend their one accusation attempt — wrong = lose your vote but remain in the game, correct = investigators win immediately. All accusations are logged and visible to everyone. FS can swap one non-permanent tile per round. Murderer wins if all rounds pass without a correct accusation.

### Double Down
Available in Classic and 2D. Guesser bets before locking in — scores double if they land in any zone, loses 2 pts if they miss.

## Project Structure

```
src/
├── App.tsx                    # RoomProvider, RoomOrchestrator, RoomNavigator, InRoomViews
├── types/
│   ├── game.ts                # AppView, zone constants, GameState, SpectrumCard
│   └── deception.ts           # DeceptionRole, DeceptionPhase, MurdererSolution, etc.
├── data/
│   ├── spectrumCards.ts       # 93 spectrum card pairs across 8 categories
│   └── deceptionCards.ts      # 104 means cards, 215 evidence cards, 30 scene tiles, 6 location sets
├── context/
│   ├── GameContext.tsx         # view router + totalRounds state
│   └── MultiplayerContext.tsx  # session-persisted local state (name, roomCode, playerId, isHost)
├── hooks/
│   ├── useDialDrag.ts          # pointer-capture drag for spectrum needle
│   ├── useLeaveRoom.ts         # shared leave logic (WaitingRoom + Results)
│   └── useCountdown.ts         # timestamp-based countdown hook (returns timeLeft | null)
├── lib/
│   ├── liveblocks.ts           # Storage/Presence types, clearGameData(), typed hooks
│   ├── crypto.ts               # AES-GCM encrypt/decrypt via Web Crypto (PBKDF2 key derivation)
│   ├── deceptionDealer.ts      # assignRoles, dealCards, drawSceneTiles (returns tiles + pool)
│   ├── colorPalette.ts         # 512-color wheel, chebyshevDistance, calcColorPoints
│   ├── scoring.ts              # calcPoints, calcPoints2D, applyDoubleDown
│   └── utils.ts                # cn() helper
├── components/game/
│   ├── SpectrumDial.tsx        # 1D dial; extraNeedles prop for multiplayer reveal
│   ├── SpectrumPlane.tsx       # Canvas 2D plane; extraPoints prop
│   ├── ColorGrid.tsx           # 32×16 swatch grid; Chebyshev zone borders
│   ├── TimerBar.tsx            # Shared timer bar (green→amber→red); accepts timeLeft + duration
│   ├── PlayerStatusList.tsx    # Shared player status list with DoneNode/WaitingNode helpers
│   ├── MultiGuessBase.tsx      # Shared Classic+2D guess logic (mode discriminated union)
│   ├── ResultsView.tsx         # Shared results layout for Classic/2D/Colorform (render props)
│   └── EmojiReactions.tsx      # Hamster reactions; floating animation
└── views/
    ├── multiplayer/
    │   ├── WaitingRoomView.tsx         # Lobby, mode selector, all settings, player list
    │   ├── MultiClueView.tsx / MultiGuessView.tsx / MultiResultsView.tsx
    │   ├── Multi2DClueView.tsx / Multi2DGuessView.tsx / Multi2DResultsView.tsx
    │   └── ColorformClueView.tsx / ColorformGuessView.tsx / ColorformResultsView.tsx
    └── deception/
        ├── RoleRevealView.tsx          # Decrypt + display role; murderer picks solution cards
        ├── FsPlacementView.tsx         # FS places markers; tile swap (1 per round)
        ├── DiscussionView.tsx          # Cards display; accusation form (any round, one shot)
        └── DeceptionResultsView.tsx    # Reveal truth, show accusations, Play Again
```

## Liveblocks Storage Schema

```ts
// Shared
phase: "lobby" | "clue" | "guessing" | "results"
gameMode: "classic" | "2d" | "colorform" | "deception"
totalRounds: number;  hostId: string;  roomPassword: string | null
clueTimerDuration: number;  cluePhaseStartTime: number | null
guessTimerDuration: number;  guessPhaseStartTime: number | null
selectedCategories: string[];  colorPaletteName: "base" | "deuteranomaly"
players: LiveMap<id, { name, isHost, color }>

// Classic / 2D / Colorform (unchanged — see liveblocks.ts)
playerDials, player2DDials, playerClues, playerColors, colorOptions,
guessingQueue, currentGuessIndex, guessResults

// Deception
deceptionPhase: "role-reveal" | "fs-placement" | "discussion" | "results" | null
deceptionDealtCards:           LiveMap<id, { meansCards, evidenceCards }>
deceptionSceneTiles:           Array<{ category, options }> | null   // 6 tiles
deceptionTilePool:             Array<{ category, options }>           // remaining swappable tiles
deceptionMarkers:              LiveMap<category, optionIndex>
deceptionEncryptedRoles:       LiveMap<id, string>   // AES-GCM blob per player
deceptionEncryptedRoleMapForHost: string | null       // AES-GCM blob for host
deceptionEncryptedSolutionForHost: string | null      // AES-GCM blob, written by murderer
deceptionRevealedSolution:     { murdererPlayerId, meansCard, evidenceCard } | null
deceptionRoleAcknowledged:     LiveMap<id, boolean>
deceptionAccusations:              LiveMap<id, { accusedPlayerId, meansCard, evidenceCard }>
deceptionEliminatedPlayers:        LiveMap<id, boolean>   // voted wrong (lose vote, not spectator)
deceptionCurrentRound:             number
deceptionFsTimerDuration:          number   // seconds; 0 = no limit
deceptionFsTimerStart:             number | null
deceptionDiscussionTimerDuration:  number
deceptionDiscussionTimerStart:     number | null
deceptionFsRerolledTiles:          number[]  // indices of non-fixed tiles already swapped this round
deceptionEnableAccomplice:         boolean
```

## Deception Privacy Model

Liveblocks Storage is shared with all clients. Role assignments and the murderer's solution are encrypted with AES-GCM using a per-player key derived from `roomCode + playerId` via PBKDF2. Only the intended recipient can decrypt their own blob. The host additionally gets an encrypted copy of the full role map and the murderer's solution (encrypted with `roomCode + hostId`). At results time, the host uses their copy to reveal the truth. Party-game-level privacy — prevents accidental spoilers, not adversarial cheating.

## Shared Components

**`TimerBar`** — accepts `timeLeft: number | null` + `duration: number`, renders green→amber→red bar. Pair with `useCountdown(startTime, duration)` hook which manages the interval internally.

**`PlayerStatusList`** — accepts `entries: { id, name, color, rightNode }[]`. Use `DoneNode` / `WaitingNode` for common right-side states.

**`ResultsView`** — render props `renderByRoundEntry(ctx)` and optional `renderByPlayerGuess?(ctx)` (omit to hide By Player tab).

**`MultiGuessBase`** — `mode: { kind:"classic", playerDials } | { kind:"2d", player2DDials }`. Owns timer, auto-lock, auto-advance, Double Down.

## Timer System

Clue and guess timers configurable independently (30s / 1 min / 90s / 2 min / No limit). 2D displays doubled labels, applies ×2 internally. Deception FS placement timer is separate (`deceptionFsTimerDuration`). All timers are timestamp-based and survive page refresh.

## Environment Variables

```
VITE_LIVEBLOCKS_PUBLIC_KEY=pk_...   # browser-side
LIVEBLOCKS_SECRET_KEY=sk_...        # server-side only (room deletion API)
```

`DELETE /api/delete-room?roomId=` — Vite middleware proxies to Liveblocks REST without leaking the secret key.
