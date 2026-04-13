import { useEffect, useState } from "react";
import { useGame } from "@/context/GameContext";
import { useMultiplayer } from "@/context/MultiplayerContext";
import { useStorage, useMutation, useUpdateMyPresence } from "@/lib/liveblocks";
import type { DialConfig } from "@/lib/liveblocks";
import { SpectrumDial } from "@/components/game/SpectrumDial";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { spectrumCards } from "@/data/spectrumCards";

function pickDials(totalRounds: number): DialConfig[] {
  const shuffled = [...spectrumCards].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, totalRounds).map((card) => ({
    id: card.id,
    left: card.left,
    right: card.right,
    targetPosition: Math.random() * 96 + 2,
  }));
}

// Every player is an author for every dial; every other player guesses each author's clue
function buildGuessingQueue(
  playerIds: string[],
  totalDials: number,
): Array<{ dialIndex: number; authorId: string; guesserId: string }> {
  const queue: Array<{ dialIndex: number; authorId: string; guesserId: string }> = [];
  for (let d = 0; d < totalDials; d++) {
    for (const authorId of playerIds) {
      for (const guesserId of playerIds) {
        if (guesserId !== authorId) {
          queue.push({ dialIndex: d, authorId, guesserId });
        }
      }
    }
  }
  return queue;
}

export function MultiClueView() {
  const { goTo } = useGame();
  const { mp } = useMultiplayer();
  const updatePresence = useUpdateMyPresence();

  const totalRounds = useStorage((s) => s?.totalRounds ?? 3) ?? 3;
  const players = useStorage((s) => s ? Object.entries(s.players) : []) ?? [];
  const playerDials = useStorage((s) => s ? s.playerDials as Record<string, DialConfig[]> : {} as Record<string, DialConfig[]>) ?? {};
  const playerClues = useStorage((s) => s ? s.playerClues as Record<string, string[]> : {} as Record<string, string[]>) ?? {};
  const phase = useStorage((s) => s?.phase);

  const myDials = playerDials[mp.playerId] ?? [];

  const [clues, setClues] = useState<string[]>([]);
  const [currentDial, setCurrentDial] = useState(0);
  const [cluesInitializedFor, setCluesInitializedFor] = useState(0);

  // Initialize local clues when my dials load
  if (myDials.length > 0 && myDials.length !== cluesInitializedFor) {
    setCluesInitializedFor(myDials.length);
    setClues(Array(myDials.length).fill(""));
  }

  // Auto-navigate when phase advances
  useEffect(() => {
    if (phase === "guessing") goTo("multiGuess");
  }, [phase]);

  const savePlayerDials = useMutation(
    ({ storage }, playerId: string, dials: DialConfig[]) => {
      const pd = storage.get("playerDials");
      if (!pd.get(playerId)) pd.set(playerId, dials);
    },
    [],
  );

  const saveClues = useMutation(
    ({ storage }, playerId: string, submitted: string[]) => {
      storage.get("playerClues").set(playerId, submitted);
    },
    [],
  );

  const advanceToGuessing = useMutation(({ storage }, queue: ReturnType<typeof buildGuessingQueue>) => {
    const lb = storage.get("guessingQueue");
    queue.forEach((entry) => lb.push(entry));
    storage.set("currentGuessIndex", 0);
    storage.set("phase", "guessing");
  }, []);

  // Generate and store this player's random dials once
  useEffect(() => {
    if (!playerDials[mp.playerId]) {
      savePlayerDials(mp.playerId, pickDials(totalRounds));
    }
  }, [totalRounds]);

  function handleSubmitAll() {
    if (clues.some((c) => !c.trim())) return;
    saveClues(mp.playerId, clues);
    updatePresence({ cluesComplete: true });
  }

  // Host advances phase when every player has saved clues AND dials
  useEffect(() => {
    if (!mp.isHost || !players.length) return;
    const allPlayerIds = players.map(([id]) => id);
    const allReady = allPlayerIds.every((id) =>
      (playerClues[id]?.length ?? 0) >= totalRounds &&
      (playerDials[id]?.length ?? 0) >= totalRounds,
    );
    if (allReady) {
      const queue = buildGuessingQueue(allPlayerIds, totalRounds);
      advanceToGuessing(queue);
    }
  }, [playerClues, playerDials]);

  const myCluesSubmitted = (playerClues[mp.playerId]?.length ?? 0) >= totalRounds && totalRounds > 0;
  const submittedCount = players.filter(
    ([id]) => (playerClues[id]?.length ?? 0) >= totalRounds,
  ).length;

  if (!myDials.length) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const dial = myDials[currentDial];
  const myTarget = myDials[currentDial]?.targetPosition;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-4 py-8">
      <div className="w-full max-w-sm flex flex-col gap-5">
        <div className="text-center">
          <h2 className="text-xl font-semibold">Write Your Clues</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Give a clue for each spectrum without saying the exact words
          </p>
        </div>

        {/* Progress indicator */}
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">
            Round {currentDial + 1} of {myDials.length}
          </span>
          <span className="text-xs text-muted-foreground">
            {submittedCount}/{players.length} submitted
          </span>
        </div>

        {/* Dial tabs */}
        <div className="flex gap-1">
          {myDials.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentDial(i)}
              disabled={myCluesSubmitted}
              className={`flex-1 h-1.5 rounded-full transition-colors cursor-pointer ${
                i === currentDial ? "bg-primary" : clues[i]?.trim() ? "bg-primary/40" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Current dial — target shown only once this player's targets are generated */}
        <SpectrumDial
          card={dial}
          dialPosition={50}
          onDialChange={() => {}}
          showTarget={myTarget !== undefined}
          targetPosition={myTarget}
          hideNeedle={true}
          disabled={true}
        />

        {/* Clue input */}
        {!myCluesSubmitted ? (
          <div className="flex flex-col gap-2">
            <Input
              key={currentDial}
              placeholder={`Clue for "${dial.left} ↔ ${dial.right}"`}
              value={clues[currentDial] ?? ""}
              onChange={(e) => {
                const next = [...clues];
                next[currentDial] = e.target.value;
                setClues(next);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && currentDial < myDials.length - 1) setCurrentDial((n) => n + 1);
              }}
              autoFocus
            />
            <div className="flex gap-2">
              {currentDial > 0 && (
                <Button variant="outline" className="flex-1" onClick={() => setCurrentDial((n) => n - 1)}>
                  ← Prev
                </Button>
              )}
              {currentDial < myDials.length - 1 ? (
                <Button
                  className="flex-1"
                  disabled={!clues[currentDial]?.trim()}
                  onClick={() => setCurrentDial((n) => n + 1)}
                >
                  Next →
                </Button>
              ) : (
                <Button
                  className="flex-1"
                  disabled={clues.some((c) => !c.trim())}
                  onClick={handleSubmitAll}
                >
                  Submit All Clues
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center text-sm text-muted-foreground py-2">
            Clues submitted! Waiting for others…
          </div>
        )}

        <Separator />

        {/* Player status */}
        <div className="flex flex-col gap-1.5">
          {players.map(([id, info]) => {
            const done = (playerClues[id]?.length ?? 0) >= myDials.length;
            return (
              <div key={id} className="flex items-center justify-between text-sm">
                <span>{info.name}{id === mp.playerId ? " (you)" : ""}</span>
                <Badge variant={done ? "default" : "outline"}>
                  {done ? "Ready" : "Writing…"}
                </Badge>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
