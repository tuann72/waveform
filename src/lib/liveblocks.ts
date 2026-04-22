import { createClient, LiveList, LiveMap, LiveObject } from "@liveblocks/client";
import { createRoomContext } from "@liveblocks/react";

export type RoomPhase = "lobby" | "clue" | "guessing" | "results";

export type DialConfig = {
  id: string;
  left: string;
  right: string;
  targetPosition: number;
};

export type PlayerInfo = {
  name: string;
  isHost: boolean;
  color: string;
};

export type GuessEntry = {
  dialIndex: number;
  authorId: string;
  // No guesserId — all non-authors guess simultaneously
};

export type GuessResult = {
  position: number;   // x for 2D, single position for classic/colorform
  posY?: number;      // y for 2D only
  points: number;     // effective points (doubleDown already applied)
  doubleDown?: boolean;
};

export type Presence = {
  playerName: string;
  cluesComplete: boolean;
  playerId: string | null;
  dialPosition: number | null;   // classic: needle pos; 2D: x pos
  dialPositionY: number | null;  // 2D only: y pos
  reaction: { emoji: string; id: string } | null;
};

export type GameMode = "classic" | "3d" | "colorform" | "2d" | "deception";
export type DeceptionPhase = "role-reveal" | "fs-placement" | "discussion" | "results";

export type Dial2DConfig = {
  id: string;
  left: string;    // horizontal axis left
  right: string;   // horizontal axis right
  bottom: string;  // vertical axis bottom
  top: string;     // vertical axis top
  targetX: number; // 0–100
  targetY: number; // 0–100
};

export type Storage = {
  phase: RoomPhase;
  gameMode: GameMode;
  totalRounds: number;
  clueTimerDuration: number;      // seconds; 0 = no limit
  cluePhaseStartTime: number | null;
  guessTimerDuration: number;     // seconds; 0 = no limit; same options as clue timer
  guessPhaseStartTime: number | null;  // reset for each queue entry
  selectedCategories: string[];   // empty = all categories
  hostId: string;
  roomPassword: string | null;
  players: LiveMap<string, PlayerInfo>;
  playerDials: LiveMap<string, DialConfig[]>;
  playerClues: LiveMap<string, string[]>;
  guessingQueue: LiveList<GuessEntry>;
  currentGuessIndex: number;
  guessResults: LiveMap<string, GuessResult>;
  // Colorform-specific fields
  colorPaletteName: "base" | "deuteranomaly";
  playerColors: LiveMap<string, number[]>;    // playerId → chosen palette index per round
  colorOptions: LiveMap<string, number[][]>;  // playerId → [[opt,opt,opt], ...] per round
  // 2D-specific fields
  player2DDials: LiveMap<string, Dial2DConfig[]>;
  // Deception-specific fields
  deceptionPhase: DeceptionPhase | null;
  deceptionDealtCards: LiveMap<string, { meansCards: string[]; evidenceCards: string[] }>;
  deceptionSceneTiles: Array<{ category: string; options: string[] }> | null;
  deceptionMarkers: LiveMap<string, number>;            // category → optionIndex (0–5)
  deceptionEncryptedRoles: LiveMap<string, string>;     // playerId → encrypted DeceptionRoleBlob
  deceptionEncryptedRoleMapForHost: string | null;      // encrypted DeceptionRoleMapBlob for host
  deceptionEncryptedSolutionForHost: string | null;     // encrypted MurdererSolution, set by murderer
  deceptionEncryptedSolutionForFs: string | null;       // same solution, encrypted for FS to read
  deceptionFsPlayerId: string | null;                   // public: who the forensic scientist is
  deceptionRevealedSolution: { murdererPlayerId: string; meansCard: string; evidenceCard: string } | null;
  deceptionRoleAcknowledged: LiveMap<string, boolean>;
  deceptionAccusations: LiveMap<string, { accusedPlayerId: string; meansCard: string; evidenceCard: string }>;
  deceptionCurrentRound: number;
  deceptionFsTimerDuration: number;           // seconds; 0 = no limit
  deceptionFsTimerStart: number | null;
  deceptionDiscussionTimerDuration: number;   // seconds; 0 = no limit
  deceptionDiscussionTimerStart: number | null;
  deceptionEnableAccomplice: boolean;
  deceptionTilePool: Array<{ category: string; options: string[] }>;
  deceptionFsRerolledTiles: number[];  // indices of non-fixed tiles already rerolled
  deceptionEliminatedPlayers: LiveMap<string, boolean>;  // investigators who accused wrongly
};

// Clears all per-game data from storage. Does NOT touch players, hostId,
// gameMode, totalRounds, timers, selectedCategories, colorPaletteName,
// or deception lobby settings — those persist for Play Again.
// Call this inside any mutation that needs to reset between games.
export function clearGameData(storage: LiveObject<Storage>) {
  storage.set("phase", "lobby");
  storage.set("currentGuessIndex", 0);
  storage.set("cluePhaseStartTime", null);
  storage.set("guessPhaseStartTime", null);
  const playerDials = storage.get("playerDials");
  for (const k of playerDials.keys()) playerDials.delete(k);
  const playerClues = storage.get("playerClues");
  for (const k of playerClues.keys()) playerClues.delete(k);
  const guessResults = storage.get("guessResults");
  for (const k of guessResults.keys()) guessResults.delete(k);
  const guessingQueue = storage.get("guessingQueue");
  while (guessingQueue.length > 0) guessingQueue.delete(0);
  const playerColors = storage.get("playerColors");
  for (const k of playerColors.keys()) playerColors.delete(k);
  const colorOptions = storage.get("colorOptions");
  for (const k of colorOptions.keys()) colorOptions.delete(k);
  const player2DDials = storage.get("player2DDials");
  for (const k of player2DDials.keys()) player2DDials.delete(k);
  // Deception
  storage.set("deceptionPhase", null);
  storage.set("deceptionSceneTiles", null);
  storage.set("deceptionEncryptedRoleMapForHost", null);
  storage.set("deceptionEncryptedSolutionForHost", null);
  storage.set("deceptionEncryptedSolutionForFs", null);
  storage.set("deceptionFsPlayerId", null);
  storage.set("deceptionRevealedSolution", null);
  storage.set("deceptionCurrentRound", 1);
  storage.set("deceptionFsTimerStart", null);
  storage.set("deceptionDiscussionTimerStart", null);
  const deceptionDealtCards = storage.get("deceptionDealtCards");
  for (const k of deceptionDealtCards.keys()) deceptionDealtCards.delete(k);
  const deceptionMarkers = storage.get("deceptionMarkers");
  for (const k of deceptionMarkers.keys()) deceptionMarkers.delete(k);
  const deceptionEncryptedRoles = storage.get("deceptionEncryptedRoles");
  for (const k of deceptionEncryptedRoles.keys()) deceptionEncryptedRoles.delete(k);
  const deceptionRoleAcknowledged = storage.get("deceptionRoleAcknowledged");
  for (const k of deceptionRoleAcknowledged.keys()) deceptionRoleAcknowledged.delete(k);
  const deceptionAccusations = storage.get("deceptionAccusations");
  for (const k of deceptionAccusations.keys()) deceptionAccusations.delete(k);
  storage.set("deceptionTilePool", []);
  storage.set("deceptionFsRerolledTiles", []);
  const deceptionEliminatedPlayers = storage.get("deceptionEliminatedPlayers");
  for (const k of deceptionEliminatedPlayers.keys()) deceptionEliminatedPlayers.delete(k);
}

const client = createClient({
  publicApiKey: import.meta.env.VITE_LIVEBLOCKS_PUBLIC_KEY,
  throttle: 16,
});

export const {
  RoomProvider,
  useMyPresence,
  useUpdateMyPresence,
  useStorage,
  useMutation,
  useOthers,
  useSelf,
} = createRoomContext<Presence, Storage>(client);
