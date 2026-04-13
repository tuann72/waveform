import { useEffect, useState } from "react";
import { useGame } from "@/context/GameContext";
import { useMultiplayer } from "@/context/MultiplayerContext";
import { useStorage, useMutation, useOthers, useUpdateMyPresence } from "@/lib/liveblocks";
import type { DialConfig } from "@/lib/liveblocks";
import { SpectrumDial } from "@/components/game/SpectrumDial";
import { Button } from "@/components/ui/button";
import { calcPoints } from "@/lib/scoring";
import { Ellipsis } from "@/components/ui/ellipsis";

export function MultiGuessView() {
  const { goTo } = useGame();
  const { mp } = useMultiplayer();
  const updateMyPresence = useUpdateMyPresence();
  const others = useOthers();

  const players = useStorage((s) => s ? Object.entries(s.players) : []) ?? [];
  const playerDials = useStorage((s) => s ? s.playerDials as Record<string, DialConfig[]> : {} as Record<string, DialConfig[]>) ?? {};
  const playerClues = useStorage((s) => s ? s.playerClues as Record<string, string[]> : {} as Record<string, string[]>) ?? {};
  const queue = useStorage((s) => s ? [...s.guessingQueue] : []) ?? [];
  const currentGuessIndex = useStorage((s) => s?.currentGuessIndex ?? 0) ?? 0;
  const guessResults = useStorage((s) => s ? s.guessResults as Record<string, { position: number; points: number }> : {} as Record<string, { position: number; points: number }>) ?? {};
  const phase = useStorage((s) => s?.phase);

  const [dialPosition, setDialPosition] = useState(50);
  const [dialResetFor, setDialResetFor] = useState<number | null>(null);
  const [autoAdvanceTimer, setAutoAdvanceTimer] = useState<number | null>(null);

  const currentEntry = queue[currentGuessIndex ?? 0];
  const amIAuthor = currentEntry?.authorId === mp.playerId;

  const guessers = players
    .filter(([id]) => id !== currentEntry?.authorId)
    .map(([id, info]) => ({ id, color: info.color, name: info.name }));
  const amIGuesser = guessers.some((g) => g.id === mp.playerId);

  const allGuessersLocked = guessers.length > 0 && !!currentEntry && guessers.every((g) => {
    const key = `${g.id}-${currentEntry.dialIndex}-${currentEntry.authorId}`;
    return !!guessResults[key];
  });

  const authorDial = currentEntry
    ? (playerDials[currentEntry.authorId]?.[currentEntry.dialIndex] ?? null)
    : null;
  const authorTarget = authorDial?.targetPosition ?? 50;

  // Reset dial + presence when turn changes
  if (currentGuessIndex !== dialResetFor) {
    setDialResetFor(currentGuessIndex ?? 0);
    setDialPosition(50);
  }

  useEffect(() => {
    updateMyPresence({ dialPosition: null });
  }, [currentGuessIndex]);

  useEffect(() => {
    if (phase === "results") goTo("multiResults");
  }, [phase]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Start 12s countdown when all guessers lock in; author auto-advances at 0
  useEffect(() => {
    if (!allGuessersLocked) {
      setAutoAdvanceTimer(null);
      return;
    }
    setAutoAdvanceTimer(12);
    const interval = setInterval(() => {
      setAutoAdvanceTimer((t) => (t !== null && t > 0 ? t - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [allGuessersLocked, currentGuessIndex]);

  useEffect(() => {
    if (autoAdvanceTimer === 0 && amIAuthor) advanceGuess();
  }, [autoAdvanceTimer]);

  function handleDialChange(pos: number) {
    setDialPosition(pos);
    updateMyPresence({ dialPosition: pos });
  }

  const recordGuess = useMutation(
    ({ storage }, guesserId: string, dialIndex: number, authorId: string, position: number, points: number) => {
      const key = `${guesserId}-${dialIndex}-${authorId}`;
      storage.get("guessResults").set(key, { position, points });
    },
    [],
  );

  const advanceGuess = useMutation(
    ({ storage }) => {
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
    if (!currentEntry || !amIGuesser) return;
    const pts = calcPoints(dialPosition, authorTarget);
    recordGuess(mp.playerId, currentEntry.dialIndex, currentEntry.authorId, dialPosition, pts);
  }

  if (!queue.length || !currentEntry) {
    return (
      <div className="h-screen overflow-hidden flex items-center justify-center">
        <p className="text-muted-foreground">Loading<Ellipsis /></p>
      </div>
    );
  }

  const dial = authorDial ?? { id: "", left: "?", right: "?", targetPosition: 50 };
  const authorName = players.find(([id]) => id === currentEntry.authorId)?.[1].name ?? "?";
  const clue = playerClues[currentEntry.authorId]?.[currentEntry.dialIndex] ?? "";

  const myResultKey = amIGuesser
    ? `${mp.playerId}-${currentEntry.dialIndex}-${currentEntry.authorId}`
    : null;
  const myResult = myResultKey ? guessResults[myResultKey] : undefined;
  const myLocked = !!myResult;

  // Author sees live needles during guessing; everyone sees locked positions after reveal
  const extraNeedles = amIAuthor
    ? guessers.map((g) => {
        const key = `${g.id}-${currentEntry.dialIndex}-${currentEntry.authorId}`;
        const result = guessResults[key];
        if (result) return { position: result.position, color: g.color };
        const other = others.find((o) => o.presence?.playerId === g.id);
        return { position: other?.presence?.dialPosition ?? 50, color: g.color };
      })
    : allGuessersLocked
      ? guessers.map((g) => {
          const key = `${g.id}-${currentEntry.dialIndex}-${currentEntry.authorId}`;
          return { position: guessResults[key]?.position ?? 50, color: g.color };
        })
      : [];

  const myDisplayPosition = myLocked ? myResult!.position : dialPosition;
  const progress = `${(currentGuessIndex ?? 0) + 1} / ${queue.length}`;

  return (
    <div className="h-screen overflow-hidden flex flex-col items-center justify-center gap-6 bg-background px-4 py-8">
      <div className="w-full max-w-sm flex flex-col gap-5">
        {/* Header */}
        <div className="text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
            Round {progress}
          </p>
          <h2 className="text-xl font-semibold">
            {amIAuthor ? "Watch the guesses" : "Your turn to guess"}
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
            dialPosition={myDisplayPosition}
            onDialChange={amIGuesser && !myLocked ? handleDialChange : () => {}}
            showTarget={amIAuthor || allGuessersLocked}
            targetPosition={authorTarget}
            disabled={!amIGuesser || myLocked}
            hideNeedle={amIAuthor}
            extraNeedles={extraNeedles}
          />
          <div className="flex justify-between text-xs text-muted-foreground px-1">
            <span>{dial.left}</span>
            <span>{dial.right}</span>
          </div>
        </div>

        {/* Guesser status — shown to author live, shown to all after reveal */}
        {(amIAuthor || allGuessersLocked) && (
          <div className="flex flex-col gap-1">
            {guessers.map((g) => {
              const key = `${g.id}-${currentEntry.dialIndex}-${currentEntry.authorId}`;
              const result = guessResults[key];
              const locked = !!result;
              return (
                <div key={g.id} className="flex items-center gap-2 text-xs">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: g.color }} />
                  <span className="text-muted-foreground">{g.name}{g.id === mp.playerId ? " (you)" : ""}</span>
                  <span className="ml-auto">
                    {allGuessersLocked && result
                      ? <span className="font-semibold text-foreground">+{result.points} pt{result.points !== 1 ? "s" : ""}</span>
                      : locked
                        ? <span className="text-muted-foreground">Locked in</span>
                        : <span className="text-muted-foreground"><>Guessing<Ellipsis /></></span>
                    }
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Actions */}
        {amIGuesser && !myLocked && (
          <Button onClick={handleLockIn}>Lock In</Button>
        )}

        {amIGuesser && myLocked && !allGuessersLocked && (
          <p className="text-sm text-center text-muted-foreground">Waiting for others to lock in<Ellipsis /></p>
        )}

        {allGuessersLocked && amIAuthor && (
          <div className="flex items-center gap-3">
            <Button className="flex-1" onClick={() => advanceGuess()}>Next</Button>
            {autoAdvanceTimer !== null && autoAdvanceTimer > 0 && (
              <span className="text-sm text-muted-foreground tabular-nums w-6 text-center">{autoAdvanceTimer}</span>
            )}
          </div>
        )}

        {allGuessersLocked && !amIAuthor && (
          <p className="text-sm text-center text-muted-foreground">
            Waiting for {authorName} to continue
            {autoAdvanceTimer !== null && autoAdvanceTimer > 0 && (
              <span className="ml-1 tabular-nums">({autoAdvanceTimer})</span>
            )}
          </p>
        )}

        {amIAuthor && !allGuessersLocked && (
          <p className="text-sm text-center text-muted-foreground">Watching guesses come in<Ellipsis /></p>
        )}
      </div>
    </div>
  );
}
