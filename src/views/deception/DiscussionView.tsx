import { useEffect, useRef, useState } from "react";
import { useMultiplayer } from "@/context/MultiplayerContext";
import { useGame } from "@/context/GameContext";
import { useStorage, useMutation } from "@/lib/liveblocks";
import { deriveKey, decryptJson } from "@/lib/crypto";
import { PlayerStatusList, DoneNode, WaitingNode } from "@/components/game/PlayerStatusList";
import { Button } from "@/components/ui/button";
import { Ellipsis } from "@/components/ui/ellipsis";
import type { MurdererSolution } from "@/types/deception";

export function DiscussionView() {
  const { mp } = useMultiplayer();
  const { goTo } = useGame();

  const players = useStorage((s) => (s ? Object.entries(s.players) : [])) ?? [];
  const dealtCards = useStorage((s) =>
    s ? (s.deceptionDealtCards as Record<string, { meansCards: string[]; evidenceCards: string[] }>) : {}
  ) ?? {};
  const sceneTiles = useStorage((s) => s?.deceptionSceneTiles ?? null);
  const markers = useStorage((s) =>
    s ? (s.deceptionMarkers as Record<string, number>) : {}
  ) ?? {};
  const accusations = useStorage((s) =>
    s ? (s.deceptionAccusations as Record<string, { accusedPlayerId: string; meansCard: string; evidenceCard: string }>) : {}
  ) ?? {};
  const eliminatedPlayers = useStorage((s) =>
    s ? (s.deceptionEliminatedPlayers as Record<string, boolean>) : {}
  ) ?? {};
  const encryptedSolution = useStorage((s) => s?.deceptionEncryptedSolutionForHost ?? null);
  const currentRound = useStorage((s) => s?.deceptionCurrentRound ?? 1) ?? 1;
  const totalRounds = useStorage((s) => s?.totalRounds ?? 3) ?? 3;
  const phase = useStorage((s) => s?.deceptionPhase);

  // Host-only: decrypted solution for checking accusations
  const [solution, setSolution] = useState<MurdererSolution | null>(null);
  const processedAccusers = useRef(new Set<string>());

  const [accusedPlayerId, setAccusedPlayerId] = useState<string | null>(null);
  const [accusedMeans, setAccusedMeans] = useState<string | null>(null);
  const [accusedEvidence, setAccusedEvidence] = useState<string | null>(null);

  // Mutations must be declared before effects
  const submitAccusation = useMutation(
    ({ storage }, playerId: string, accusedId: string, means: string, evidence: string) => {
      storage.get("deceptionAccusations").set(playerId, {
        accusedPlayerId: accusedId,
        meansCard: means,
        evidenceCard: evidence,
      });
    },
    [],
  );

  const eliminatePlayer = useMutation(({ storage }, playerId: string) => {
    storage.get("deceptionEliminatedPlayers").set(playerId, true);
  }, []);

  const endWithInvestigatorsWin = useMutation(
    ({ storage }, murdererPlayerId: string, sol: MurdererSolution) => {
      storage.set("deceptionRevealedSolution", { murdererPlayerId, ...sol });
      storage.set("deceptionPhase", "results");
    },
    [],
  );

  const endWithMurdererWins = useMutation(
    ({ storage }, murdererPlayerId: string, sol: MurdererSolution) => {
      storage.set("deceptionRevealedSolution", { murdererPlayerId, ...sol });
      storage.set("deceptionPhase", "results");
    },
    [],
  );

  const advanceToNextRound = useMutation(({ storage }) => {
    storage.set("deceptionCurrentRound", (storage.get("deceptionCurrentRound") ?? 1) + 1);
    storage.set("deceptionFsHasSwappedThisRound", false);
    storage.set("deceptionPhase", "fs-placement");
    storage.set("deceptionFsTimerStart", Date.now());
    const acc = storage.get("deceptionAccusations");
    for (const k of acc.keys()) acc.delete(k);
  }, []);

  // Host: decrypt solution once on mount
  useEffect(() => {
    if (!mp.isHost || !encryptedSolution || solution) return;
    deriveKey(mp.roomCode, mp.playerId)
      .then((key) => decryptJson(encryptedSolution, key))
      .then((data) => setSolution(data as MurdererSolution))
      .catch(() => {});
  }, [encryptedSolution]);

  // Host: check each new accusation as it arrives
  useEffect(() => {
    if (!mp.isHost || !solution) return;
    const murdererPlayerId = Object.entries(dealtCards).find(([, hand]) =>
      hand.meansCards.includes(solution.meansCard) &&
      hand.evidenceCards.includes(solution.evidenceCard)
    )?.[0];
    if (!murdererPlayerId) return;

    for (const [accuserId, acc] of Object.entries(accusations)) {
      if (processedAccusers.current.has(accuserId)) continue;
      processedAccusers.current.add(accuserId);

      const isCorrect =
        acc.accusedPlayerId === murdererPlayerId &&
        acc.meansCard === solution.meansCard &&
        acc.evidenceCard === solution.evidenceCard;

      if (isCorrect) {
        endWithInvestigatorsWin(murdererPlayerId, solution);
        return;
      } else {
        eliminatePlayer(accuserId);
      }
    }

    // Check if all non-eliminated investigators are now eliminated
    const investigatorIds = players
      .map(([id]) => id)
      .filter((id) => !dealtCards[id] || (
        // A player is an investigator if they're not the murderer
        // We can determine this: the murderer holds the solution cards
        !(dealtCards[id]?.meansCards.includes(solution.meansCard) &&
          dealtCards[id]?.evidenceCards.includes(solution.evidenceCard))
      ));
    const allEliminated = investigatorIds.every((id) => eliminatedPlayers[id] || accusations[id]);
    if (allEliminated && investigatorIds.length > 0 && Object.keys(accusations).length > 0) {
      endWithMurdererWins(murdererPlayerId, solution);
    }
  }, [accusations, solution]);

  useEffect(() => {
    if (phase === "fs-placement") goTo("deceptionFsPlacement");
    if (phase === "results") goTo("deceptionResults");
  }, [phase]);

  const iAmEliminated = eliminatedPlayers[mp.playerId] === true;
  const iHaveAccused = !!accusations[mp.playerId];
  const isFinalRound = currentRound >= totalRounds;
  const accusedHand = accusedPlayerId ? dealtCards[accusedPlayerId] : null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-background px-4 py-8 pb-24 overflow-y-auto">
      <div className="w-full max-w-md flex flex-col gap-6">
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
            Round {currentRound} of {totalRounds} · Discussion
          </p>
          <h2 className="text-xl font-semibold">Who is the murderer?</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Study the scene markers and discuss with your group
          </p>
        </div>

        {/* Eliminated banner */}
        {iAmEliminated && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-center text-destructive">
            Your accusation was wrong. You're eliminated — spectate only.
          </div>
        )}

        {/* Scene tiles */}
        {sceneTiles && (
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Scene Markers</p>
            <div className="grid grid-cols-2 gap-2">
              {sceneTiles.map((tile) => {
                const chosen = markers[tile.category];
                return (
                  <div key={tile.category} className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{tile.category}</p>
                    <p className="text-sm font-medium mt-0.5 text-foreground">
                      {chosen !== undefined
                        ? tile.options[chosen]
                        : <span className="italic text-muted-foreground/50">No marker</span>}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Players' cards */}
        <div className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Players' Cards</p>
          {players.map(([id, info]) => {
            const hand = dealtCards[id];
            if (!hand) return null;
            const isEliminated = eliminatedPlayers[id];
            return (
              <div
                key={id}
                className={`rounded-xl border bg-muted/20 px-4 py-3 flex flex-col gap-2 ${
                  isEliminated ? "opacity-50" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: info.color }} />
                  <span className="text-sm font-medium text-foreground">
                    {info.name}{id === mp.playerId ? " (you)" : ""}
                  </span>
                  {isEliminated && (
                    <span className="ml-auto text-[10px] text-destructive/70 uppercase tracking-wide">eliminated</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Means</p>
                    {hand.meansCards.map((c) => (
                      <p key={c} className="text-xs text-foreground">{c}</p>
                    ))}
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Evidence</p>
                    {hand.evidenceCards.map((c) => (
                      <p key={c} className="text-xs text-foreground">{c}</p>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Accusation form — any round, any non-eliminated investigator */}
        {!iAmEliminated && !iHaveAccused && (
          <div className="flex flex-col gap-4 rounded-xl border border-primary/30 bg-primary/5 px-4 py-4">
            <div>
              <p className="text-sm font-medium">Make your accusation</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                One shot only — wrong and you're out
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-muted-foreground uppercase tracking-widest">Suspect</p>
              <div className="flex flex-wrap gap-1.5">
                {players.map(([id, info]) => (
                  <button
                    key={id}
                    onClick={() => { setAccusedPlayerId(id); setAccusedMeans(null); setAccusedEvidence(null); }}
                    className={`px-2.5 py-1 rounded-lg border text-xs transition-colors cursor-pointer ${
                      accusedPlayerId === id
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {info.name}
                  </button>
                ))}
              </div>
            </div>

            {accusedHand && (
              <>
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs text-muted-foreground uppercase tracking-widest">Their weapon</p>
                  <div className="flex flex-wrap gap-1.5">
                    {accusedHand.meansCards.map((c) => (
                      <button key={c} onClick={() => setAccusedMeans(c)}
                        className={`px-2.5 py-1 rounded-lg border text-xs transition-colors cursor-pointer ${
                          accusedMeans === c ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/40"
                        }`}>{c}</button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs text-muted-foreground uppercase tracking-widest">Their evidence</p>
                  <div className="flex flex-wrap gap-1.5">
                    {accusedHand.evidenceCards.map((c) => (
                      <button key={c} onClick={() => setAccusedEvidence(c)}
                        className={`px-2.5 py-1 rounded-lg border text-xs transition-colors cursor-pointer ${
                          accusedEvidence === c ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/40"
                        }`}>{c}</button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <Button
              disabled={!accusedPlayerId || !accusedMeans || !accusedEvidence}
              onClick={() => submitAccusation(mp.playerId, accusedPlayerId!, accusedMeans!, accusedEvidence!)}
              className="w-full"
            >
              Submit Accusation
            </Button>
          </div>
        )}

        {iHaveAccused && !iAmEliminated && (
          <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm">
            <p className="text-muted-foreground mb-1">Your accusation — waiting for verdict</p>
            <p className="font-medium">
              {players.find(([id]) => id === accusations[mp.playerId].accusedPlayerId)?.[1].name ?? "?"}
              {" · "}{accusations[mp.playerId].meansCard}
              {" · "}{accusations[mp.playerId].evidenceCard}
            </p>
          </div>
        )}

        {/* Status list */}
        <PlayerStatusList
          myPlayerId={mp.playerId}
          entries={players.map(([id, info]) => ({
            id,
            name: info.name,
            color: info.color,
            rightNode: eliminatedPlayers[id]
              ? <span className="text-destructive/70 text-xs">Eliminated</span>
              : accusations[id]
                ? <DoneNode label="Accused" />
                : <WaitingNode label="Thinking" />,
          }))}
        />

        {/* Host controls */}
        {mp.isHost && (
          <div className="flex flex-col gap-2 pt-2 border-t border-border">
            {!isFinalRound && (
              <Button onClick={advanceToNextRound} className="w-full">
                Next Round →
              </Button>
            )}
            {isFinalRound && solution && (
              <Button
                variant="outline"
                onClick={() => {
                  const murdererPlayerId = Object.entries(dealtCards).find(([, hand]) =>
                    hand.meansCards.includes(solution.meansCard) &&
                    hand.evidenceCards.includes(solution.evidenceCard)
                  )?.[0] ?? "";
                  endWithMurdererWins(murdererPlayerId, solution);
                }}
                className="w-full"
              >
                End Game — Murderer Escapes
              </Button>
            )}
          </div>
        )}

        {!mp.isHost && (
          <p className="text-sm text-center text-muted-foreground">
            {isFinalRound ? "Final round" : "Discuss, then wait for host to advance"}
            {!isFinalRound && <Ellipsis />}
          </p>
        )}
      </div>
    </div>
  );
}
