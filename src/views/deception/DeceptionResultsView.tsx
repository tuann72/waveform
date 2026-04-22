import { useEffect } from "react";
import { useMultiplayer } from "@/context/MultiplayerContext";
import { useGame } from "@/context/GameContext";
import { useStorage, useMutation, clearGameData } from "@/lib/liveblocks";
import { Button } from "@/components/ui/button";
import { useLeaveRoom } from "@/hooks/useLeaveRoom";

export function DeceptionResultsView() {
  const { mp } = useMultiplayer();
  const { goTo } = useGame();
  const { leaving, handleLeave } = useLeaveRoom();

  const players = useStorage((s) => (s ? Object.entries(s.players) : [])) ?? [];
  const accusations = useStorage((s) =>
    s ? (s.deceptionAccusations as Record<string, { accusedPlayerId: string; meansCard: string; evidenceCard: string }>) : {}
  ) ?? {};
  const revealedSolution = useStorage((s) => s?.deceptionRevealedSolution ?? null);
  const dealtCards = useStorage((s) =>
    s ? (s.deceptionDealtCards as Record<string, { meansCards: string[]; evidenceCards: string[] }>) : {}
  ) ?? {};
  const deceptionPhase = useStorage((s) => s?.deceptionPhase);

  // Non-host: navigate to waiting room when host resets via Play Again
  useEffect(() => {
    if (!mp.isHost && deceptionPhase === null) goTo("waitingRoom");
  }, [deceptionPhase, mp.isHost]);

  const resetGame = useMutation(({ storage }) => {
    clearGameData(storage);
  }, []);

  function handlePlayAgain() {
    resetGame();
    goTo("waitingRoom");
  }

  const playerMap = Object.fromEntries(players);

  if (!revealedSolution) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Revealing the truth…</p>
      </div>
    );
  }

  const murdererName = playerMap[revealedSolution.murdererPlayerId]?.name ?? "Unknown";
  const murdererColor = playerMap[revealedSolution.murdererPlayerId]?.color ?? "#888";

  const correctAccusers = players
    .map(([id]) => id)
    .filter((id) => {
      const acc = accusations[id];
      return (
        acc &&
        acc.accusedPlayerId === revealedSolution.murdererPlayerId &&
        acc.meansCard === revealedSolution.meansCard &&
        acc.evidenceCard === revealedSolution.evidenceCard
      );
    });

  const investigatorsWin = correctAccusers.length > 0;

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-background px-4 py-8 pb-24 overflow-y-auto">
      <div className="w-full max-w-sm flex flex-col gap-6">
        {/* Outcome banner */}
        <div className={`rounded-xl border px-5 py-4 text-center ${
          investigatorsWin
            ? "border-green-500/40 bg-green-500/10"
            : "border-red-500/40 bg-red-500/10"
        }`}>
          <p className="text-lg font-bold">
            {investigatorsWin ? "Investigators Win!" : "The Murderer Escapes!"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {investigatorsWin
              ? `${correctAccusers.length} investigator${correctAccusers.length !== 1 ? "s" : ""} solved the case`
              : "No one identified the murderer correctly"}
          </p>
        </div>

        {/* The truth */}
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">The Murderer</p>
          <div className="rounded-xl border bg-muted/30 px-4 py-3 flex items-center gap-3">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: murdererColor }} />
            <span className="font-semibold text-foreground">{murdererName}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <div className="rounded-lg border bg-muted/20 px-3 py-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Weapon</p>
              <p className="text-sm font-medium text-foreground mt-0.5">{revealedSolution.meansCard}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 px-3 py-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Evidence</p>
              <p className="text-sm font-medium text-foreground mt-0.5">{revealedSolution.evidenceCard}</p>
            </div>
          </div>
        </div>

        {/* Accusations breakdown */}
        {Object.keys(accusations).length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Accusations</p>
            {players.map(([id, info]) => {
              const acc = accusations[id];
              if (!acc) return null;
              const isCorrect =
                acc.accusedPlayerId === revealedSolution.murdererPlayerId &&
                acc.meansCard === revealedSolution.meansCard &&
                acc.evidenceCard === revealedSolution.evidenceCard;
              return (
                <div
                  key={id}
                  className={`rounded-lg border px-3 py-2 flex items-start gap-2 ${
                    isCorrect ? "border-green-500/40 bg-green-500/5" : "border-border"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ background: info.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">{info.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {playerMap[acc.accusedPlayerId]?.name ?? "?"} · {acc.meansCard} · {acc.evidenceCard}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold flex-shrink-0 ${isCorrect ? "text-green-400" : "text-muted-foreground"}`}>
                    {isCorrect ? "✓ Correct" : "✗ Wrong"}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <Button className="w-full" onClick={handlePlayAgain}>
          Play Again
        </Button>
        <Button variant="ghost" className="w-full text-muted-foreground" onClick={handleLeave} disabled={leaving}>
          {leaving ? "Leaving…" : "Leave Room"}
        </Button>
      </div>
    </div>
  );
}
