import { useGame } from "@/context/GameContext";
import { useMultiplayer } from "@/context/MultiplayerContext";
import { useStorage } from "@/lib/liveblocks";
import type { DialConfig } from "@/lib/liveblocks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export function MultiResultsView() {
  const { goTo } = useGame();
  const { mp, clearRoom } = useMultiplayer();

  const players = useStorage((s) => s ? Object.entries(s.players) : []) ?? [];
  const queue = useStorage((s) => s ? [...s.guessingQueue] : []) ?? [];
  const guessResults = useStorage((s) => s ? s.guessResults as Record<string, { position: number; points: number }> : {} as Record<string, { position: number; points: number }>) ?? {};
  const playerDials = useStorage((s) => s ? s.playerDials as Record<string, DialConfig[]> : {} as Record<string, DialConfig[]>) ?? {};
  const playerClues = useStorage((s) => s ? s.playerClues as Record<string, string[]> : {} as Record<string, string[]>) ?? {};

  // Compute total score per player (guesser accumulates points)
  const scoreMap: Record<string, number> = {};
  for (const [id] of players) scoreMap[id] = 0;
  for (const entry of queue) {
    const key = `${entry.guesserId}-${entry.dialIndex}-${entry.authorId}`;
    const res = guessResults[key];
    if (res && entry.guesserId in scoreMap) {
      scoreMap[entry.guesserId] += res.points;
    }
  }

  const ranked = [...players].sort(([a], [b]) => (scoreMap[b] ?? 0) - (scoreMap[a] ?? 0));
  const winner = ranked[0];
  const maxScore = winner ? scoreMap[winner[0]] : 0;

  function handleLeave() {
    clearRoom();
    goTo("start");
  }

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
          {queue.reduce<{ dialIndex: number; authorId: string }[]>((acc, e) => {
            if (!acc.find((x) => x.dialIndex === e.dialIndex && x.authorId === e.authorId)) {
              acc.push({ dialIndex: e.dialIndex, authorId: e.authorId });
            }
            return acc;
          }, []).map(({ dialIndex, authorId }) => {
            const dial = playerDials[authorId]?.[dialIndex];
            const authorName = players.find(([id]) => id === authorId)?.[1].name ?? "?";
            const clue = playerClues[authorId]?.[dialIndex] ?? "";
            const guessers = queue.filter((e) => e.dialIndex === dialIndex && e.authorId === authorId);
            return (
              <div key={`${dialIndex}-${authorId}`} className="rounded-lg border p-3 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{dial ? `${dial.left} ↔ ${dial.right}` : "…"}</span>
                  <span>by {authorName}</span>
                </div>
                <p className="text-sm font-medium">"{clue}"</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {guessers.map((e) => {
                    const key = `${e.guesserId}-${dialIndex}-${authorId}`;
                    const res = guessResults[key];
                    const gName = players.find(([id]) => id === e.guesserId)?.[1].name ?? "?";
                    return (
                      <div key={key} className="text-xs flex items-center gap-1">
                        <span className="text-muted-foreground">{gName}:</span>
                        <span className="font-medium">+{res?.points ?? 0}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <Button onClick={handleLeave}>Play Again</Button>
      </div>
    </div>
  );
}
