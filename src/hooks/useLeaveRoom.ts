import { useState } from "react";
import { useGame } from "@/context/GameContext";
import { useMultiplayer } from "@/context/MultiplayerContext";
import { useStorage, useMutation, clearGameData } from "@/lib/liveblocks";

// How long to wait for the leaveRoom mutation to sync before disconnecting.
// Liveblocks optimistically updates locally but needs a moment to flush to the server.
const LEAVE_SYNC_MS = 400;

export function useLeaveRoom() {
  const { goTo } = useGame();
  const { mp, clearRoom } = useMultiplayer();
  const players = useStorage((s) => s ? Object.entries(s.players) : []) ?? [];
  const [leaving, setLeaving] = useState(false);

  const leaveRoom = useMutation(({ storage }, leavingId: string, wasHost: boolean) => {
    const players = storage.get("players");
    players.delete(leavingId);

    if (!wasHost) return;

    if (players.size === 0) {
      clearGameData(storage);
    } else {
      // Promote the first remaining player to host
      for (const [newHostId, newHostInfo] of players.entries()) {
        players.set(newHostId, { ...newHostInfo, isHost: true });
        storage.set("hostId", newHostId);
        break;
      }
    }
  }, []);

  async function handleLeave() {
    setLeaving(true);

    if (mp.isHost && players.length <= 1) {
      // Last player — delete the room from Liveblocks entirely via server-side API
      try {
        await fetch(`/api/delete-room?roomId=waveform-${mp.roomCode}`, { method: "DELETE" });
      } catch {
        // best effort — navigate regardless
      }
    } else {
      leaveRoom(mp.playerId, mp.isHost);
      await new Promise<void>((r) => setTimeout(r, LEAVE_SYNC_MS));
    }

    clearRoom();
    goTo("start");
  }

  return { leaving, handleLeave };
}
