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
Each player sees a 2D plane with two spectrum axes. Write one clue covering both axes, others tap a point. Scoring uses Euclidean distance: bullseye (r≤3) 4 pts · mid (r≤8) 3 pts · outer (r≤12) 2 pts. All timers are doubled vs Classic.

### Colorform
Players receive 3 random color swatches, pick one, write a clue. Others find that color on a 32×16 color wheel grid. Scoring uses Chebyshev distance: exact 3 pts · 1 cell away 2 pts · 2 cells away 1 pt.

### Deception
Social deduction based on Deception: Murder in Hong Kong. One player is secretly the **Forensic Scientist** (knows the murderer), one is the **Murderer** (picks their weapon + evidence from dealt cards), optionally one is an **Accomplice** (knows the murderer, helps them escape). Everyone gets 4 means cards + 4 evidence cards. The FS places markers on 6 scene tiles to guide investigators — without speaking. Each round, investigators (and the murderer as a bluff) can spend their one accusation attempt. Wrong = lose your vote but stay active. Correct = investigators win immediately. If all eligible accusers vote wrong, the murderer wins automatically. FS can swap one non-fixed scene tile per round (with undo). Fixed tiles: **Location** and **Cause of Death**. All accusations are logged and visible to everyone.

### Double Down
Available in Classic and 2D. Guesser bets before locking in — scores double if they land in any zone, loses 2 pts on a miss.

## Project Structure

```
src/
├── App.tsx                    # RoomProvider, RoomOrchestrator, RoomNavigator, InRoomViews
├── types/
│   ├── game.ts                # AppView, zone constants, GameState, SpectrumCard
│   └── deception.ts           # DeceptionRole, DeceptionPhase, MurdererSolution, etc.
├── data/
│   ├── spectrumCards.ts       # 93 spectrum card pairs across 8 categories
│   └── deceptionCards.ts      # scene tiles, means/evidence cards, location sets
├── context/
│   ├── GameContext.tsx         # view router + totalRounds state
│   ├── MultiplayerContext.tsx  # session-persisted local state (name, roomCode, playerId, isHost)
│   └── MuteContext.tsx         # global mute toggle; persists to localStorage
├── hooks/
│   ├── useDialDrag.ts          # pointer-capture drag for spectrum needle
│   ├── useLeaveRoom.ts         # shared leave logic
│   └── useCountdown.ts         # timestamp-based countdown hook (returns timeLeft | null)
├── lib/
│   ├── liveblocks.ts           # Storage/Presence types, clearGameData(), typed hooks
│   ├── crypto.ts               # AES-GCM encrypt/decrypt via Web Crypto (PBKDF2 key derivation)
│   ├── deceptionDealer.ts      # assignRoles, dealCards, drawSceneTiles (returns tiles + pool)
│   ├── colorPalette.ts         # 512-color wheel, chebyshevDistance, calcColorPoints
│   ├── scoring.ts              # calcPoints, calcPoints2D, applyDoubleDown
│   └── utils.ts                # cn() helper
├── components/
│   ├── GlobalControls.tsx      # fixed top-right pill: mute + theme toggle (all screens)
│   └── game/
│       ├── SpectrumDial.tsx        # 1D dial; extraNeedles prop for multiplayer reveal
│       ├── SpectrumPlane.tsx       # Canvas 2D plane; extraPoints prop
│       ├── ColorGrid.tsx           # 32×16 swatch grid; Chebyshev zone borders
│       ├── TimerBar.tsx            # Shared timer bar (green→amber→red)
│       ├── PlayerStatusList.tsx    # Shared player status list with DoneNode/WaitingNode
│       ├── MultiGuessBase.tsx      # Shared Classic+2D guess logic
│       ├── ResultsView.tsx         # Shared results layout for Classic/2D/Colorform
│       ├── DinoGame.tsx            # Canvas runner mini-game; collapsible; shown while waiting
│       └── EmojiReactions.tsx      # Hamster reactions; floating animation
└── views/
    ├── multiplayer/
    │   ├── WaitingRoomView.tsx         # Lobby, mode selector, all settings, player list, kick
    │   ├── MultiClueView.tsx / MultiGuessView.tsx / MultiResultsView.tsx
    │   ├── Multi2DClueView.tsx / Multi2DGuessView.tsx / Multi2DResultsView.tsx
    │   └── ColorformClueView.tsx / ColorformGuessView.tsx / ColorformResultsView.tsx
    └── deception/
        ├── RoleRevealView.tsx          # Decrypt + display role; murderer picks solution cards
        ├── FsPlacementView.tsx         # FS places markers; tile swap with undo (1 per round)
        └── DiscussionView.tsx          # Cards display; accusation form; inline results screen
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

// Classic / 2D / Colorform
playerDials, player2DDials, playerClues, playerColors, colorOptions,
guessingQueue, currentGuessIndex, guessResults

// Deception
deceptionPhase: "role-reveal" | "fs-placement" | "discussion" | "results" | null
deceptionDealtCards:              LiveMap<id, { meansCards, evidenceCards }>
deceptionSceneTiles:              Array<{ category, options }> | null   // 6 tiles
deceptionTilePool:                Array<{ category, options }>           // swappable reserve
deceptionMarkers:                 LiveMap<category, optionIndex>
deceptionEncryptedRoles:          LiveMap<id, string>
deceptionEncryptedRoleMapForHost: string | null
deceptionEncryptedSolutionForHost: string | null
deceptionEncryptedSolutionForFs:  string | null
deceptionFsPlayerId:              string | null
deceptionRevealedSolution:        { murdererPlayerId, meansCard, evidenceCard } | null
deceptionRoleAcknowledged:        LiveMap<id, boolean>
deceptionAccusations:             LiveMap<id, { accusedPlayerId, meansCard, evidenceCard }>
deceptionEliminatedPlayers:       LiveMap<id, boolean>
deceptionCurrentRound:            number
deceptionFsTimerDuration:         number;  deceptionFsTimerStart: number | null
deceptionDiscussionTimerDuration: number;  deceptionDiscussionTimerStart: number | null
deceptionFsRerolledTiles:         number[]
deceptionEnableAccomplice:        boolean
```

## Privacy Model (Deception)

Role assignments and the murderer's solution are AES-GCM encrypted with per-player keys derived via `PBKDF2(roomCode + playerId)`. Only the intended recipient can decrypt their blob. The host gets an additional encrypted copy of the full role map and the solution. Party-game-level privacy — prevents accidental spoilers, not adversarial cheating.

## Environment Variables

```
VITE_LIVEBLOCKS_PUBLIC_KEY=pk_...   # browser-side
LIVEBLOCKS_SECRET_KEY=sk_...        # server-side only (room deletion API)
```

`DELETE /api/delete-room?roomId=` — Vite middleware proxies to Liveblocks REST without leaking the secret key.
