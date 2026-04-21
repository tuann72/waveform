import { useState } from "react";
import { useGame } from "@/context/GameContext";
import { useMultiplayer } from "@/context/MultiplayerContext";
import { useMutation, clearGameData } from "@/lib/liveblocks";

const LEAVE_SYNC_MS = 400;

export function useLeaveRoom() {
  const { goTo } = useGame();
  const { mp, clearRoom } = useMultiplayer();
  const [leaving, setLeaving] = useState(false);

  const leaveRoom = useMutation(({ storage }, leavingId: string, wasHost: boolean) => {
    const players = storage.get("players");
    players.delete(leavingId);

    if (players.size === 0) {
      // Last player leaving — clear game data and release the slot
      clearGameData(storage);
      storage.set("roomPassword", null);
      return;
    }

    if (!wasHost) return;

    // Promote the first remaining player to host
    for (const [newHostId, newHostInfo] of players.entries()) {
      players.set(newHostId, { ...newHostInfo, isHost: true });
      storage.set("hostId", newHostId);
      break;
    }
  }, []);

  async function handleLeave() {
    setLeaving(true);
    leaveRoom(mp.playerId, mp.isHost);
    await new Promise<void>((r) => setTimeout(r, LEAVE_SYNC_MS));
    clearRoom();
    goTo("start");
  }

  return { leaving, handleLeave };
}
