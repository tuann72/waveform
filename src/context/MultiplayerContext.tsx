import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export const SESSION_KEY = "waveform_session";

// Liveblocks room IDs — 5 fixed slots, never deleted
const ROOM_SLOTS = [1, 2, 3, 4, 5] as const;
export function getRoomId(roomCode: string): string {
  return `waveform-room-${roomCode[0]}`;
}

// Shuffles an array in place using Fisher-Yates
function shuffled(arr: number[]): number[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generatePassword(): string {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

interface SessionData {
  playerId: string;
  playerName: string;
  roomCode: string;
  isHost: boolean;
  pendingSlots: number[];
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
          pendingSlots: Array.isArray(parsed.pendingSlots) ? parsed.pendingSlots : [],
        };
      }
    }
  } catch {}
  return {
    playerId: Math.random().toString(36).slice(2, 12),
    playerName: "",
    roomCode: "",
    isHost: false,
    pendingSlots: [],
  };
}

export interface MultiplayerState {
  playerName: string;
  roomCode: string;      // 5-char: `${slot}${password}` e.g. "3KXWP"
  playerId: string;
  isHost: boolean;
  pendingSlots: number[]; // remaining slots to try if current is taken (host only)
}

interface MultiplayerContextValue {
  mp: MultiplayerState;
  setPlayerName: (name: string) => void;
  hostRoom: () => void;
  joinRoom: (code: string) => void;
  clearRoom: () => void;
  setIsHost: (v: boolean) => void;
  tryNextSlot: () => boolean;
}

const MultiplayerContext = createContext<MultiplayerContextValue | null>(null);

export function MultiplayerProvider({ children }: { children: ReactNode }) {
  const [mp, setMp] = useState<MultiplayerState>(loadSession);

  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        playerId: mp.playerId,
        playerName: mp.playerName,
        roomCode: mp.roomCode,
        isHost: mp.isHost,
        pendingSlots: mp.pendingSlots,
      }));
    } catch {}
  }, [mp]);

  return (
    <MultiplayerContext.Provider
      value={{
        mp,
        setPlayerName: (playerName) => setMp((s) => ({ ...s, playerName })),
        hostRoom: () => {
          const slots = shuffled([...ROOM_SLOTS]);
          const slot = slots[0];
          const pendingSlots = slots.slice(1);
          const password = generatePassword();
          const roomCode = `${slot}${password}`;
          history.pushState({}, "", `?room=${roomCode}`);
          setMp((s) => ({ ...s, roomCode, isHost: true, pendingSlots }));
        },
        joinRoom: (code) => {
          const roomCode = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
          history.pushState({}, "", `?room=${roomCode}`);
          setMp((s) => ({ ...s, roomCode, isHost: false, pendingSlots: [] }));
        },
        clearRoom: () => {
          try { sessionStorage.removeItem(SESSION_KEY); } catch {}
          history.pushState({}, "", "/");
          setMp((s) => ({ ...s, roomCode: "", isHost: false, pendingSlots: [] }));
        },
        setIsHost: (isHost) => setMp((s) => ({ ...s, isHost })),
        tryNextSlot: () => {
          const nextSlot = mp.pendingSlots[0];
          if (nextSlot === undefined) return false;
          const password = mp.roomCode.slice(1); // keep same password across slot retries
          const roomCode = `${nextSlot}${password}`;
          history.pushState({}, "", `?room=${roomCode}`);
          setMp((s) => ({
            ...s,
            roomCode,
            pendingSlots: s.pendingSlots.slice(1),
          }));
          return true;
        },
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
