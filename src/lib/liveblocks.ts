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
  position: number;
  points: number;
};

export type Presence = {
  playerName: string;
  cluesComplete: boolean;
  playerId: string | null;
  dialPosition: number | null;
  reaction: { emoji: string; id: string } | null;
};

export type GameMode = "classic" | "3d";

export type Storage = {
  phase: RoomPhase;
  gameMode: GameMode;
  totalRounds: number;
  clueTimerDuration: number;      // seconds; 0 = no limit
  cluePhaseStartTime: number | null;
  selectedCategories: string[];   // empty = all categories
  hostId: string;
  players: LiveMap<string, PlayerInfo>;
  playerDials: LiveMap<string, DialConfig[]>;
  playerClues: LiveMap<string, string[]>;
  guessingQueue: LiveList<GuessEntry>;
  currentGuessIndex: number;
  guessResults: LiveMap<string, GuessResult>;
};

// Clears all per-game data from storage. Does NOT touch players, gameMode,
// totalRounds, clueTimerDuration, selectedCategories, or hostId.
// Call this inside any mutation that needs to reset between games.
export function clearGameData(storage: LiveObject<Storage>) {
  storage.set("phase", "lobby");
  storage.set("currentGuessIndex", 0);
  const playerDials = storage.get("playerDials");
  for (const k of playerDials.keys()) playerDials.delete(k);
  const playerClues = storage.get("playerClues");
  for (const k of playerClues.keys()) playerClues.delete(k);
  const guessResults = storage.get("guessResults");
  for (const k of guessResults.keys()) guessResults.delete(k);
  const guessingQueue = storage.get("guessingQueue");
  while (guessingQueue.length > 0) guessingQueue.delete(0);
}

const client = createClient({
  publicApiKey: import.meta.env.VITE_LIVEBLOCKS_PUBLIC_KEY,
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
