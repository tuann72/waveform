import { useEffect, useRef, useState } from "react";
import { useGame } from "@/context/GameContext";
import { useMultiplayer } from "@/context/MultiplayerContext";
import { useStorage, useMutation, useOthers, useUpdateMyPresence } from "@/lib/liveblocks";
import type { DialConfig, Dial2DConfig } from "@/lib/liveblocks";
import { SpectrumDial } from "@/components/game/SpectrumDial";
import type { ExtraNeedle } from "@/components/game/SpectrumDial";
import { SpectrumPlane } from "@/components/game/SpectrumPlane";
import type { ExtraPoint } from "@/components/game/SpectrumPlane";
import { EmojiReactions } from "@/components/game/EmojiReactions";
import { Button } from "@/components/ui/button";
import { Ellipsis } from "@/components/ui/ellipsis";
import { calcPoints, calcPoints2D, applyDoubleDown } from "@/lib/scoring";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`;
}

type GuessMode =
  | { kind: "classic"; playerDials: Record<string, DialConfig[]> }
  | { kind: "2d"; player2DDials: Record<string, Dial2DConfig[]> };

interface Props {
  mode: GuessMode;
}

export function MultiGuessBase({ mode }: Props) {
  const { goTo } = useGame();
  const { mp } = useMultiplayer();
  const updateMyPresence = useUpdateMyPresence();
  const others = useOthers();

  const players = useStorage((s) => (s ? Object.entries(s.players) : [])) ?? [];
  const playerClues = useStorage((s) => s ? s.playerClues as Record<string, string[]> : {} as Record<string, string[]>) ?? {};
  const queue = useStorage((s) => (s ? [...s.guessingQueue] : [])) ?? [];
  const currentGuessIndex = useStorage((s) => s?.currentGuessIndex ?? 0) ?? 0;
  const guessResults = useStorage((s) =>
    s ? s.guessResults as Record<string, { position: number; posY?: number; points: number; doubleDown?: boolean }> : {}
  ) ?? {};
  const phase = useStorage((s) => s?.phase);
  const guessTimerDuration = useStorage((s) => s?.guessTimerDuration ?? 90) ?? 90;
  const guessPhaseStartTime = useStorage((s) => s?.guessPhaseStartTime ?? null) ?? null;
  const effectiveTimer = guessTimerDuration * (mode.kind === "2d" ? 2 : 1);

  // Unified position: Classic uses x only; 2D uses x and y
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [resetFor, setResetFor] = useState<number | null>(null);
  const [autoAdvanceTimer, setAutoAdvanceTimer] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [doubleDown, setDoubleDown] = useState(false);
  const isAdvancing = useRef(false);
  const savedOnExpiryRef = useRef(false);

  const currentEntry = queue[currentGuessIndex ?? 0];
  const amIAuthor = currentEntry?.authorId === mp.playerId;

  const guessers = players
    .filter(([id]) => id !== currentEntry?.authorId)
    .map(([id, info]) => ({ id, color: info.color, name: info.name }));
  const amIGuesser = guessers.some((g) => g.id === mp.playerId);

  const allGuessersLocked =
    guessers.length > 0 &&
    !!currentEntry &&
    guessers.every((g) => !!guessResults[`${g.id}-${currentEntry.dialIndex}-${currentEntry.authorId}`]);

  const authorDial = currentEntry
    ? mode.kind === "classic"
      ? (mode.playerDials[currentEntry.authorId]?.[currentEntry.dialIndex] ?? null)
      : (mode.player2DDials[currentEntry.authorId]?.[currentEntry.dialIndex] ?? null)
    : null;

  const recordGuess = useMutation(
    ({ storage }, guesserId: string, dialIndex: number, authorId: string, pos: { x: number; y: number }, points: number, dd: boolean) => {
      const key = `${guesserId}-${dialIndex}-${authorId}`;
      storage.get("guessResults").set(key, mode.kind === "2d"
        ? { position: pos.x, posY: pos.y, points, doubleDown: dd }
        : { position: pos.x, points, doubleDown: dd }
      );
    },
    [],
  );

  const advanceGuess = useMutation(({ storage }) => {
    const current = storage.get("currentGuessIndex");
    const nextIndex = current + 1;
    storage.set("currentGuessIndex", nextIndex);
    if (nextIndex >= storage.get("guessingQueue").length) {
      storage.set("phase", "results");
    } else {
      storage.set("guessPhaseStartTime", Date.now());
    }
  }, []);

  // Reset position when turn changes
  if (currentGuessIndex !== resetFor) {
    setResetFor(currentGuessIndex ?? 0);
    setPosition({ x: 50, y: 50 });
    setDoubleDown(false);
  }

  useEffect(() => {
    updateMyPresence(mode.kind === "2d"
      ? { dialPosition: null, dialPositionY: null }
      : { dialPosition: null }
    );
    isAdvancing.current = false;
    savedOnExpiryRef.current = false;
  }, [currentGuessIndex]);

  // Guess countdown timer
  useEffect(() => {
    if (!guessTimerDuration || !guessPhaseStartTime) return;
    const tick = () => setTimeLeft(Math.max(0, effectiveTimer - Math.floor((Date.now() - guessPhaseStartTime) / 1000)));
    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [guessTimerDuration, guessPhaseStartTime, effectiveTimer]);

  // Auto-lock-in when guess timer expires
  useEffect(() => {
    if (timeLeft !== 0 || !guessTimerDuration || savedOnExpiryRef.current || !amIGuesser || !currentEntry || !authorDial) return;
    if (!!guessResults[`${mp.playerId}-${currentEntry.dialIndex}-${currentEntry.authorId}`]) return;
    savedOnExpiryRef.current = true;
    const raw = mode.kind === "classic"
      ? calcPoints(position.x, (authorDial as DialConfig).targetPosition)
      : calcPoints2D(position.x, position.y, (authorDial as Dial2DConfig).targetX, (authorDial as Dial2DConfig).targetY);
    recordGuess(mp.playerId, currentEntry.dialIndex, currentEntry.authorId, position, applyDoubleDown(raw, doubleDown), doubleDown);
  }, [timeLeft]);

  useEffect(() => {
    if (phase === "results") goTo("multiResults");
  }, [phase, goTo]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // 12s auto-advance after all guessers lock in
  useEffect(() => {
    if (!allGuessersLocked) return;
    const startTime = Date.now();
    const interval = setInterval(() => {
      setAutoAdvanceTimer(Math.max(0, 12 - Math.floor((Date.now() - startTime) / 1000)));
    }, 200);
    return () => { clearInterval(interval); setAutoAdvanceTimer(null); };
  }, [allGuessersLocked, currentGuessIndex]);

  useEffect(() => {
    if (autoAdvanceTimer === 0 && amIAuthor && allGuessersLocked && !isAdvancing.current) {
      isAdvancing.current = true;
      advanceGuess();
    }
  }, [autoAdvanceTimer]);

  function handlePositionChange(pos: { x: number; y: number }) {
    setPosition(pos);
    updateMyPresence(mode.kind === "2d"
      ? { dialPosition: pos.x, dialPositionY: pos.y }
      : { dialPosition: pos.x }
    );
  }

  function handleLockIn() {
    if (!currentEntry || !amIGuesser || !authorDial) return;
    const raw = mode.kind === "classic"
      ? calcPoints(position.x, (authorDial as DialConfig).targetPosition)
      : calcPoints2D(position.x, position.y, (authorDial as Dial2DConfig).targetX, (authorDial as Dial2DConfig).targetY);
    recordGuess(mp.playerId, currentEntry.dialIndex, currentEntry.authorId, position, applyDoubleDown(raw, doubleDown), doubleDown);
  }

  function handleAdvance() {
    if (isAdvancing.current) return;
    isAdvancing.current = true;
    advanceGuess();
  }

  if (!queue.length || !currentEntry || !authorDial) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading<Ellipsis /></p>
      </div>
    );
  }

  const authorName = players.find(([id]) => id === currentEntry.authorId)?.[1].name ?? "?";
  const clue = playerClues[currentEntry.authorId]?.[currentEntry.dialIndex] ?? "";

  const myResult = amIGuesser
    ? guessResults[`${mp.playerId}-${currentEntry.dialIndex}-${currentEntry.authorId}`]
    : undefined;
  const amILocked = !!myResult;
  const displayPosition = amILocked
    ? { x: myResult!.position, y: myResult!.posY ?? 50 }
    : position;

  const currentRound = currentEntry.dialIndex + 1;
  const totalDialRounds = Math.max(...queue.map((e) => e.dialIndex)) + 1;

  const timerActive = guessTimerDuration > 0 && guessPhaseStartTime !== null && !allGuessersLocked;
  const timerPercent = timerActive && timeLeft !== null ? (timeLeft / effectiveTimer) * 100 : 100;
  const timerBarColor = timerPercent > 30 ? "bg-primary" : timerPercent > 10 ? "bg-amber-500" : "bg-red-500";
  const timerTextColor = timerPercent <= 10 ? "text-red-500" : timerPercent <= 30 ? "text-amber-500" : "text-foreground";

  const guesserLabel = mode.kind === "2d" ? "Place your point" : "Your turn to guess";
  const guessingLabel = mode.kind === "2d" ? "Placing" : "Guessing";

  // Extra markers: author sees live positions; everyone sees locked positions after reveal
  let dialNode: React.ReactNode;
  if (mode.kind === "classic") {
    const dial = authorDial as DialConfig;
    const extraNeedles: ExtraNeedle[] = amIAuthor
      ? guessers.flatMap((g) => {
          const res = guessResults[`${g.id}-${currentEntry.dialIndex}-${currentEntry.authorId}`];
          if (res) return [{ position: res.position, color: g.color }];
          const live = others.find((o) => o.presence?.playerId === g.id)?.presence?.dialPosition;
          return live != null ? [{ position: live, color: g.color }] : [];
        })
      : allGuessersLocked
        ? guessers.map((g) => ({ position: guessResults[`${g.id}-${currentEntry.dialIndex}-${currentEntry.authorId}`]?.position ?? 50, color: g.color }))
        : [];
    dialNode = (
      <div className="flex flex-col gap-2">
        <SpectrumDial
          card={dial}
          dialPosition={displayPosition.x}
          onDialChange={(x) => handlePositionChange({ x, y: 50 })}
          showTarget={amIAuthor || allGuessersLocked}
          targetPosition={dial.targetPosition}
          disabled={!amIGuesser || amILocked}
          hideNeedle={amIAuthor}
          extraNeedles={extraNeedles}
        />
        <div className="flex justify-between text-xs text-muted-foreground px-1">
          <span>{dial.left}</span>
          <span>{dial.right}</span>
        </div>
      </div>
    );
  } else {
    const dial = authorDial as Dial2DConfig;
    const extraPoints: ExtraPoint[] = amIAuthor
      ? guessers.flatMap((g) => {
          const res = guessResults[`${g.id}-${currentEntry.dialIndex}-${currentEntry.authorId}`];
          if (res) return [{ x: res.position, y: res.posY ?? 50, color: g.color }];
          const other = others.find((o) => o.presence?.playerId === g.id);
          const lx = other?.presence?.dialPosition;
          const ly = other?.presence?.dialPositionY;
          return lx != null && ly != null ? [{ x: lx, y: ly, color: g.color }] : [];
        })
      : allGuessersLocked
        ? guessers.map((g) => {
            const r = guessResults[`${g.id}-${currentEntry.dialIndex}-${currentEntry.authorId}`];
            return { x: r?.position ?? 50, y: r?.posY ?? 50, color: g.color };
          })
        : [];
    dialNode = (
      <SpectrumPlane
        config={dial}
        position={displayPosition}
        onPositionChange={amIGuesser && !amILocked ? handlePositionChange : () => {}}
        showTarget={amIAuthor || allGuessersLocked}
        disabled={!amIGuesser || amILocked || amIAuthor}
        hidePoint={amIAuthor}
        extraPoints={extraPoints}
      />
    );
  }

  return (
    <div className="h-screen overflow-hidden flex flex-col items-center justify-center gap-5 bg-background px-4 py-6 pb-20">
      <EmojiReactions />
      <div className="w-full max-w-sm flex flex-col gap-4">

        {/* Header */}
        <div className="text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
            Round {currentRound} of {totalDialRounds}
          </p>
          <h2 className="text-xl font-semibold">
            {amIAuthor ? "Watch the guesses" : guesserLabel}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Clue by <span className="font-medium">{authorName}</span>
          </p>
        </div>

        {/* Guess timer bar */}
        {timerActive && (
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Time remaining</span>
              <span className={`text-sm font-mono font-semibold tabular-nums ${timerTextColor}`}>
                {timeLeft === 0 ? "Time's up!" : formatTime(timeLeft ?? 0)}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${timerBarColor}`} style={{ width: `${timerPercent}%` }} />
            </div>
          </div>
        )}

        {/* Clue */}
        <div className="rounded-xl border bg-muted/40 px-6 py-4 text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Clue</p>
          <p className="text-2xl font-semibold text-foreground">{clue}</p>
        </div>

        {/* Dial / Plane */}
        {dialNode}

        {/* Guesser status */}
        {(amIAuthor || amILocked || allGuessersLocked) && (
          <div className="flex flex-col gap-1">
            {guessers.map((g) => {
              const result = guessResults[`${g.id}-${currentEntry.dialIndex}-${currentEntry.authorId}`];
              return (
                <div key={g.id} className="flex items-center gap-2 text-xs">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: g.color }} />
                  <span className="text-muted-foreground">{g.name}{g.id === mp.playerId ? " (you)" : ""}</span>
                  <span className="ml-auto">
                    {allGuessersLocked && result ? (
                      <span className="font-semibold text-foreground">
                        {result.points >= 0 ? "+" : ""}{result.points} pt{Math.abs(result.points) !== 1 ? "s" : ""}
                        {result.doubleDown && <span className="ml-1 text-amber-400 font-bold text-[10px]">2×</span>}
                      </span>
                    ) : !!result ? (
                      <span className="text-muted-foreground">Locked in</span>
                    ) : (
                      <span className="text-muted-foreground">{guessingLabel}<Ellipsis /></span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Actions */}
        {amIGuesser && !amILocked && (
          <div className="flex gap-2">
            <button
              onClick={() => setDoubleDown((v) => !v)}
              title="Double your points if you score anything — lose 2 pts if you miss"
              className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                doubleDown
                  ? "border-amber-500 bg-amber-500/10 text-amber-500"
                  : "border-border text-muted-foreground hover:border-amber-500/50"
              }`}
            >
              Double Down{doubleDown ? " ✓" : ""}
            </button>
            <Button className="flex-1" onClick={handleLockIn}>Lock In</Button>
          </div>
        )}

        {amIGuesser && amILocked && !allGuessersLocked && (
          <p className="text-sm text-center text-muted-foreground">Waiting for others to lock in<Ellipsis /></p>
        )}

        {allGuessersLocked && amIAuthor && (
          <div className="flex items-center gap-3">
            <Button className="flex-1" onClick={handleAdvance}>Next</Button>
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
