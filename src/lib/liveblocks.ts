import { createClient, LiveList, LiveMap } from "@liveblocks/client";
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
};

export type GameMode = "classic" | "3d";

export type Storage = {
  phase: RoomPhase;
  gameMode: GameMode;
  totalRounds: number;
  hostId: string;
  players: LiveMap<string, PlayerInfo>;
  playerDials: LiveMap<string, DialConfig[]>;
  playerClues: LiveMap<string, string[]>;
  guessingQueue: LiveList<GuessEntry>;
  currentGuessIndex: number;
  guessResults: LiveMap<string, GuessResult>;
};

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
