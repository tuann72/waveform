import { useEffect, useState } from "react";
import { useMultiplayer } from "@/context/MultiplayerContext";
import { useGame } from "@/context/GameContext";
import { useStorage, useMutation } from "@/lib/liveblocks";
import { deriveKey, decryptJson } from "@/lib/crypto";
import { useCountdown } from "@/hooks/useCountdown";
import { TimerBar } from "@/components/game/TimerBar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Ellipsis } from "@/components/ui/ellipsis";
import type { DeceptionRoleBlob, MurdererSolution } from "@/types/deception";

const PERMANENT_INDICES = new Set([0, 1]); // Location, Cause of Death

export function FsPlacementView() {
  const { mp } = useMultiplayer();
  const { goTo } = useGame();

  const sceneTiles = useStorage((s) => s?.deceptionSceneTiles ?? null);
  const tilePool = useStorage((s) => s?.deceptionTilePool ?? []) ?? [];
  const rerolledTiles = useStorage((s) => s?.deceptionFsRerolledTiles ?? []) ?? [];
  const markers = useStorage((s) =>
    s ? (s.deceptionMarkers as Record<string, number>) : {}
  ) ?? {};
  const fsTimerDuration = useStorage((s) => s?.deceptionFsTimerDuration ?? 120) ?? 120;
  const fsTimerStart = useStorage((s) => s?.deceptionFsTimerStart ?? null) ?? null;
  const currentRound = useStorage((s) => s?.deceptionCurrentRound ?? 1) ?? 1;
  const totalRounds = useStorage((s) => s?.totalRounds ?? 3) ?? 3;
  const encryptedRoles = useStorage((s) =>
    s ? (s.deceptionEncryptedRoles as Record<string, string>) : {}
  ) ?? {};
  const encryptedSolutionForFs = useStorage((s) => s?.deceptionEncryptedSolutionForFs ?? null);
  const dealtCards = useStorage((s) =>
    s ? (s.deceptionDealtCards as Record<string, { meansCards: string[]; evidenceCards: string[] }>) : {}
  ) ?? {};
  const players = useStorage((s) => (s ? Object.entries(s.players) : [])) ?? [];
  const phase = useStorage((s) => s?.deceptionPhase);

  const [myRole, setMyRole] = useState<DeceptionRoleBlob | null>(null);
  const [fsSolution, setFsSolution] = useState<MurdererSolution | null>(null);

  const timeLeft = useCountdown(fsTimerStart, fsTimerDuration, 500);
  const isFs = myRole?.role === "forensic-scientist";

  useEffect(() => {
    const blob = encryptedRoles[mp.playerId];
    if (!blob) return;
    deriveKey(mp.roomCode, mp.playerId)
      .then((key) => decryptJson(blob, key))
      .then((data) => setMyRole(data as DeceptionRoleBlob))
      .catch(() => {});
  }, [encryptedRoles[mp.playerId]]);

  useEffect(() => {
    if (!encryptedSolutionForFs || fsSolution) return;
    deriveKey(mp.roomCode, mp.playerId)
      .then((key) => decryptJson(encryptedSolutionForFs, key))
      .then((data) => setFsSolution(data as MurdererSolution))
      .catch(() => {});
  }, [encryptedSolutionForFs]);

  const setMarker = useMutation(({ storage }, category: string, optionIndex: number) => {
    storage.get("deceptionMarkers").set(category, optionIndex);
  }, []);

  const rerollTile = useMutation(({ storage }, tileIndex: number) => {
    const pool = storage.get("deceptionTilePool") as Array<{ category: string; options: string[] }>;
    const tiles = storage.get("deceptionSceneTiles") as Array<{ category: string; options: string[] }> | null;
    if (!pool || pool.length === 0 || !tiles) return;
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const poolIdx = buf[0] % pool.length;
    const incoming = pool[poolIdx];
    const outgoing = tiles[tileIndex];
    const newTiles = [...tiles];
    newTiles[tileIndex] = incoming;
    const newPool = [...pool.slice(0, poolIdx), outgoing, ...pool.slice(poolIdx + 1)];
    storage.set("deceptionSceneTiles", newTiles);
    storage.set("deceptionTilePool", newPool);
    storage.set("deceptionFsRerolledTiles", [...(storage.get("deceptionFsRerolledTiles") as number[]), tileIndex]);
    storage.get("deceptionMarkers").delete(outgoing.category);
  }, []);

  const advanceToDiscussion = useMutation(({ storage }) => {
    storage.set("deceptionPhase", "discussion");
    storage.set("deceptionFsTimerStart", null);
    storage.set("deceptionDiscussionTimerStart", Date.now());
  }, []);

  // Timer expiry: host advances
  useEffect(() => {
    if (timeLeft !== 0 || !fsTimerDuration || !mp.isHost) return;
    advanceToDiscussion();
  }, [timeLeft]);

  useEffect(() => {
    if (phase === "discussion") goTo("deceptionDiscussion");
    if (phase === "results") goTo("deceptionResults");
  }, [phase]);

  if (!sceneTiles) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading scene<Ellipsis /></p>
      </div>
    );
  }

  const canReroll = (tileIndex: number) => isFs && !rerolledTiles.includes(tileIndex) && tilePool.length > 0;

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-background px-4 py-8 overflow-y-auto">
      <div className="w-full max-w-md flex flex-col gap-5">
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
            Round {currentRound} of {totalRounds}
          </p>
          <h2 className="text-xl font-semibold">
            {isFs ? "Place Your Scene Markers" : "Forensic Scientist is analysing…"}
          </h2>
          {isFs && (
            <p className="text-sm text-muted-foreground mt-1">
              Adjust markers freely · swap one non-permanent tile per round
            </p>
          )}
        </div>

        <TimerBar timeLeft={fsTimerDuration > 0 ? timeLeft : null} duration={fsTimerDuration} label="Placement time" />

        <div className="flex flex-col gap-3">
          {sceneTiles.map((tile, tileIndex) => {
            const isPermanent = PERMANENT_INDICES.has(tileIndex);
            const selectedOption = markers[tile.category] ?? null;

            return (
              <div
                key={tile.category}
                className="rounded-xl border bg-muted/30 px-4 py-3 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    {tile.category}
                    {isPermanent && <span className="ml-1.5 text-muted-foreground/50">·fixed</span>}
                  </p>
                  {isFs && !isPermanent && (
                    rerolledTiles.includes(tileIndex) ? (
                      <span className="text-[10px] text-muted-foreground/40">rerolled</span>
                    ) : (
                      <button
                        onClick={() => canReroll(tileIndex) && rerollTile(tileIndex)}
                        disabled={!canReroll(tileIndex)}
                        className="text-[10px] px-2 py-0.5 rounded border border-border text-muted-foreground hover:border-amber-500/50 transition-colors cursor-pointer disabled:cursor-default disabled:opacity-40"
                      >
                        reroll
                      </button>
                    )
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {tile.options.map((option, optIndex) => {
                    const isSelected = selectedOption === optIndex;
                    return (
                      <button
                        key={option}
                        onClick={() => isFs && setMarker(tile.category, optIndex)}
                        disabled={!isFs}
                        className={`px-2.5 py-1 rounded-lg border text-xs transition-colors ${
                          isFs ? "cursor-pointer" : "cursor-default"
                        } ${
                          isSelected
                            ? "border-primary bg-primary/15 text-foreground font-medium"
                            : "border-border text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {option}
                        {isSelected && <span className="ml-1 text-primary">●</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {isFs && (
          <Button onClick={advanceToDiscussion} className="w-full">
            Done — Start Discussion
          </Button>
        )}

        {/* FS card reference */}
        {isFs && (
          <>
            <Separator />
            <div className="flex flex-col gap-3">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Players' Cards</p>
              {fsSolution && (
                <div className="rounded-lg border border-red-400/30 bg-red-400/5 px-4 py-2.5 text-sm">
                  <p className="text-[10px] uppercase tracking-widest text-red-400/70 mb-1">Murder weapon &amp; key evidence</p>
                  <p className="font-medium text-red-400">{fsSolution.meansCard} · {fsSolution.evidenceCard}</p>
                </div>
              )}
              {players.map(([id, info]) => {
                const hand = dealtCards[id];
                if (!hand) return null;
                const isMurderer = myRole?.murdererPlayerId === id;
                return (
                  <div key={id} className={`rounded-xl border px-4 py-3 flex flex-col gap-2 ${isMurderer ? "border-red-400/40 bg-red-400/5" : "bg-muted/20"}`}>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: info.color }} />
                      <span className="text-sm font-medium text-foreground">
                        {info.name}{id === mp.playerId ? " (you)" : ""}
                      </span>
                      {isMurderer && <span className="ml-auto text-[10px] text-red-400 uppercase tracking-wide">murderer</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Means</p>
                        {hand.meansCards.map((c) => (
                          <p key={c} className={`text-xs ${fsSolution?.meansCard === c ? "text-red-400 font-semibold" : "text-foreground"}`}>{c}</p>
                        ))}
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Evidence</p>
                        {hand.evidenceCards.map((c) => (
                          <p key={c} className={`text-xs ${fsSolution?.evidenceCard === c ? "text-red-400 font-semibold" : "text-foreground"}`}>{c}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {!isFs && (
          <p className="text-sm text-center text-muted-foreground">
            Waiting for the Forensic Scientist<Ellipsis />
          </p>
        )}
        {mp.isHost && !isFs && (
          <Button variant="outline" size="sm" onClick={advanceToDiscussion} className="w-full">
            Skip Placement
          </Button>
        )}
      </div>
    </div>
  );
}
