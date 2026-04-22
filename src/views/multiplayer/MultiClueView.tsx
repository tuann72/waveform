import { useEffect, useRef, useState } from "react";
import { useGame } from "@/context/GameContext";
import { useMultiplayer } from "@/context/MultiplayerContext";
import { useStorage, useMutation, useOthers, useUpdateMyPresence } from "@/lib/liveblocks";
import type { DialConfig } from "@/lib/liveblocks";
import { SpectrumDial } from "@/components/game/SpectrumDial";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { spectrumCards } from "@/data/spectrumCards";
import { Ellipsis } from "@/components/ui/ellipsis";
import { TimerBar } from "@/components/game/TimerBar";
import { DinoGame } from "@/components/game/DinoGame";
import { useCountdown } from "@/hooks/useCountdown";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickDials(totalRounds: number, selectedCategories: string[]): DialConfig[] {
  const pool = selectedCategories.length > 0
    ? spectrumCards.filter((c) => c.category && selectedCategories.includes(c.category))
    : spectrumCards;
  return shuffle(pool).slice(0, Math.min(totalRounds, pool.length)).map((card) => ({
    id: card.id,
    left: card.left,
    right: card.right,
    targetPosition: Math.random() * 96 + 2,
  }));
}

export function MultiClueView() {
  const { goTo } = useGame();
  const { mp } = useMultiplayer();
  const updatePresence = useUpdateMyPresence();

  const totalRounds = useStorage((s) => s?.totalRounds ?? 3) ?? 3;
  const players = useStorage((s) => s ? Object.entries(s.players) : []) ?? [];
  const others = useOthers();
  const playerDials = useStorage((s) => s ? s.playerDials as Record<string, DialConfig[]> : {} as Record<string, DialConfig[]>) ?? {};
  const playerClues = useStorage((s) => s ? s.playerClues as Record<string, string[]> : {} as Record<string, string[]>) ?? {};
  const phase = useStorage((s) => s?.phase);
  const clueTimerDuration = useStorage((s) => s?.clueTimerDuration ?? 90) ?? 90;
  const cluePhaseStartTime = useStorage((s) => s?.cluePhaseStartTime ?? null);
  const selectedCategories = useStorage((s) => s?.selectedCategories ?? []) ?? [];

  const myDials = playerDials[mp.playerId] ?? [];

  const [clues, setClues] = useState<string[]>([]);
  const [currentDial, setCurrentDial] = useState(0);
  const [cluesInitializedFor, setCluesInitializedFor] = useState(0);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [rerollsUsed, setRerollsUsed] = useState(0);
  const savedOnExpiryRef = useRef(false);
  const maxRerolls = totalRounds;

  // Initialize local clues when my dials load
  if (myDials.length > 0 && myDials.length !== cluesInitializedFor) {
    setCluesInitializedFor(myDials.length);
    setClues(Array(myDials.length).fill(""));
  }

  const effectiveTimerDuration = clueTimerDuration * totalRounds;
  const timerActive = clueTimerDuration > 0 && cluePhaseStartTime !== null;
  const timeLeft = useCountdown(cluePhaseStartTime, effectiveTimerDuration);
  const timerExpired = timerActive && timeLeft === 0;

  // Auto-navigate when phase advances
  useEffect(() => {
    if (phase === "guessing") goTo("multiGuess");
    if (phase === "results") goTo("multiResults");
  }, [phase, goTo]);

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

  // Builds the guessing queue from storage directly (reads fresh state inside mutation)
  const advanceToGuessing = useMutation(
    ({ storage }, playerIds: string[]) => {
      if (storage.get("phase") !== "clue") return;
      const dialsMap = storage.get("playerDials");
      const cluesMap = storage.get("playerClues");
      const lb = storage.get("guessingQueue");

      // Use actual dial counts per player (may be < totalRounds due to category filtering)
      const maxDials = Math.max(...playerIds.map((id) => (dialsMap.get(id) ?? []).length), 0);

      for (let d = 0; d < maxDials; d++) {
        for (const authorId of playerIds) {
          const authorClues = cluesMap.get(authorId) ?? [];
          if (authorClues[d]?.trim()) {
            lb.push({ dialIndex: d, authorId });
          }
        }
      }

      storage.set("currentGuessIndex", 0);
      if (lb.length > 0) {
        storage.set("guessPhaseStartTime", Date.now());
        storage.set("phase", "guessing");
      } else {
        storage.set("phase", "results");
      }
    },
    [],
  );

  const rerollDial = useMutation(
    ({ storage }, playerId: string, dialIndex: number, categories: string[]) => {
      const pd = storage.get("playerDials");
      const currentDials = pd.get(playerId) ?? [];
      const usedIds = new Set(currentDials.map((d) => d.id));
      const base = categories.length > 0
        ? spectrumCards.filter((c) => c.category && categories.includes(c.category))
        : spectrumCards;
      const available = base.filter((c) => !usedIds.has(c.id));
      const pool = available.length > 0 ? available : base;
      const picked = pool[Math.floor(Math.random() * pool.length)];
      const newDials = [...currentDials];
      newDials[dialIndex] = {
        id: picked.id,
        left: picked.left,
        right: picked.right,
        targetPosition: Math.random() * 96 + 2,
      };
      pd.set(playerId, newDials);
    },
    [],
  );

  const clearMyClues = useMutation(
    ({ storage }, playerId: string) => {
      storage.get("playerClues").delete(playerId);
    },
    [],
  );

  // Generate and store this player's random dials once
  useEffect(() => {
    if (!playerDials[mp.playerId]) {
      savePlayerDials(mp.playerId, pickDials(totalRounds, selectedCategories));
    }
  }, [totalRounds]);

  // On timer expiry, auto-save whatever partial clues we have locally
  useEffect(() => {
    if (!timerExpired || savedOnExpiryRef.current || hasSubmitted) return;
    savedOnExpiryRef.current = true;
    saveClues(mp.playerId, clues);
    updatePresence({ cluesComplete: true });
  }, [timerExpired]);

  // Host advances when all connected players signal clue completion via presence.
  // Falls back to 5s in case a client disconnects without setting presence.
  useEffect(() => {
    if (!mp.isHost || !timerExpired || !players.length) return;
    const allPlayerIds = players.map(([id]) => id);
    const allComplete = others.every((o) => o.presence?.cluesComplete === true);
    if (allComplete) {
      advanceToGuessing(allPlayerIds);
      return;
    }
    const timer = setTimeout(() => advanceToGuessing(allPlayerIds), 5000);
    return () => clearTimeout(timer);
  }, [timerExpired, mp.isHost, players, others]);

  const allOthersSubmitted = players
    .filter(([id]) => id !== mp.playerId)
    .every(([id]) => {
      const saved = playerClues[id] ?? [];
      const dialCount = playerDials[id]?.length ?? 0;
      return dialCount > 0 && saved.length >= dialCount && saved.every((c) => c.trim());
    });

  function handleSubmitAll() {
    if (clues.some((c) => !c.trim())) return;
    setHasSubmitted(true);
    saveClues(mp.playerId, clues);
    updatePresence({ cluesComplete: true });
  }

  function handleReroll() {
    const next = [...clues];
    next[currentDial] = "";
    setClues(next);
    setRerollsUsed((n) => n + 1);
    rerollDial(mp.playerId, currentDial, selectedCategories);
  }

  function handleUnlock() {
    setHasSubmitted(false);
    clearMyClues(mp.playerId);
    updatePresence({ cluesComplete: false });
  }

  // Host advances when every player has fully submitted (no-timer or before timer fires)
  useEffect(() => {
    if (!mp.isHost || !players.length || timerExpired) return;
    const allPlayerIds = players.map(([id]) => id);
    const allReady = allPlayerIds.every((id) => {
      const dialCount = playerDials[id]?.length ?? 0;
      return dialCount > 0 &&
        (playerClues[id]?.length ?? 0) >= dialCount &&
        playerClues[id]?.every((c) => c.trim());
    });
    if (allReady) {
      advanceToGuessing(allPlayerIds);
    }
  }, [playerClues, playerDials, players]);

  const myCluesSubmitted = hasSubmitted || timerExpired;


  if (!myDials.length) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading<Ellipsis /></p>
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

        {timerActive && <TimerBar timeLeft={timeLeft} duration={effectiveTimerDuration} />}

        {/* Progress indicator */}
        <div className="flex items-center">
          <span className="text-xs text-muted-foreground">
            Round {currentDial + 1} of {myDials.length}
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

        {/* Current dial — target shown, needle hidden */}
        <SpectrumDial
          card={dial}
          dialPosition={50}
          onDialChange={() => {}}
          showTarget={myTarget !== undefined}
          targetPosition={myTarget}
          hideNeedle={true}
          disabled={true}
        />

        {/* Reroll button */}
        {!myCluesSubmitted && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              disabled={rerollsUsed >= maxRerolls}
              onClick={handleReroll}
              className="text-xs"
            >
              {rerollsUsed >= maxRerolls
                ? "No Rerolls Left"
                : `Reroll Card (${maxRerolls - rerollsUsed} left)`}
            </Button>
          </div>
        )}

        {/* Clue input */}
        {!myCluesSubmitted ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <Input
                key={currentDial}
                placeholder={`Clue for "${dial.left} ↔ ${dial.right}"`}
                value={clues[currentDial] ?? ""}
                maxLength={50}
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
              <span className="text-xs text-muted-foreground text-right">
                {(clues[currentDial] ?? "").length}/50
              </span>
            </div>
            <div className="flex gap-2">
              {currentDial > 0 && (
                <Button variant="outline" className="flex-1" onClick={() => setCurrentDial((n) => n - 1)}>
                  ← Prev
                </Button>
              )}
              {currentDial < myDials.length - 1 ? (
                <Button
                  className="flex-1"
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
          <div className="flex flex-col gap-3">
            <div className="flex flex-col items-center gap-3 py-2">
              <p className="text-center text-sm text-muted-foreground">
                {timerExpired && !hasSubmitted
                  ? "Time's up! Your clues have been saved."
                  : <>Clues submitted! Waiting for others<Ellipsis /></>}
              </p>
              {hasSubmitted && !timerExpired && !allOthersSubmitted && (
                <Button variant="outline" size="sm" onClick={handleUnlock}>
                  Edit Clues
                </Button>
              )}
            </div>
            <DinoGame />
          </div>
        )}

        <Separator />

        {/* Player status */}
        <div className="flex flex-col gap-1.5">
          {players.map(([id, info]) => {
            const saved = playerClues[id] ?? [];
            const fullyDone = saved.length > 0 && saved.every((c) => c.trim());
            const partial = !fullyDone && saved.some((c) => c.trim());
            return (
              <div key={id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: info.color }} />
                  <span>{info.name}{id === mp.playerId ? " (you)" : ""}</span>
                </div>
                <Badge variant={fullyDone ? "default" : "outline"}>
                  {fullyDone ? "Ready" : partial ? "Partial" : <>Writing<Ellipsis /></>}
                </Badge>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
