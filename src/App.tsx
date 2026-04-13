import { useEffect } from "react";
import { LiveList, LiveMap } from "@liveblocks/client";
import { ThemeProvider } from "@/components/theme-provider";
import { GameProvider, useGame } from "@/context/GameContext";
import { MultiplayerProvider, useMultiplayer } from "@/context/MultiplayerContext";
import { RoomProvider, useStorage, useMutation, useOthers } from "@/lib/liveblocks";
import { StartView } from "@/views/StartView";
import { JoinOrHostView } from "@/views/multiplayer/JoinOrHostView";
import { WaitingRoomView } from "@/views/multiplayer/WaitingRoomView";
import { MultiClueView } from "@/views/multiplayer/MultiClueView";
import { MultiGuessView } from "@/views/multiplayer/MultiGuessView";
import { MultiResultsView } from "@/views/multiplayer/MultiResultsView";

const ROOM_VIEWS = new Set(["waitingRoom", "multiClue", "multiGuess", "multiResults"]);

// Runs inside RoomProvider — handles host promotion when the host disconnects
function RoomOrchestrator() {
  const { mp, setIsHost } = useMultiplayer();
  const others = useOthers();
  const players = useStorage((s) => s ? Object.entries(s.players) : []) ?? [];
  const hostId = useStorage((s) => s?.hostId);

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

  // Detect host disconnection via presence and promote the first connected player
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

    promoteToHost(hostId, mp.playerId);
    // Local state update happens via the hostId effect above once storage updates
  }, [others, hostId, players, mp.isHost, mp.playerId]);

  return null;
}

// Runs inside RoomProvider — redirects to the correct view when reconnecting mid-game
function RoomNavigator() {
  const { state, goTo } = useGame();
  const phase = useStorage((s) => s?.phase);
  const storageLoaded = useStorage((s) => s !== null);

  useEffect(() => {
    if (!storageLoaded || phase == null || state.view !== "waitingRoom") return;
    if (phase === "clue") goTo("multiClue");
    else if (phase === "guessing") goTo("multiGuess");
    else if (phase === "results") goTo("multiResults");
    // phase === "lobby" → stay in waitingRoom
  }, [storageLoaded, phase]);

  return null;
}

function MultiplayerRoom() {
  const { mp } = useMultiplayer();
  const { state } = useGame();

  return (
    <RoomProvider
      id={`waveform-${mp.roomCode}`}
      initialPresence={{ playerName: mp.playerName, cluesComplete: false, playerId: mp.playerId, dialPosition: null }}
      initialStorage={{
        phase: "lobby",
        gameMode: "classic",
        totalRounds: state.totalRounds,
        hostId: mp.playerId,
        players: new LiveMap(),
        playerDials: new LiveMap(),
        playerClues: new LiveMap(),
        guessingQueue: new LiveList([]),
        currentGuessIndex: 0,
        guessResults: new LiveMap(),
      }}
    >
      <RoomOrchestrator />
      <RoomNavigator />
      {state.view === "waitingRoom" && <WaitingRoomView />}
      {state.view === "multiClue" && <MultiClueView />}
      {state.view === "multiGuess" && <MultiGuessView />}
      {state.view === "multiResults" && <MultiResultsView />}
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
