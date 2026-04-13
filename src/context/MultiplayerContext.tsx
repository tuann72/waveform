import { createContext, useContext, useState, type ReactNode } from "react";

function generateRoomCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// Generated once per page load — each tab gets a unique ID regardless of how it was opened
const PLAYER_ID = Math.random().toString(36).slice(2, 12);

export interface MultiplayerState {
  playerName: string;
  roomCode: string;
  playerId: string;
  isHost: boolean;
}

interface MultiplayerContextValue {
  mp: MultiplayerState;
  setPlayerName: (name: string) => void;
  hostRoom: () => void;
  joinRoom: (code: string) => void;
  clearRoom: () => void;
}

const MultiplayerContext = createContext<MultiplayerContextValue | null>(null);

export function MultiplayerProvider({ children }: { children: ReactNode }) {
  const [mp, setMp] = useState<MultiplayerState>({
    playerName: "",
    roomCode: "",
    playerId: PLAYER_ID,
    isHost: false,
  });

  return (
    <MultiplayerContext.Provider
      value={{
        mp,
        setPlayerName: (playerName) => setMp((s) => ({ ...s, playerName })),
        hostRoom: () => setMp((s) => ({ ...s, roomCode: generateRoomCode(), isHost: true })),
        joinRoom: (code) => setMp((s) => ({ ...s, roomCode: code.toUpperCase().slice(0, 6), isHost: false })),
        clearRoom: () => setMp((s) => ({ ...s, roomCode: "", isHost: false })),
      }}
    >
      {children}
    </MultiplayerContext.Provider>
  );
}

export function useMultiplayer() {
  const ctx = useContext(MultiplayerContext);
  if (!ctx) throw new Error("useMultiplayer must be used within MultiplayerProvider");
  return ctx;
}
