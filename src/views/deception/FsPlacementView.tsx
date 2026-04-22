import { useEffect, useState } from "react";
import { useMultiplayer } from "@/context/MultiplayerContext";
import { useGame } from "@/context/GameContext";
import { useStorage, useMutation } from "@/lib/liveblocks";
import { deriveKey, decryptJson } from "@/lib/crypto";
import { useCountdown } from "@/hooks/useCountdown";
import { TimerBar } from "@/components/game/TimerBar";
import { Button } from "@/components/ui/button";
import { Ellipsis } from "@/components/ui/ellipsis";
import type { DeceptionRoleBlob } from "@/types/deception";

const PERMANENT_INDICES = new Set([0, 1]); // Location, Cause of Death

export function FsPlacementView() {
  const { mp } = useMultiplayer();
  const { goTo } = useGame();

  const sceneTiles = useStorage((s) => s?.deceptionSceneTiles ?? null);
  const tilePool = useStorage((s) => s?.deceptionTilePool ?? []) ?? [];
  const hasSwapped = useStorage((s) => s?.deceptionFsHasSwappedThisRound ?? false) ?? false;
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
  const phase = useStorage((s) => s?.deceptionPhase);

  const [myRole, setMyRole] = useState<DeceptionRoleBlob | null>(null);
  const [swapTarget, setSwapTarget] = useState<number | null>(null);

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

  const setMarker = useMutation(({ storage }, category: string, optionIndex: number) => {
    storage.get("deceptionMarkers").set(category, optionIndex);
  }, []);

  const swapTile = useMutation(({ storage }, tileIndex: number) => {
    const pool = storage.get("deceptionTilePool") as Array<{ category: string; options: string[] }>;
    const tiles = storage.get("deceptionSceneTiles") as Array<{ category: string; options: string[] }> | null;
    if (!pool || pool.length === 0 || !tiles) return;
    const poolIdx = Math.floor(Math.random() * pool.length);
    const incoming = pool[poolIdx];
    const outgoing = tiles[tileIndex];
    const newTiles = [...tiles];
    newTiles[tileIndex] = incoming;
    const newPool = [...pool.slice(0, poolIdx), outgoing, ...pool.slice(poolIdx + 1)];
    storage.set("deceptionSceneTiles", newTiles);
    storage.set("deceptionTilePool", newPool);
    storage.set("deceptionFsHasSwappedThisRound", true);
    // Remove stale marker for the swapped-out tile
    storage.get("deceptionMarkers").delete(outgoing.category);
  }, []);

  const advanceToDiscussion = useMutation(({ storage }) => {
    storage.set("deceptionPhase", "discussion");
    storage.set("deceptionFsTimerStart", null);
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

  const canSwap = isFs && !hasSwapped && tilePool.length > 0;

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
            const isSwapTarget = swapTarget === tileIndex;

            return (
              <div
                key={tile.category}
                className={`rounded-xl border bg-muted/30 px-4 py-3 flex flex-col gap-2 transition-colors ${
                  isSwapTarget ? "border-amber-500/50 bg-amber-500/5" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    {tile.category}
                    {isPermanent && <span className="ml-1.5 text-muted-foreground/50">·fixed</span>}
                  </p>
                  {isFs && !isPermanent && (
                    canSwap ? (
                      <button
                        onClick={() => setSwapTarget(isSwapTarget ? null : tileIndex)}
                        className={`text-[10px] px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                          isSwapTarget
                            ? "border-amber-500 text-amber-500 bg-amber-500/10"
                            : "border-border text-muted-foreground hover:border-amber-500/50"
                        }`}
                      >
                        {isSwapTarget ? "cancel" : "swap"}
                      </button>
                    ) : hasSwapped ? (
                      <span className="text-[10px] text-muted-foreground/40">swapped</span>
                    ) : null
                  )}
                </div>

                {isSwapTarget ? (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs text-amber-500/80">Replace this tile with a random new one?</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-amber-500/50 text-amber-500 hover:bg-amber-500/10 w-full"
                      onClick={() => { swapTile(tileIndex); setSwapTarget(null); }}
                    >
                      Confirm Swap
                    </Button>
                  </div>
                ) : (
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
                )}
              </div>
            );
          })}
        </div>

        {isFs && (
          <Button onClick={advanceToDiscussion} className="w-full">
            Done — Start Discussion
          </Button>
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
