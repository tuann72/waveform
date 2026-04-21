import { useEffect, useRef, useState } from "react";
import { useGame } from "@/context/GameContext";
import { useMultiplayer } from "@/context/MultiplayerContext";
import {
  useStorage,
  useMutation,
  useOthers,
  useUpdateMyPresence,
} from "@/lib/liveblocks";
import { getPalette, pickColorOptions } from "@/lib/colorPalette"
import type { PaletteName } from "@/lib/colorPalette";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Ellipsis } from "@/components/ui/ellipsis";
import { cn } from "@/lib/utils";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`;
}

export function ColorformClueView() {
  const { goTo } = useGame();
  const { mp } = useMultiplayer();
  const updatePresence = useUpdateMyPresence();
  const others = useOthers();

  const totalRounds = useStorage((s) => s?.totalRounds ?? 3) ?? 3;
  const players = useStorage((s) => (s ? Object.entries(s.players) : [])) ?? [];
  const playerColors =
    useStorage((s) =>
      s
        ? (s.playerColors as Record<string, number[]>)
        : ({} as Record<string, number[]>),
    ) ?? {};
  const playerClues =
    useStorage((s) =>
      s
        ? (s.playerClues as Record<string, string[]>)
        : ({} as Record<string, string[]>),
    ) ?? {};
  const colorOptions =
    useStorage((s) =>
      s
        ? (s.colorOptions as Record<string, number[][]>)
        : ({} as Record<string, number[][]>),
    ) ?? {};
  const phase = useStorage((s) => s?.phase);
  const colorPaletteName = (useStorage((s) => s?.colorPaletteName) ?? "base") as PaletteName;
  const palette = getPalette(colorPaletteName);
  const clueTimerDuration = useStorage((s) => s?.clueTimerDuration ?? 90) ?? 90;
  const cluePhaseStartTime = useStorage((s) => s?.cluePhaseStartTime ?? null);

  const [selectedColors, setSelectedColors] = useState<(number | null)[]>(() =>
    Array(totalRounds).fill(null),
  );
  const [clues, setClues] = useState<string[]>(() =>
    Array(totalRounds).fill(""),
  );
  const [currentRound, setCurrentRound] = useState(0);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [hasRerolled, setHasRerolled] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const savedOnExpiryRef = useRef(false);

  const effectiveTimerDuration = clueTimerDuration * totalRounds;
  const timerActive = clueTimerDuration > 0 && cluePhaseStartTime !== null;

  // Countdown timer
  useEffect(() => {
    if (!clueTimerDuration || !cluePhaseStartTime) return;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - cluePhaseStartTime) / 1000);
      setTimeLeft(Math.max(0, effectiveTimerDuration - elapsed));
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [clueTimerDuration, cluePhaseStartTime, effectiveTimerDuration]);

  const timerExpired = timerActive && timeLeft === 0;

  // Navigate when phase advances
  useEffect(() => {
    if (phase === "guessing") goTo("multiGuess");
    if (phase === "results") goTo("multiResults");
  }, [phase, goTo]);

  // Generate and store color options for each round (no-op if already set)
  const saveColorOptions = useMutation(
    ({ storage }, playerId: string, opts: number[][]) => {
      const co = storage.get("colorOptions");
      if (!co.get(playerId)) co.set(playerId, opts);
    },
    [],
  );

  useEffect(() => {
    if (!colorOptions[mp.playerId]) {
      const opts = Array.from({ length: totalRounds }, () =>
        pickColorOptions(),
      );
      saveColorOptions(mp.playerId, opts);
    }
  }, [totalRounds]);

  const saveColorformClues = useMutation(
    ({ storage }, playerId: string, colors: number[], clueArr: string[]) => {
      storage.get("playerColors").set(playerId, colors);
      storage.get("playerClues").set(playerId, clueArr);
    },
    [],
  );

  const rerollColorOpts = useMutation(
    ({ storage }, playerId: string, roundIndex: number) => {
      const co = storage.get("colorOptions");
      const current = co.get(playerId) ?? [];
      const updated = [...current];
      updated[roundIndex] = pickColorOptions();
      co.set(playerId, updated);
    },
    [],
  );

  const clearColorformData = useMutation(
    ({ storage }, playerId: string) => {
      storage.get("playerColors").delete(playerId);
      storage.get("playerClues").delete(playerId);
    },
    [],
  );

  // Build guessing queue for colorform: all non-authors guess each (author, round) pair
  const advanceToGuessingColor = useMutation(
    ({ storage }, playerIds: string[]) => {
      if (storage.get("phase") !== "clue") return;
      const colorsMap = storage.get("playerColors");
      const cluesMap = storage.get("playerClues");
      const queue = storage.get("guessingQueue");
      const rounds = storage.get("totalRounds");
      for (let d = 0; d < rounds; d++) {
        for (const authorId of playerIds) {
          const colors = colorsMap.get(authorId) ?? [];
          const authorClues = cluesMap.get(authorId) ?? [];
          if (colors[d] !== undefined && authorClues[d]?.trim()) {
            queue.push({ dialIndex: d, authorId });
          }
        }
      }
      storage.set("currentGuessIndex", 0);
      if (queue.length > 0) {
        storage.set("guessPhaseStartTime", Date.now());
        storage.set("phase", "guessing");
      } else {
        storage.set("phase", "results");
      }
    },
    [],
  );

  // Auto-save on timer expiry
  useEffect(() => {
    if (!timerExpired || savedOnExpiryRef.current || hasSubmitted) return;
    savedOnExpiryRef.current = true;
    const finalColors = Array.from(
      { length: totalRounds },
      (_, i) => selectedColors[i] ?? 0,
    );
    const finalClues = Array.from(
      { length: totalRounds },
      (_, i) => clues[i] ?? "",
    );
    saveColorformClues(mp.playerId, finalColors, finalClues);
    updatePresence({ cluesComplete: true });
  }, [timerExpired]);

  // Host advances when all players complete (via presence) after timer
  useEffect(() => {
    if (!mp.isHost || !timerExpired || !players.length) return;
    const allPlayerIds = players.map(([id]) => id);
    const allComplete = others.every((o) => o.presence?.cluesComplete === true);
    if (allComplete) {
      advanceToGuessingColor(allPlayerIds);
      return;
    }
    const timer = setTimeout(() => advanceToGuessingColor(allPlayerIds), 5000);
    return () => clearTimeout(timer);
  }, [timerExpired, mp.isHost, players, others]);

  // Host advances when all players submit before timer
  useEffect(() => {
    if (!mp.isHost || !players.length || timerExpired) return;
    const allPlayerIds = players.map(([id]) => id);
    const allReady = allPlayerIds.every((id) => {
      const colors = playerColors[id];
      const savedClues = playerClues[id];
      return (
        colors?.length >= totalRounds &&
        savedClues?.length >= totalRounds &&
        savedClues.every((c) => c.trim())
      );
    });
    if (allReady) advanceToGuessingColor(allPlayerIds);
  }, [playerClues, playerColors, players]);

  const allOthersSubmitted = players
    .filter(([id]) => id !== mp.playerId)
    .every(([id]) => {
      const saved = playerClues[id] ?? [];
      return saved.length >= totalRounds && saved.every((c) => c.trim());
    });

  function handleReroll() {
    const nextColors = [...selectedColors];
    nextColors[currentRound] = null;
    setSelectedColors(nextColors);
    const nextClues = [...clues];
    nextClues[currentRound] = "";
    setClues(nextClues);
    setHasRerolled(true);
    rerollColorOpts(mp.playerId, currentRound);
  }

  function handleUnlock() {
    setHasSubmitted(false);
    clearColorformData(mp.playerId);
    updatePresence({ cluesComplete: false });
  }

  function handleSelectColor(colorIdx: number) {
    const next = [...selectedColors];
    next[currentRound] = colorIdx;
    setSelectedColors(next);
  }

  function handleSubmitAll() {
    const hasAllColors = selectedColors.every((c) => c !== null);
    const hasAllClues = clues.every((c) => c.trim());
    if (!hasAllColors || !hasAllClues) return;
    setHasSubmitted(true);
    saveColorformClues(mp.playerId, selectedColors as number[], clues);
    updatePresence({ cluesComplete: true });
  }

  const myCluesSubmitted = hasSubmitted || timerExpired;
  const myOptions = colorOptions[mp.playerId];
  const currentOptions = myOptions?.[currentRound] ?? [];
  const currentSelectedIndex = selectedColors[currentRound];

  const timerPercent =
    timerActive && timeLeft !== null && effectiveTimerDuration > 0
      ? (timeLeft / effectiveTimerDuration) * 100
      : 100;
  const timerBarColor =
    timerPercent > 30
      ? "bg-primary"
      : timerPercent > 10
        ? "bg-amber-500"
        : "bg-red-500";
  const timerTextColor =
    timerPercent <= 10
      ? "text-red-500"
      : timerPercent <= 30
        ? "text-amber-500"
        : "text-foreground";

  const canSubmit =
    selectedColors.every((c) => c !== null) && clues.every((c) => c.trim());

  if (!myOptions) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">
          Loading
          <Ellipsis />
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-4 py-8">
      <div className="w-full max-w-xl flex flex-col gap-5">
        <div className="text-center">
          <h2 className="text-xl font-semibold">Pick & Describe</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Choose a color, then give a clue
          </p>
        </div>

        {/* Timer bar */}
        {timerActive && (
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                Time remaining
              </span>
              <span
                className={`text-sm font-mono font-semibold tabular-nums ${timerTextColor}`}
              >
                {timerExpired ? "Time's up!" : formatTime(timeLeft ?? 0)}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${timerBarColor}`}
                style={{ width: `${timerPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Round progress */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Round {currentRound + 1} of {totalRounds}
          </span>
        </div>

        {/* Round indicator tabs */}
        <div className="flex gap-1">
          {Array.from({ length: totalRounds }, (_, i) => (
            <button
              key={i}
              onClick={() => setCurrentRound(i)}
              disabled={myCluesSubmitted}
              className={cn(
                "flex-1 h-1.5 rounded-full transition-colors cursor-pointer",
                i === currentRound
                  ? "bg-primary"
                  : selectedColors[i] !== null && clues[i]?.trim()
                    ? "bg-primary/40"
                    : "bg-muted",
              )}
            />
          ))}
        </div>

        {!myCluesSubmitted ? (
          <>
            {/* Color option swatches */}
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground uppercase tracking-widest">
                Pick one color to describe
              </p>
              <div className="flex justify-center gap-6">
                {currentOptions.map((colorIdx) => (
                  <button
                    key={colorIdx}
                    onClick={() => handleSelectColor(colorIdx)}
                    className={cn(
                      "w-40 h-40 rounded-3xl transition-all focus:outline-none cursor-pointer",
                      currentSelectedIndex === colorIdx
                        ? "scale-110 shadow-xl"
                        : "opacity-80 hover:opacity-100 hover:scale-105",
                    )}
                    style={{
                      background: palette[colorIdx],
                      boxShadow:
                        currentSelectedIndex === colorIdx
                          ? `0 0 0 3px white, 0 0 0 5px ${palette[colorIdx]}`
                          : undefined,
                    }}
                    aria-label={palette[colorIdx]}
                  />
                ))}
              </div>
            </div>

            {/* Reroll button */}
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                disabled={hasRerolled}
                onClick={handleReroll}
                className="text-xs"
              >
                {hasRerolled ? "Rerolled" : "Reroll Colors"}
              </Button>
            </div>

            {/* Selected color preview */}
            {currentSelectedIndex !== null ? (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border">
                <div
                  className="w-10 h-10 rounded-lg flex-shrink-0 border border-border"
                  style={{ background: palette[currentSelectedIndex] }}
                />
                <div>
                  <p className="text-xs text-muted-foreground">
                    Your target color
                  </p>
                  <p className="text-sm font-mono text-foreground">
                    {palette[currentSelectedIndex]}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/20 border border-dashed">
                <div className="w-10 h-10 rounded-lg flex-shrink-0 bg-muted" />
                <p className="text-sm text-muted-foreground">
                  Select a color above
                </p>
              </div>
            )}

            {/* Clue input */}
            <div className="flex flex-col gap-2">
              <div className="relative">
                <Input
                  key={currentRound}
                  placeholder="Describe this color (Don't mention it explicitly!)"
                  value={clues[currentRound] ?? ""}
                  disabled={currentSelectedIndex === null}
                  maxLength={50}
                  onChange={(e) => {
                    const next = [...clues];
                    next[currentRound] = e.target.value;
                    setClues(next);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && currentRound < totalRounds - 1)
                      setCurrentRound((n) => n + 1);
                  }}
                  autoFocus
                />
                <span className={cn(
                  "absolute right-2 bottom-1.5 text-xs tabular-nums pointer-events-none",
                  (clues[currentRound]?.length ?? 0) >= 45 ? "text-amber-500" : "text-muted-foreground/50",
                  (clues[currentRound]?.length ?? 0) >= 50 && "text-red-500",
                )}>
                  {clues[currentRound]?.length ?? 0}/50
                </span>
              </div>

              <div className="flex gap-2">
                {currentRound > 0 && (
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setCurrentRound((n) => n - 1)}
                  >
                    ← Prev
                  </Button>
                )}
                {currentRound < totalRounds - 1 ? (
                  <Button
                    className="flex-1"
                    disabled={
                      currentSelectedIndex === null ||
                      !clues[currentRound]?.trim()
                    }
                    onClick={() => setCurrentRound((n) => n + 1)}
                  >
                    Next →
                  </Button>
                ) : (
                  <Button
                    className="flex-1"
                    disabled={!canSubmit}
                    onClick={handleSubmitAll}
                  >
                    Submit All Clues
                  </Button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 py-2">
            <p className="text-center text-sm text-muted-foreground">
              {timerExpired && !hasSubmitted ? (
                "Time's up! Your clues have been saved."
              ) : (
                <>
                  Clues submitted! Waiting for others
                  <Ellipsis />
                </>
              )}
            </p>
            {hasSubmitted && !timerExpired && !allOthersSubmitted && (
              <Button variant="outline" size="sm" onClick={handleUnlock}>
                Edit Clues
              </Button>
            )}
          </div>
        )}

        <Separator />

        {/* Player status */}
        <div className="flex flex-col gap-1.5">
          {players.map(([id, info]) => {
            const saved = playerClues[id] ?? [];
            const fullyDone =
              saved.length >= totalRounds && saved.every((c) => c.trim());
            const partial = !fullyDone && saved.some((c) => c.trim());
            return (
              <div
                key={id}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: info.color }}
                  />
                  <span>
                    {info.name}
                    {id === mp.playerId ? " (you)" : ""}
                  </span>
                </div>
                <Badge variant={fullyDone ? "default" : "outline"}>
                  {fullyDone ? (
                    "Ready"
                  ) : partial ? (
                    "Partial"
                  ) : (
                    <>
                      <span>Picking</span>
                      <Ellipsis />
                    </>
                  )}
                </Badge>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
