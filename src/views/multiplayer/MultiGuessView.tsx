import { useEffect, useState } from "react";
import { useGame } from "@/context/GameContext";
import { useMultiplayer } from "@/context/MultiplayerContext";
import { useStorage, useMutation } from "@/lib/liveblocks";
import type { DialConfig } from "@/lib/liveblocks";
import { SpectrumDial } from "@/components/game/SpectrumDial";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { calcPoints } from "@/lib/scoring";

export function MultiGuessView() {
  const { goTo } = useGame();
  const { mp } = useMultiplayer();

  const players = useStorage((s) => s ? Object.entries(s.players) : []) ?? [];
  const playerDials = useStorage((s) => s ? s.playerDials as Record<string, DialConfig[]> : {} as Record<string, DialConfig[]>) ?? {};
  const playerClues = useStorage((s) => s ? s.playerClues as Record<string, string[]> : {} as Record<string, string[]>) ?? {};
  const queue = useStorage((s) => s ? [...s.guessingQueue] : []) ?? [];
  const currentGuessIndex = useStorage((s) => s?.currentGuessIndex ?? 0) ?? 0;
  const guessResults = useStorage((s) => s ? s.guessResults as Record<string, { position: number; points: number }> : {} as Record<string, { position: number; points: number }>) ?? {};
  const phase = useStorage((s) => s?.phase);

  const [dialPosition, setDialPosition] = useState(50);
  const [dialResetFor, setDialResetFor] = useState<number | null>(null);

  const currentEntry = queue[currentGuessIndex ?? 0];
  const isMyTurn = currentEntry?.guesserId === mp.playerId;
  // Compute author's dial + target early so handleLockIn and JSX can both use it
  const authorDial = currentEntry
    ? (playerDials[currentEntry.authorId]?.[currentEntry.dialIndex] ?? null)
    : null;
  const authorTarget = authorDial?.targetPosition ?? 50;

  // Reset dial position when turn changes (update-during-render avoids effect cascade)
  if (currentGuessIndex !== dialResetFor) {
    setDialResetFor(currentGuessIndex ?? 0);
    setDialPosition(50);
  }

  // Auto-navigate to results
  useEffect(() => {
    if (phase === "results") goTo("multiResults");
  }, [phase]);

  const lockInGuess = useMutation(
    ({ storage }, guesserId: string, dialIndex: number, authorId: string, position: number, points: number) => {
      const key = `${guesserId}-${dialIndex}-${authorId}`;
      storage.get("guessResults").set(key, { position, points });
      const current = storage.get("currentGuessIndex") as unknown as number;
      const nextIndex = current + 1;
      const queueLen = storage.get("guessingQueue").length;
      storage.set("currentGuessIndex", nextIndex);
      if (nextIndex >= queueLen) {
        storage.set("phase", "results");
      }
    },
    [],
  );

  function handleLockIn() {
    if (!currentEntry) return;
    const pts = calcPoints(dialPosition, authorTarget);
    lockInGuess(mp.playerId, currentEntry.dialIndex, currentEntry.authorId, dialPosition, pts);
  }

  if (!queue.length || !currentEntry) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const dial = authorDial ?? { id: "", left: "?", right: "?", targetPosition: 50 };
  const authorName = players.find(([id]) => id === currentEntry.authorId)?.[1].name ?? "?";
  const guesserName = players.find(([id]) => id === currentEntry.guesserId)?.[1].name ?? "?";
  const clue = playerClues[currentEntry.authorId]?.[currentEntry.dialIndex] ?? "";
  const resultKey = `${currentEntry.guesserId}-${currentEntry.dialIndex}-${currentEntry.authorId}`;
  const result = guessResults[resultKey];
  const locked = !!result;

  const progress = `${(currentGuessIndex ?? 0) + 1} / ${queue.length}`;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-4 py-8">
      <div className="w-full max-w-sm flex flex-col gap-5">
        {/* Header */}
        <div className="text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
            Guess {progress}
          </p>
          <h2 className="text-xl font-semibold">
            {isMyTurn ? "Your turn to guess!" : `${guesserName} is guessing`}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Clue by <span className="font-medium">{authorName}</span>
          </p>
        </div>

        {/* Clue */}
        <div className="rounded-xl border bg-muted/40 px-6 py-4 text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Clue</p>
          <p className="text-2xl font-semibold text-foreground">{clue}</p>
        </div>

        {/* Dial */}
        <div className="flex flex-col gap-2">
          <SpectrumDial
            card={dial}
            dialPosition={dialPosition}
            onDialChange={isMyTurn && !locked ? setDialPosition : () => {}}
            showTarget={locked}
            targetPosition={authorTarget}
            disabled={!isMyTurn || locked}
          />
          <div className="flex justify-between text-xs text-muted-foreground px-1">
            <span>{dial.left}</span>
            <span>{dial.right}</span>
          </div>
        </div>

        {/* Score reveal */}
        {locked && result && (
          <div className="text-center flex flex-col items-center gap-1">
            <Badge variant={result.points === 4 ? "default" : result.points >= 2 ? "secondary" : "outline"}>
              {result.points === 4 ? "Bull's Eye!" : result.points === 3 ? "Close!" : result.points === 2 ? "Not Bad" : "Miss"}
            </Badge>
            <p className="text-lg font-bold">+{result.points} pts</p>
          </div>
        )}

        {/* Action */}
        {isMyTurn && !locked && (
          <Button onClick={handleLockIn}>Lock In</Button>
        )}

        {!isMyTurn && (
          <p className="text-sm text-center text-muted-foreground">Waiting for {guesserName}…</p>
        )}
      </div>
    </div>
  );
}
