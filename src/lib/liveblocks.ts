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
};

export type GuessEntry = {
  dialIndex: number;
  authorId: string;
  guesserId: string;
};

export type GuessResult = {
  position: number;
  points: number;
};

export type Presence = {
  playerName: string;
  cluesComplete: boolean;
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
