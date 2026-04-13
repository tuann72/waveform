import { LiveList, LiveMap } from "@liveblocks/client";
import { ThemeProvider } from "@/components/theme-provider";
import { GameProvider, useGame } from "@/context/GameContext";
import { MultiplayerProvider, useMultiplayer } from "@/context/MultiplayerContext";
import { RoomProvider } from "@/lib/liveblocks";
import { StartView } from "@/views/StartView";
import { JoinOrHostView } from "@/views/multiplayer/JoinOrHostView";
import { WaitingRoomView } from "@/views/multiplayer/WaitingRoomView";
import { MultiClueView } from "@/views/multiplayer/MultiClueView";
import { MultiGuessView } from "@/views/multiplayer/MultiGuessView";
import { MultiResultsView } from "@/views/multiplayer/MultiResultsView";

const ROOM_VIEWS = new Set(["waitingRoom", "multiClue", "multiGuess", "multiResults"]);

function MultiplayerRoom() {
  const { mp } = useMultiplayer();
  const { state } = useGame();

  return (
    <RoomProvider
      id={`waveform-${mp.roomCode}`}
      initialPresence={{ playerName: mp.playerName, cluesComplete: false }}
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
