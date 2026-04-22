import { useEffect, useRef, useState } from "react";
import { LiveList, LiveMap } from "@liveblocks/client";
import { ThemeProvider } from "@/components/theme-provider";
import { GameProvider, useGame } from "@/context/GameContext";
import { MultiplayerProvider, useMultiplayer, getRoomId } from "@/context/MultiplayerContext";
import { RoomProvider, useStorage, useMutation, useOthers } from "@/lib/liveblocks";
import { StartView } from "@/views/StartView";
import { JoinOrHostView } from "@/views/multiplayer/JoinOrHostView";
import { WaitingRoomView, WaitingRoomSkeleton } from "@/views/multiplayer/WaitingRoomView";
import { MultiClueView } from "@/views/multiplayer/MultiClueView";
import { MultiGuessView } from "@/views/multiplayer/MultiGuessView";
import { MultiResultsView } from "@/views/multiplayer/MultiResultsView";
import { ColorformClueView } from "@/views/multiplayer/ColorformClueView";
import { ColorformGuessView } from "@/views/multiplayer/ColorformGuessView";
import { ColorformResultsView } from "@/views/multiplayer/ColorformResultsView";
import { Multi2DClueView } from "@/views/multiplayer/Multi2DClueView";
import { Multi2DGuessView } from "@/views/multiplayer/Multi2DGuessView";
import { Multi2DResultsView } from "@/views/multiplayer/Multi2DResultsView";
import { RoleRevealView } from "@/views/deception/RoleRevealView";
import { FsPlacementView } from "@/views/deception/FsPlacementView";
import { DiscussionView } from "@/views/deception/DiscussionView";
import { DeceptionResultsView } from "@/views/deception/DeceptionResultsView";

const ROOM_VIEWS = new Set([
  "waitingRoom",
  "multiClue", "multiGuess", "multiResults",
  "deceptionRoleReveal", "deceptionFsPlacement", "deceptionDiscussion", "deceptionResults",
]);

function postLog(event: 'connect' | 'disconnect', name: string, roomId: string, total: number) {
  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, name, roomId, total }),
  }).catch(() => {}) // dev-only, ignore failures in prod
}

// Runs inside RoomProvider — handles host promotion when the host disconnects
function RoomOrchestrator() {
  const { goTo } = useGame();
  const { mp, setIsHost, clearRoom } = useMultiplayer();
  const others = useOthers();
  const players = useStorage((s) => s ? Object.entries(s.players) : []) ?? [];
  const hostId = useStorage((s) => s?.hostId);
  const storageLoaded = useStorage((s) => s !== null);
  const isInPlayers = players.some(([id]) => id === mp.playerId);
  const roomId = getRoomId(mp.roomCode);
  const wasRegisteredRef = useRef(false);

  // Log own connect on mount, disconnect on unmount
  useEffect(() => {
    postLog('connect', mp.playerName, roomId, 0)
    return () => postLog('disconnect', mp.playerName, roomId, 0)
  }, []);

  // Track others changes to report accurate total (fires after presence syncs)
  const prevOthersCount = useRef(-1);
  useEffect(() => {
    if (others.length === prevOthersCount.current) return;
    prevOthersCount.current = others.length;
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'count', name: mp.playerName, roomId, total: others.length + 1 }),
    }).catch(() => {});
  }, [others.length]);

  // Promote a new host atomically — no-op if already promoted by another client
  const promoteToHost = useMutation(({ storage }, oldHostId: string, newHostId: string) => {
    if (storage.get("hostId") !== oldHostId) return;
    storage.set("hostId", newHostId);
    const players = storage.get("players");
    const oldInfo = players.get(oldHostId);
    if (oldInfo) players.set(oldHostId, { ...oldInfo, isHost: false });
    const newInfo = players.get(newHostId);
    if (newInfo) players.set(newHostId, { ...newInfo, isHost: true });
  }, []);

  // If another client promoted me (e.g. host clicked Leave), sync local state
  useEffect(() => {
    if (hostId === mp.playerId && !mp.isHost) {
      setIsHost(true);
    }
  }, [hostId, mp.isHost, mp.playerId]);

  // Track once the player is confirmed registered — so we can detect removal (kick)
  useEffect(() => {
    if (storageLoaded && isInPlayers) wasRegisteredRef.current = true;
  }, [storageLoaded, isInPlayers]);

  // Kick detection: non-host player was removed from the players map by the host
  useEffect(() => {
    if (!storageLoaded || !wasRegisteredRef.current || mp.isHost) return;
    if (!isInPlayers) {
      clearRoom();
      goTo("start");
    }
  }, [storageLoaded, isInPlayers, mp.isHost]);

  // Detect host disconnection via presence and promote the first connected player.
  // Debounced: promotion is delayed 3s so initial presence sync (which starts empty)
  // doesn't falsely trigger promotion when a new player first joins.
  // If the host's presence arrives before the timer fires the effect re-runs,
  // hits the early return, and the cleanup cancels the pending timer.
  useEffect(() => {
    if (!hostId || !players.length || mp.isHost) return;

    const connectedIds = new Set<string>([
      mp.playerId,
      ...others
        .map((o) => o.presence?.playerId)
        .filter((id): id is string => !!id),
    ]);

    if (connectedIds.has(hostId)) return; // host still here

    // Deterministically pick the first connected player by storage insertion order
    const connectedPlayers = players.filter(([id]) => connectedIds.has(id));
    if (!connectedPlayers.length) return;

    const [firstId] = connectedPlayers[0];
    if (firstId !== mp.playerId) return; // someone else will handle it

    const timer = setTimeout(() => promoteToHost(hostId, mp.playerId), 3000);
    return () => clearTimeout(timer);
  }, [others, hostId, players, mp.isHost, mp.playerId]);

  return null;
}

// Runs inside RoomProvider — redirects to the correct view when reconnecting mid-game
function RoomNavigator() {
  const { state, goTo } = useGame();
  const phase = useStorage((s) => s?.phase);
  const gameMode = useStorage((s) => s?.gameMode);
  const deceptionPhase = useStorage((s) => s?.deceptionPhase);
  const storageLoaded = useStorage((s) => s !== null);

  useEffect(() => {
    if (!storageLoaded || state.view !== "waitingRoom") return;
    if (gameMode === "deception" && deceptionPhase) {
      if (deceptionPhase === "role-reveal") goTo("deceptionRoleReveal");
      else if (deceptionPhase === "fs-placement") goTo("deceptionFsPlacement");
      else if (deceptionPhase === "discussion") goTo("deceptionDiscussion");
      else if (deceptionPhase === "results") goTo("deceptionResults");
      return;
    }
    if (phase == null) return;
    if (phase === "clue") goTo("multiClue");
    else if (phase === "guessing") goTo("multiGuess");
    else if (phase === "results") goTo("multiResults");
  }, [storageLoaded, phase, gameMode, deceptionPhase, goTo, state.view]);

  return null;
}

// Renders the correct view for the current phase, switching on gameMode for Colorform.
// Must be inside RoomProvider so it can read gameMode from Liveblocks storage.
function InRoomViews() {
  const { state } = useGame();
  const gameMode = useStorage((s) => s?.gameMode ?? "classic");

  if (state.view === "waitingRoom") return <WaitingRoomView />;

  if (gameMode === "deception") {
    if (state.view === "deceptionRoleReveal") return <RoleRevealView />;
    if (state.view === "deceptionFsPlacement") return <FsPlacementView />;
    if (state.view === "deceptionDiscussion") return <DiscussionView />;
    if (state.view === "deceptionResults") return <DeceptionResultsView />;
  }

  if (gameMode === "colorform") {
    if (state.view === "multiClue") return <ColorformClueView />;
    if (state.view === "multiGuess") return <ColorformGuessView />;
    if (state.view === "multiResults") return <ColorformResultsView />;
  }

  if (gameMode === "2d") {
    if (state.view === "multiClue") return <Multi2DClueView />;
    if (state.view === "multiGuess") return <Multi2DGuessView />;
    if (state.view === "multiResults") return <Multi2DResultsView />;
  }

  if (state.view === "multiClue") return <MultiClueView />;
  if (state.view === "multiGuess") return <MultiGuessView />;
  if (state.view === "multiResults") return <MultiResultsView />;
  return null;
}

// Runs inside RoomProvider — verifies slot ownership (host) or password match (joiner).
// Host: atomically claims the slot if empty or stale; retries next slot if actively occupied.
// Joiner: confirms roomPassword matches; rejects on mismatch or empty room.
interface RoomVerifierProps {
  password: string;
  isHost: boolean;
  onVerified: () => void;
  onSlotTaken: () => void;
  onInvalidCode: () => void;
}

function RoomVerifier({ password, isHost, onVerified, onSlotTaken, onInvalidCode }: RoomVerifierProps) {
  const storageLoaded = useStorage((s) => s !== null);
  const roomPassword = useStorage((s) => s?.roomPassword ?? null);
  const playerCount = useStorage((s) => s ? Object.keys(s.players).length : 0) ?? 0;
  const claimAttempted = useRef(false);

  const claimSlot = useMutation(({ storage }, pw: string) => {
    const existing = (storage.get("roomPassword") as string | null | undefined) ?? null;
    const size = storage.get("players").size;
    // Claim if unclaimed or stale (password set but room has no active players)
    if (existing === null || size === 0) {
      storage.set("roomPassword", pw);
    }
  }, []);

  useEffect(() => {
    if (!storageLoaded) return;

    if (isHost) {
      // Actively occupied — skip this slot immediately
      if (roomPassword !== null && playerCount > 0) {
        onSlotTaken();
        return;
      }
      if (!claimAttempted.current) {
        claimAttempted.current = true;
        claimSlot(password);
        return; // wait for storage to reflect the mutation
      }
      // Mutation settled — check if we own the slot
      if (roomPassword === password) {
        onVerified();
      } else {
        // Lost the race to another simultaneous host
        onSlotTaken();
      }
    } else {
      if (roomPassword === null) {
        onInvalidCode(); // room is empty/unclaimed — no active game
      } else if (roomPassword === password) {
        onVerified();
      } else {
        onInvalidCode();
      }
    }
  }, [storageLoaded, roomPassword, playerCount]);

  return null;
}

function MultiplayerRoom() {
  const { mp, tryNextSlot } = useMultiplayer();
  const { goTo } = useGame();
  const { state } = useGame();
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<"full" | "invalid" | null>(null);

  const roomId = getRoomId(mp.roomCode);
  const password = mp.roomCode.slice(1); // last 4 chars

  function handleSlotTaken() {
    const hasMore = tryNextSlot();
    if (!hasMore) setError("full");
    // if hasMore: roomCode changes → key prop changes → RoomProvider remounts
  }

  if (error) {
    const msg = error === "full"
      ? "All rooms are full. Try again in a moment."
      : "Invalid or expired room code.";
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center flex flex-col gap-4 max-w-xs">
          <p className="text-muted-foreground">{msg}</p>
          <button
            className="text-sm underline underline-offset-4 cursor-pointer"
            onClick={() => { setError(null); goTo("joinOrHost"); }}
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <RoomProvider
      key={roomId}
      id={roomId}
      initialPresence={{ playerName: mp.playerName, cluesComplete: false, playerId: mp.playerId, dialPosition: null, dialPositionY: null, reaction: null }}
      initialStorage={{
        phase: "lobby",
        gameMode: "classic",
        totalRounds: state.totalRounds,
        clueTimerDuration: 90,
        cluePhaseStartTime: null,
        guessTimerDuration: 90,
        guessPhaseStartTime: null,
        selectedCategories: [],
        hostId: mp.playerId,
        roomPassword: null,
        players: new LiveMap(),
        playerDials: new LiveMap(),
        playerClues: new LiveMap(),
        guessingQueue: new LiveList([]),
        currentGuessIndex: 0,
        guessResults: new LiveMap(),
        colorPaletteName: "base",
        playerColors: new LiveMap(),
        colorOptions: new LiveMap(),
        player2DDials: new LiveMap(),
        // Deception
        deceptionPhase: null,
        deceptionDealtCards: new LiveMap(),
        deceptionSceneTiles: null,
        deceptionMarkers: new LiveMap(),
        deceptionEncryptedRoles: new LiveMap(),
        deceptionEncryptedRoleMapForHost: null,
        deceptionEncryptedSolutionForHost: null,
        deceptionEncryptedSolutionForFs: null,
        deceptionFsPlayerId: null,
        deceptionRevealedSolution: null,
        deceptionRoleAcknowledged: new LiveMap(),
        deceptionAccusations: new LiveMap(),
        deceptionCurrentRound: 1,
        deceptionFsTimerDuration: 120,
        deceptionFsTimerStart: null,
        deceptionDiscussionTimerDuration: 600,
        deceptionDiscussionTimerStart: null,
        deceptionEnableAccomplice: false,
        deceptionTilePool: [],
        deceptionFsHasSwappedThisRound: false,
        deceptionEliminatedPlayers: new LiveMap(),
      }}
    >
      {!verified ? (
        <>
          <RoomVerifier
            password={password}
            isHost={mp.isHost}
            onVerified={() => setVerified(true)}
            onSlotTaken={handleSlotTaken}
            onInvalidCode={() => setError("invalid")}
          />
          <WaitingRoomSkeleton />
        </>
      ) : (
        <>
          <RoomOrchestrator />
          <RoomNavigator />
          <InRoomViews />
        </>
      )}
    </RoomProvider>
  );
}

function GameRouter() {
  const { state } = useGame();

  if (ROOM_VIEWS.has(state.view)) return <MultiplayerRoom />;

  switch (state.view) {
    case "start":      return <StartView />;
    case "joinOrHost": return <JoinOrHostView />;
    default:           return null;
  }
}

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <GameProvider>
        <MultiplayerProvider>
          <GameRouter />
        </MultiplayerProvider>
      </GameProvider>
    </ThemeProvider>
  );
}

export default App;
