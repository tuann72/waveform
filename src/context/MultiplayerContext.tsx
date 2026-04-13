import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export const SESSION_KEY = "waveform_session";

interface SessionData {
  playerId: string;
  playerName: string;
  roomCode: string;
  isHost: boolean;
}

function loadSession(): SessionData {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SessionData>;
      if (parsed.playerId) {
        return {
          playerId: parsed.playerId,
          playerName: parsed.playerName ?? "",
          roomCode: parsed.roomCode ?? "",
          isHost: parsed.isHost ?? false,
        };
      }
    }
  } catch {}
  return {
    playerId: Math.random().toString(36).slice(2, 12),
    playerName: "",
    roomCode: "",
    isHost: false,
  };
}

function generateRoomCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

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
  setIsHost: (v: boolean) => void;
}

const MultiplayerContext = createContext<MultiplayerContextValue | null>(null);

export function MultiplayerProvider({ children }: { children: ReactNode }) {
  const [mp, setMp] = useState<MultiplayerState>(loadSession);

  // Keep sessionStorage in sync whenever state changes
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        playerId: mp.playerId,
        playerName: mp.playerName,
        roomCode: mp.roomCode,
        isHost: mp.isHost,
      }));
    } catch {}
  }, [mp]);

  return (
    <MultiplayerContext.Provider
      value={{
        mp,
        setPlayerName: (playerName) => setMp((s) => ({ ...s, playerName })),
        hostRoom: () => setMp((s) => ({ ...s, roomCode: generateRoomCode(), isHost: true })),
        joinRoom: (code) => setMp((s) => ({ ...s, roomCode: code.toUpperCase().slice(0, 6), isHost: false })),
        clearRoom: () => {
          try { sessionStorage.removeItem(SESSION_KEY); } catch {}
          setMp((s) => ({ ...s, roomCode: "", isHost: false }));
        },
        setIsHost: (isHost) => setMp((s) => ({ ...s, isHost })),
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
