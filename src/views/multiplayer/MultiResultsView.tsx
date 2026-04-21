import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useGame } from "@/context/GameContext";
import { useMultiplayer } from "@/context/MultiplayerContext";
import { useStorage, useMutation, clearGameData } from "@/lib/liveblocks";
import type { DialConfig } from "@/lib/liveblocks";
import { useLeaveRoom } from "@/hooks/useLeaveRoom";
import { EmojiReactions } from "@/components/game/EmojiReactions";
import { SpectrumDial } from "@/components/game/SpectrumDial";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Ellipsis } from "@/components/ui/ellipsis";

export function MultiResultsView() {
  const { goTo } = useGame();
  const { mp } = useMultiplayer();
  const { leaving, handleLeave } = useLeaveRoom();
  const [breakdownView, setBreakdownView] = useState<"round" | "player">("round");
  const [closedRoundGroups, setClosedRoundGroups] = useState(new Set<number>());
  const [closedRounds, setClosedRounds] = useState(new Set<string>());
  const [closedPlayers, setClosedPlayers] = useState(new Set<string>());

  function toggleRoundGroup(dialIndex: number) {
    setClosedRoundGroups((prev) => {
      const next = new Set(prev);
      next.has(dialIndex) ? next.delete(dialIndex) : next.add(dialIndex);
      return next;
    });
  }

  function toggleRound(key: string) {
    setClosedRounds((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function togglePlayer(id: string) {
    setClosedPlayers((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const players = useStorage((s) => s ? Object.entries(s.players) : []) ?? [];
  const queue = useStorage((s) => s ? [...s.guessingQueue] : []) ?? [];
  const guessResults = useStorage((s) => s ? s.guessResults as Record<string, { position: number; points: number; doubleDown?: boolean }> : {} as Record<string, { position: number; points: number; doubleDown?: boolean }>) ?? {};
  const playerDials = useStorage((s) => s ? s.playerDials as Record<string, DialConfig[]> : {} as Record<string, DialConfig[]>) ?? {};
  const playerClues = useStorage((s) => s ? s.playerClues as Record<string, string[]> : {} as Record<string, string[]>) ?? {};
  const phase = useStorage((s) => s?.phase);

  // Non-hosts follow when host resets to lobby
  useEffect(() => {
    if (!mp.isHost && phase === "lobby") goTo("waitingRoom");
  }, [phase, goTo, mp.isHost]);

  // Reset game data but keep players (colors + host status intact)
  const resetForNewGame = useMutation(({ storage }) => {
    clearGameData(storage);
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
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-4 py-8 pb-24">
      <EmojiReactions />
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
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Round Breakdown</p>
            <div className="flex rounded-lg border overflow-hidden text-xs">
              <button
                onClick={() => setBreakdownView("round")}
                className={`px-3 py-1 transition-colors cursor-pointer ${breakdownView === "round" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                By Round
              </button>
              <button
                onClick={() => setBreakdownView("player")}
                className={`px-3 py-1 transition-colors cursor-pointer ${breakdownView === "player" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                By Player
              </button>
            </div>
          </div>

          {breakdownView === "round" && (() => {
            const byRound = breakdownEntries.reduce<Record<number, { dialIndex: number; authorId: string }[]>>((acc, e) => {
              (acc[e.dialIndex] ??= []).push(e);
              return acc;
            }, {});
            return Object.entries(byRound).map(([dialIndexStr, entries]) => {
              const dialIndex = Number(dialIndexStr);
              const groupOpen = !closedRoundGroups.has(dialIndex);
              return (
                <div key={dialIndex} className="rounded-xl border overflow-hidden">
                  <button
                    onClick={() => toggleRoundGroup(dialIndex)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/40 transition-colors cursor-pointer"
                  >
                    <span>Round {dialIndex + 1}</span>
                    {groupOpen ? <ChevronDown size={15} className="text-muted-foreground" /> : <ChevronRight size={15} className="text-muted-foreground" />}
                  </button>
                  {groupOpen && (
                    <div className="border-t flex flex-col divide-y">
                      {entries.map(({ authorId }) => {
                        const key = `${dialIndex}-${authorId}`;
                        const isOpen = !closedRounds.has(key);
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
                          <div key={key}>
                            <button
                              onClick={() => toggleRound(key)}
                              className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-muted/40 transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-1.5">
                                {authorInfo && <span className="w-1.5 h-1.5 rounded-full" style={{ background: authorInfo.color }} />}
                                <span className="font-medium">{authorName}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">"{clue}"</span>
                                {isOpen ? <ChevronDown size={13} className="text-muted-foreground" /> : <ChevronRight size={13} className="text-muted-foreground" />}
                              </div>
                            </button>
                            {isOpen && (
                              <div className="px-3 pb-3 flex flex-col gap-2">
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
                                    const pts = res?.points ?? 0;
                                    return (
                                      <div key={gid} className="flex items-center gap-1 text-xs">
                                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: ginfo.color }} />
                                        <span className="text-muted-foreground">{ginfo.name}:</span>
                                        <span className="font-medium">
                                          {pts >= 0 ? "+" : ""}{pts}
                                          {res?.doubleDown && <span className="ml-0.5 text-amber-400 text-[10px]">2×</span>}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            });
          })()}

          {breakdownView === "player" && ranked.map(([playerId, playerInfo]) => {
            const isOpen = !closedPlayers.has(playerId);
            const myGuesses = breakdownEntries
              .filter(({ authorId }) => authorId !== playerId)
              .map(({ dialIndex, authorId }) => {
                const key = `${playerId}-${dialIndex}-${authorId}`;
                const result = guessResults[key];
                if (!result) return null;
                const dial = playerDials[authorId]?.[dialIndex];
                const authorInfo = players.find(([id]) => id === authorId)?.[1];
                const clue = playerClues[authorId]?.[dialIndex] ?? "";
                return { dialIndex, authorId, result, dial, authorInfo, clue };
              })
              .filter(Boolean) as {
                dialIndex: number; authorId: string;
                result: { position: number; points: number; doubleDown?: boolean };
                dial: DialConfig | undefined;
                authorInfo: { name: string; color: string } | undefined;
                clue: string;
              }[];

            return (
              <div key={playerId} className="rounded-xl border overflow-hidden">
                <button
                  onClick={() => togglePlayer(playerId)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: playerInfo.color }} />
                    <span className="text-sm font-medium">{playerInfo.name}{playerId === mp.playerId ? " (you)" : ""}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{scoreMap[playerId] ?? 0} pts</span>
                    {isOpen ? <ChevronDown size={15} className="text-muted-foreground" /> : <ChevronRight size={15} className="text-muted-foreground" />}
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t flex flex-col gap-3 p-4">
                    {myGuesses.map(({ dialIndex, authorId, result, dial, authorInfo, clue }) => (
                      <div key={`${dialIndex}-${authorId}`} className="flex flex-col gap-1.5 pl-4 border-l-2" style={{ borderColor: playerInfo.color + "60" }}>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            {authorInfo && <span className="w-1.5 h-1.5 rounded-full" style={{ background: authorInfo.color }} />}
                            <span>{authorInfo?.name ?? "?"}'s clue: "{clue}"</span>
                          </div>
                          <span className="font-semibold text-foreground">
                            {result.points >= 0 ? "+" : ""}{result.points} pt{Math.abs(result.points) !== 1 ? "s" : ""}
                            {result.doubleDown && <span className="ml-0.5 text-amber-400 text-[10px]">2×</span>}
                          </span>
                        </div>
                        {dial && (
                          <SpectrumDial
                            card={dial}
                            dialPosition={result.position}
                            onDialChange={() => {}}
                            showTarget={true}
                            targetPosition={dial.targetPosition}
                            disabled={true}
                            hideNeedle={false}
                            smooth={true}
                          />
                        )}
                      </div>
                    ))}
                    {myGuesses.length === 0 && (
                      <p className="text-xs text-muted-foreground">No guesses recorded</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {mp.isHost ? (
          <Button onClick={handlePlayAgain}>Play Again</Button>
        ) : (
          <p className="text-sm text-center text-muted-foreground">Waiting for host to start a new game<Ellipsis /></p>
        )}
        <Button variant="ghost" className="text-muted-foreground" onClick={handleLeave} disabled={leaving}>
          {leaving ? "Leaving…" : "Leave Game"}
        </Button>
      </div>
    </div>
  );
}
