import { useEffect, useRef, useState } from "react";
import { useGame } from "@/context/GameContext";
import { useMultiplayer } from "@/context/MultiplayerContext";
import { useStorage, useMutation } from "@/lib/liveblocks";
import type { GameMode } from "@/lib/liveblocks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ROUND_OPTIONS } from "@/types/game";

const MAX_PLAYERS = 12;

const TIMER_OPTIONS = [
  { value: 30, label: "30s" },
  { value: 60, label: "1 min" },
  { value: 90, label: "90s" },
  { value: 120, label: "2 min" },
  { value: 0, label: "No limit" },
];

const PLAYER_COLORS = [
  "#f87171", "#fb923c", "#facc15", "#4ade80",
  "#22d3ee", "#60a5fa", "#a78bfa", "#e879f9",
  "#f472b6", "#34d399", "#818cf8", "#94a3b8",
];

export function WaitingRoomView() {
  const { state, goTo } = useGame();
  const { mp, clearRoom } = useMultiplayer();

  const phase = useStorage((s) => s?.phase);
  const players = useStorage((s) => s ? Object.entries(s.players) : []) ?? [];
  const totalRounds = useStorage((s) => s?.totalRounds ?? state.totalRounds);
  const gameMode = useStorage((s) => s?.gameMode ?? "classic");
  const clueTimerDuration = useStorage((s) => s?.clueTimerDuration ?? 90);

  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const storageLoaded = useStorage((s) => s !== null);
  // Non-hosts navigate when phase changes lobby → clue.
  // Hosts NEVER navigate via this effect — they use the Start Game button.
  const seenLobby = useRef(false);

  // Host resets room to a clean state (handles stale rooms from previous games)
  const initRoom = useMutation(({ storage }, id: string, name: string) => {
    const players = storage.get("players");
    // Already registered — reconnecting mid-game or returning after play again; leave state intact
    if (players.has(id)) return;
    // New host or stale room from a previous session — full reset
    storage.set("phase", "lobby");
    storage.set("currentGuessIndex", 0);
    const playerDials = storage.get("playerDials");
    for (const k of playerDials.keys()) playerDials.delete(k);
    const clues = storage.get("playerClues");
    for (const k of clues.keys()) clues.delete(k);
    const results = storage.get("guessResults");
    for (const k of results.keys()) results.delete(k);
    const queue = storage.get("guessingQueue");
    while (queue.length > 0) queue.delete(0);
    for (const k of players.keys()) players.delete(k);
    players.set(id, { name, isHost: true, color: PLAYER_COLORS[0] });
  }, []);

  // Non-host registration — enforces 12-player cap
  const registerPlayer = useMutation(
    ({ storage }, id: string, name: string) => {
      const players = storage.get("players");
      if (players.has(id)) return; // already registered (returning after play again)
      if (players.size >= MAX_PLAYERS) return;
      const colorIndex = players.size % PLAYER_COLORS.length;
      players.set(id, { name, isHost: false, color: PLAYER_COLORS[colorIndex] });
    },
    [],
  );

  useEffect(() => {
    if (!storageLoaded) return;
    if (mp.isHost) {
      initRoom(mp.playerId, mp.playerName);
    } else {
      registerPlayer(mp.playerId, mp.playerName);
    }
  }, [storageLoaded]);

  useEffect(() => {
    if (mp.isHost) return; // host navigates explicitly via Start Game button
    if (phase === "lobby") { seenLobby.current = true; return; }
    if (phase === "clue" && seenLobby.current) goTo("multiClue");
  }, [phase]);

  function handleCopy() {
    navigator.clipboard.writeText(mp.roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const setRounds = useMutation(({ storage }, rounds: number) => {
    storage.set("totalRounds", rounds);
  }, []);

  const setGameMode = useMutation(({ storage }, mode: GameMode) => {
    storage.set("gameMode", mode);
  }, []);

  const setClueTimer = useMutation(({ storage }, duration: number) => {
    storage.set("clueTimerDuration", duration);
  }, []);

  const startGame = useMutation(({ storage }) => {
    storage.set("cluePhaseStartTime", Date.now());
    storage.set("phase", "clue");
  }, []);

  function handleStart() {
    startGame();
    goTo("multiClue");
  }

  // Removes the leaving player from storage and handles host succession/cleanup
  const leaveRoom = useMutation(({ storage }, leavingId: string, wasHost: boolean) => {
    const players = storage.get("players");
    players.delete(leavingId);

    if (!wasHost) return;

    if (players.size === 0) {
      // No one left — reset to a clean slate so the room code can be reused
      storage.set("phase", "lobby");
      storage.set("currentGuessIndex", 0);
      const pd = storage.get("playerDials");
      for (const k of pd.keys()) pd.delete(k);
      const cl = storage.get("playerClues");
      for (const k of cl.keys()) cl.delete(k);
      const res = storage.get("guessResults");
      for (const k of res.keys()) res.delete(k);
      const q = storage.get("guessingQueue");
      while (q.length > 0) q.delete(0);
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

    if (mp.isHost && playerCount <= 1) {
      // Last player — delete the room from Liveblocks entirely via server-side API
      try {
        await fetch(`/api/delete-room?roomId=waveform-${mp.roomCode}`, { method: 'DELETE' });
      } catch {
        // best effort — navigate regardless
      }
    } else {
      // Remove self from storage and promote next host if needed,
      // then wait for the mutation to sync before disconnecting
      leaveRoom(mp.playerId, mp.isHost);
      await new Promise<void>((r) => setTimeout(r, 400));
    }

    clearRoom();
    goTo("start");
  }

  const playerCount = players?.length ?? 0;
  const canStart = mp.isHost && playerCount >= 2;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-4">
      <div className="w-full max-w-xs flex flex-col gap-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold">Waiting Room</h2>
          <p className="text-sm text-muted-foreground mt-1">Share the code with friends</p>
        </div>

        {/* Room code */}
        <div className="rounded-xl border bg-muted/40 px-6 py-4 flex flex-col items-center gap-3">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Room Code</p>
          <p className="text-4xl font-mono font-bold tracking-[0.2em] text-foreground">
            {mp.roomCode}
          </p>
          <Button variant="outline" size="sm" className="w-full" onClick={handleCopy}>
            {copied ? "Copied!" : "Copy Code"}
          </Button>
        </div>

        <Separator />

        {/* Game mode selection */}
        <div className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Game Mode</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => mp.isHost && setGameMode("classic")}
              disabled={!mp.isHost}
              className={`rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors cursor-pointer disabled:cursor-default ${
                gameMode === "classic"
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              Classic
            </button>
            <div className="relative">
              <button
                disabled
                className="w-full rounded-lg border-2 border-border px-4 py-3 text-sm font-medium opacity-50 cursor-not-allowed"
              >
                3D Mode
              </button>
              <Badge variant="secondary" className="absolute -top-2 -right-2 text-xs px-1.5 py-0">
                Soon
              </Badge>
            </div>
          </div>
          {!mp.isHost && (
            <p className="text-xs text-muted-foreground text-center">Only the host can change settings</p>
          )}
        </div>

        {/* Rounds */}
        <div className="flex items-center gap-3">
          <Label className="text-sm text-muted-foreground whitespace-nowrap flex-1">Rounds</Label>
          <Select
            value={String(totalRounds ?? 3)}
            onValueChange={(v) => setRounds(Number(v))}
            disabled={!mp.isHost}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROUND_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Clue timer */}
        <div className="flex items-center gap-3">
          <Label className="text-sm text-muted-foreground whitespace-nowrap flex-1">Clue Timer</Label>
          <Select
            value={String(clueTimerDuration ?? 90)}
            onValueChange={(v) => setClueTimer(Number(v))}
            disabled={!mp.isHost}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMER_OPTIONS.map(({ value, label }) => (
                <SelectItem key={value} value={String(value)}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Player list */}
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Players ({playerCount})
          </p>
          {players?.map(([id, info]) => (
            <div key={id} className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: info.color }}
                />
                <span className="text-sm text-foreground">{info.name}</span>
              </div>
              <div className="flex gap-1">
                {info.isHost && <Badge variant="secondary">Host</Badge>}
                {id === mp.playerId && <Badge variant="outline">You</Badge>}
              </div>
            </div>
          ))}
          {playerCount < 2 && (
            <p className="text-xs text-muted-foreground mt-1">
              Waiting for players to join…
            </p>
          )}
          {!mp.isHost && playerCount >= MAX_PLAYERS && !players?.find(([id]) => id === mp.playerId) && (
            <p className="text-xs text-destructive mt-1">Room is full (max {MAX_PLAYERS} players).</p>
          )}
        </div>

        {mp.isHost ? (
          <Button onClick={handleStart} disabled={!canStart}>
            {canStart ? "Start Game" : "Waiting for players…"}
          </Button>
        ) : (
          <p className="text-sm text-center text-muted-foreground">
            Waiting for host to start…
          </p>
        )}

        <Button variant="ghost" className="text-muted-foreground" onClick={handleLeave} disabled={leaving}>
          {leaving ? "Leaving…" : "Leave Room"}
        </Button>
      </div>
    </div>
  );
}
