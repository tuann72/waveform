import { useEffect } from "react";
import { useGame } from "@/context/GameContext";
import { useMultiplayer } from "@/context/MultiplayerContext";
import { useStorage, useMutation } from "@/lib/liveblocks";
import type { DialConfig } from "@/lib/liveblocks";
import { SpectrumDial } from "@/components/game/SpectrumDial";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export function MultiResultsView() {
  const { goTo } = useGame();
  const { mp } = useMultiplayer();

  const players = useStorage((s) => s ? Object.entries(s.players) : []) ?? [];
  const queue = useStorage((s) => s ? [...s.guessingQueue] : []) ?? [];
  const guessResults = useStorage((s) => s ? s.guessResults as Record<string, { position: number; points: number }> : {} as Record<string, { position: number; points: number }>) ?? {};
  const playerDials = useStorage((s) => s ? s.playerDials as Record<string, DialConfig[]> : {} as Record<string, DialConfig[]>) ?? {};
  const playerClues = useStorage((s) => s ? s.playerClues as Record<string, string[]> : {} as Record<string, string[]>) ?? {};
  const phase = useStorage((s) => s?.phase);

  // Non-hosts follow when host resets to lobby
  useEffect(() => {
    if (!mp.isHost && phase === "lobby") goTo("waitingRoom");
  }, [phase]);

  // Reset game data but keep players (colors + host status intact)
  const resetForNewGame = useMutation(({ storage }) => {
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
    // players LiveMap intentionally kept — preserves colors and host assignment
  }, []);

  function handlePlayAgain() {
    resetForNewGame();
    goTo("waitingRoom");
  }

  // Compute scores
  const scoreMap: Record<string, number> = {};
  for (const [id] of players) scoreMap[id] = 0;
  for (const [key, res] of Object.entries(guessResults)) {
    const parts = key.split("-");
    if (parts.length === 3) {
      const guesserId = parts[0];
      if (guesserId in scoreMap) scoreMap[guesserId] += res.points;
    }
  }

  const ranked = [...players].sort(([a], [b]) => (scoreMap[b] ?? 0) - (scoreMap[a] ?? 0));
  const winner = ranked[0];
  const maxScore = winner ? scoreMap[winner[0]] : 0;

  const breakdownEntries = queue.reduce<{ dialIndex: number; authorId: string }[]>((acc, e) => {
    if (!acc.find((x) => x.dialIndex === e.dialIndex && x.authorId === e.authorId)) {
      acc.push({ dialIndex: e.dialIndex, authorId: e.authorId });
    }
    return acc;
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-4 py-8">
      <div className="w-full max-w-sm flex flex-col gap-6">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-3xl font-bold">Results</h2>
          {winner && (
            <p className="text-muted-foreground mt-1">
              <span className="font-semibold text-foreground">{winner[1].name}</span> wins with {maxScore} pts!
            </p>
          )}
        </div>

        {/* Leaderboard */}
        <div className="flex flex-col gap-2">
          {ranked.map(([id, info], i) => (
            <div key={id} className="flex items-center gap-3 py-2">
              <span className="text-lg font-bold w-6 text-muted-foreground">{i + 1}</span>
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: info.color }} />
              <div className="flex-1">
                <span className="text-sm font-medium">{info.name}</span>
                {id === mp.playerId && (
                  <span className="text-xs text-muted-foreground ml-1">(you)</span>
                )}
                {info.isHost && (
                  <Badge variant="secondary" className="ml-2 text-xs">Host</Badge>
                )}
              </div>
              <span className="text-lg font-bold">{scoreMap[id] ?? 0}</span>
            </div>
          ))}
        </div>

        <Separator />

        {/* Round breakdown */}
        <div className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Round Breakdown</p>
          {breakdownEntries.map(({ dialIndex, authorId }) => {
            const dial = playerDials[authorId]?.[dialIndex];
            const authorInfo = players.find(([id]) => id === authorId)?.[1];
            const authorName = authorInfo?.name ?? "?";
            const clue = playerClues[authorId]?.[dialIndex] ?? "";
            const guessers = players.filter(([id]) => id !== authorId);
            const extraNeedles = guessers.flatMap(([gid, ginfo]) => {
              const res = guessResults[`${gid}-${dialIndex}-${authorId}`];
              return res ? [{ position: res.position, color: ginfo.color }] : [];
            });
            return (
              <div key={`${dialIndex}-${authorId}`} className="rounded-lg border p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    {authorInfo && <span className="w-1.5 h-1.5 rounded-full" style={{ background: authorInfo.color }} />}
                    <span>by {authorName}</span>
                  </div>
                  <p className="text-sm font-medium">"{clue}"</p>
                </div>

                {dial && (
                  <SpectrumDial
                    card={dial}
                    dialPosition={50}
                    onDialChange={() => {}}
                    showTarget={true}
                    targetPosition={dial.targetPosition}
                    disabled={true}
                    hideNeedle={true}
                    extraNeedles={extraNeedles}
                  />
                )}

                <div className="flex flex-wrap gap-2">
                  {guessers.map(([gid, ginfo]) => {
                    const res = guessResults[`${gid}-${dialIndex}-${authorId}`];
                    return (
                      <div key={gid} className="flex items-center gap-1 text-xs">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: ginfo.color }} />
                        <span className="text-muted-foreground">{ginfo.name}:</span>
                        <span className="font-medium">+{res?.points ?? 0}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {mp.isHost ? (
          <Button onClick={handlePlayAgain}>Play Again</Button>
        ) : (
          <p className="text-sm text-center text-muted-foreground">Waiting for host to start a new game…</p>
        )}
      </div>
    </div>
  );
}
