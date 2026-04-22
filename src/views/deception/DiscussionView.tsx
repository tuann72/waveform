import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useMultiplayer } from "@/context/MultiplayerContext";
import { useGame } from "@/context/GameContext";
import { useStorage, useMutation } from "@/lib/liveblocks";
import { useCountdown } from "@/hooks/useCountdown";
import { TimerBar } from "@/components/game/TimerBar";
import { deriveKey, decryptJson } from "@/lib/crypto";
import { PlayerStatusList, DoneNode, WaitingNode } from "@/components/game/PlayerStatusList";
import { Button } from "@/components/ui/button";
import { Ellipsis } from "@/components/ui/ellipsis";
import type { MurdererSolution } from "@/types/deception";

type ViewMode = "marker" | "accusation";

// ── Sortable player card wrapper ─────────────────────────────────────────────

interface SortableCardProps {
  id: string;
  children: (dragHandleProps: React.HTMLAttributes<HTMLElement>, isDragging: boolean) => React.ReactNode;
  disabled?: boolean;
}

function SortableCard({ id, children, disabled }: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children({ ...attributes, ...listeners }, isDragging)}
    </div>
  );
}

// ── CardWord: click to hide, hover to peek, click again to unhide ────────────

interface CardWordProps {
  text: string;
  hidden: boolean;
  onToggle: () => void;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  mode: ViewMode;
}

function CardWord({ text, hidden, onToggle, selectable, selected, onSelect, mode }: CardWordProps) {
  const [hovered, setHovered] = useState(false);

  if (mode === "marker") {
    const revealed = !hidden || hovered;
    return (
      <button
        onClick={onToggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`px-2.5 py-1 rounded-lg border text-xs transition-all cursor-pointer select-none ${
          hidden && !hovered
            ? "border-border bg-muted/60 text-transparent tracking-widest"
            : hidden && hovered
              ? "border-primary/30 bg-muted/30 text-foreground/70 italic"
              : "border-border bg-muted/20 text-foreground hover:border-muted-foreground/40"
        }`}
        title={hidden ? "Click to unhide" : "Click to hide"}
      >
        {revealed ? text : "██████"}
      </button>
    );
  }

  // accusation mode
  const revealed = !hidden || hovered;

  if (!selectable) {
    return (
      <span
        onMouseEnter={() => hidden && setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`px-2.5 py-1 rounded-lg border border-border/40 bg-muted/10 text-xs cursor-default select-none ${
          hidden && !hovered ? "text-transparent tracking-widest" : "text-muted-foreground/50"
        }`}
      >
        {revealed ? text : "██████"}
      </span>
    );
  }

  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`px-2.5 py-1 rounded-lg border text-xs transition-colors cursor-pointer select-none ${
        selected
          ? "border-primary bg-primary/15 text-foreground font-medium ring-1 ring-primary/30"
          : hidden && !hovered
            ? "border-border bg-muted/60 text-transparent tracking-widest hover:border-primary/40"
            : "border-border bg-muted/20 text-foreground hover:border-primary/40 hover:bg-primary/5"
      }`}
    >
      {revealed ? text : "██████"}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

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
  const fsPlayerId = useStorage((s) => s?.deceptionFsPlayerId ?? null);
  const discussionTimerDuration = useStorage((s) => s?.deceptionDiscussionTimerDuration ?? 600) ?? 600;
  const discussionTimerStart = useStorage((s) => s?.deceptionDiscussionTimerStart ?? null) ?? null;
  const currentRound = useStorage((s) => s?.deceptionCurrentRound ?? 1) ?? 1;
  const totalRounds = useStorage((s) => s?.totalRounds ?? 3) ?? 3;
  const phase = useStorage((s) => s?.deceptionPhase);

  const [solution, setSolution] = useState<MurdererSolution | null>(null);
  const processedAccusers = useRef(new Set<string>());

  // Accusation selection
  const [accusedPlayerId, setAccusedPlayerId] = useState<string | null>(null);
  const [accusedMeans, setAccusedMeans] = useState<string | null>(null);
  const [accusedEvidence, setAccusedEvidence] = useState<string | null>(null);

  // UI mode + card ordering
  const [viewMode, setViewMode] = useState<ViewMode>("marker");
  const [cardOrder, setCardOrder] = useState<string[]>([]);
  const [hiddenCards, setHiddenCards] = useState<Set<string>>(new Set());

  // Seed card order from players once loaded
  useEffect(() => {
    if (cardOrder.length === 0 && players.length > 0) {
      setCardOrder(players.map(([id]) => id));
    }
  }, [players]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setCardOrder((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }

  function toggleHidden(key: string) {
    setHiddenCards((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectPlayerForAccusation(id: string) {
    if (accusedPlayerId === id) {
      setAccusedPlayerId(null);
      setAccusedMeans(null);
      setAccusedEvidence(null);
    } else {
      setAccusedPlayerId(id);
      setAccusedMeans(null);
      setAccusedEvidence(null);
    }
  }

  function selectMeans(playerId: string, card: string) {
    if (accusedPlayerId !== playerId) {
      setAccusedPlayerId(playerId);
      setAccusedEvidence(null);
    }
    setAccusedMeans((prev) => (prev === card ? null : card));
  }

  function selectEvidence(playerId: string, card: string) {
    if (accusedPlayerId !== playerId) {
      setAccusedPlayerId(playerId);
      setAccusedMeans(null);
    }
    setAccusedEvidence((prev) => (prev === card ? null : card));
  }

  // Mutations declared before effects
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
    storage.set("deceptionPhase", "fs-placement");
    storage.set("deceptionFsTimerStart", Date.now());
    storage.set("deceptionDiscussionTimerStart", null);
    const acc = storage.get("deceptionAccusations");
    for (const k of acc.keys()) acc.delete(k);
  }, []);

  useEffect(() => {
    if (!mp.isHost || !encryptedSolution || solution) return;
    deriveKey(mp.roomCode, mp.playerId)
      .then((key) => decryptJson(encryptedSolution, key))
      .then((data) => setSolution(data as MurdererSolution))
      .catch(() => {});
  }, [encryptedSolution]);

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
        eliminatePlayer(accuserId); // marks as voted wrong (can still use marker mode)
      }
    }
  }, [accusations, solution]);

  useEffect(() => {
    if (phase === "fs-placement") goTo("deceptionFsPlacement");
    if (phase === "results") goTo("deceptionResults");
  }, [phase]);

  const timeLeft = useCountdown(discussionTimerStart, discussionTimerDuration, 500);

  // Host: auto-advance when discussion timer hits 0
  useEffect(() => {
    if (timeLeft !== 0 || !discussionTimerDuration || !mp.isHost) return;
    if (currentRound < totalRounds) advanceToNextRound();
    else if (solution) {
      const murdererPlayerId = Object.entries(dealtCards).find(([, hand]) =>
        hand.meansCards.includes(solution.meansCard) &&
        hand.evidenceCards.includes(solution.evidenceCard)
      )?.[0] ?? "";
      endWithMurdererWins(murdererPlayerId, solution);
    }
  }, [timeLeft]);

  const iVotedWrong = eliminatedPlayers[mp.playerId] === true;
  const iHaveAccused = !!accusations[mp.playerId];
  const iAmFs = mp.playerId === fsPlayerId;
  const isFinalRound = currentRound >= totalRounds;
  const canAccuse =
    !iAmFs &&
    !iHaveAccused &&
    mp.deceptionRole !== "accomplice";
  const accusationValid = !!accusedPlayerId && !!accusedMeans && !!accusedEvidence;

  // Ordered player list (falls back to storage order until DnD initializes)
  const orderedPlayers =
    cardOrder.length > 0
      ? cardOrder.flatMap((id) => {
          const entry = players.find(([pid]) => pid === id);
          return entry ? [entry] : [];
        })
      : players;

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-background px-4 py-8 pb-36 overflow-y-auto">
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

        {timeLeft !== null && (
          <TimerBar timeLeft={timeLeft} duration={discussionTimerDuration} label="Discussion" />
        )}

        {iVotedWrong && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-center text-amber-500">
            Your accusation was wrong — you may still use Marker mode to help the group.
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

        {/* Accusations log */}
        {Object.keys(accusations).length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Accusations Log</p>
            <div className="flex flex-col gap-2">
              {Object.entries(accusations).map(([accuserId, acc]) => {
                const accuser = players.find(([id]) => id === accuserId)?.[1];
                const suspectName = players.find(([id]) => id === acc.accusedPlayerId)?.[1]?.name ?? "?";
                const wasWrong = !!eliminatedPlayers[accuserId];
                return (
                  <div
                    key={accuserId}
                    className={`rounded-lg border px-3 py-2 text-xs flex flex-col gap-1 ${
                      wasWrong
                        ? "border-destructive/30 bg-destructive/5"
                        : "border-border bg-muted/20"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {accuser && (
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: accuser.color }} />
                      )}
                      <span className="font-medium text-foreground">
                        {accuser?.name ?? "?"}{accuserId === mp.playerId ? " (you)" : ""}
                      </span>
                      {wasWrong ? (
                        <span className="ml-auto text-destructive/70 uppercase tracking-wide text-[10px]">Wrong</span>
                      ) : (
                        <span className="ml-auto text-muted-foreground/50 uppercase tracking-wide text-[10px]">Pending</span>
                      )}
                    </div>
                    <div className="text-muted-foreground">
                      Accused{" "}
                      <span className="text-foreground font-medium">{suspectName}</span>
                      {" · "}
                      <span className="text-foreground">{acc.meansCard}</span>
                      {" · "}
                      <span className="text-foreground">{acc.evidenceCard}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Players' cards section */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Players' Cards</p>
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setViewMode("marker")}
                className={`px-3 py-1 text-xs transition-colors cursor-pointer ${
                  viewMode === "marker"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                Marker Mode
              </button>
              <button
                onClick={() => setViewMode("accusation")}
                className={`px-3 py-1 text-xs transition-colors cursor-pointer border-l border-border ${
                  viewMode === "accusation"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                Accusation Mode
              </button>
            </div>
          </div>

          {viewMode === "marker" ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={cardOrder} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-2">
                  {orderedPlayers.map(([id, info]) => {
                    const hand = dealtCards[id];
                    if (!hand) return null;
                    const hasVotedWrong = !!eliminatedPlayers[id];
                    return (
                      <SortableCard key={id} id={id}>
                        {(dragHandleProps, isDragging) => (
                          <div
                            className={`rounded-xl border bg-muted/20 px-4 py-3 flex flex-col gap-2 transition-shadow ${isDragging ? "shadow-lg" : ""}`}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                {...dragHandleProps}
                                className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground/70 touch-none"
                              >
                                <GripVertical size={14} />
                              </span>
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: info.color }} />
                              <span className="text-sm font-medium text-foreground">
                                {info.name}{id === mp.playerId ? " (you)" : ""}
                              </span>
                              {hasVotedWrong && (
                                <span className="ml-auto text-[10px] text-amber-500/70 uppercase tracking-wide">wrong vote</span>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="flex flex-col gap-1">
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Means</p>
                                <div className="flex flex-col gap-1">
                                  {hand.meansCards.map((c) => (
                                    <CardWord
                                      key={c}
                                      text={c}
                                      hidden={hiddenCards.has(`${id}:means:${c}`)}
                                      onToggle={() => toggleHidden(`${id}:means:${c}`)}
                                      mode="marker"
                                    />
                                  ))}
                                </div>
                              </div>
                              <div className="flex flex-col gap-1">
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Evidence</p>
                                <div className="flex flex-col gap-1">
                                  {hand.evidenceCards.map((c) => (
                                    <CardWord
                                      key={c}
                                      text={c}
                                      hidden={hiddenCards.has(`${id}:evidence:${c}`)}
                                      onToggle={() => toggleHidden(`${id}:evidence:${c}`)}
                                      mode="marker"
                                    />
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </SortableCard>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            /* Accusation mode */
            <div className="flex flex-col gap-2">
              {orderedPlayers.map(([id, info]) => {
                const hand = dealtCards[id];
                if (!hand) return null;
                const hasVotedWrong = !!eliminatedPlayers[id];
                const isSelected = accusedPlayerId === id;
                const isSelectablePlayer = canAccuse && id !== fsPlayerId;

                return (
                  <div
                    key={id}
                    onClick={() => isSelectablePlayer && selectPlayerForAccusation(id)}
                    className={`rounded-xl border px-4 py-3 flex flex-col gap-2 transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : isSelectablePlayer
                          ? "bg-muted/20 hover:border-primary/30 cursor-pointer"
                          : "bg-muted/20 cursor-default"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: info.color }} />
                      <span className="text-sm font-medium text-foreground">
                        {info.name}{id === mp.playerId ? " (you)" : ""}
                      </span>
                      {hasVotedWrong && !isSelected && (
                        <span className="ml-auto text-[10px] text-amber-500/70 uppercase tracking-wide">wrong vote</span>
                      )}
                      {isSelected && (
                        <span className="ml-auto text-[10px] text-primary uppercase tracking-wide font-medium">Suspect ✓</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Means</p>
                        <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                          {hand.meansCards.map((c) => (
                            <CardWord
                              key={c}
                              text={c}
                              hidden={hiddenCards.has(`${id}:means:${c}`)}
                              onToggle={() => {}}
                              selectable={isSelectablePlayer}
                              selected={accusedPlayerId === id && accusedMeans === c}
                              onSelect={() => selectMeans(id, c)}
                              mode="accusation"
                            />
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Evidence</p>
                        <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                          {hand.evidenceCards.map((c) => (
                            <CardWord
                              key={c}
                              text={c}
                              hidden={hiddenCards.has(`${id}:evidence:${c}`)}
                              onToggle={() => {}}
                              selectable={isSelectablePlayer}
                              selected={accusedPlayerId === id && accusedEvidence === c}
                              onSelect={() => selectEvidence(id, c)}
                              mode="accusation"
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* FS cannot vote */}
        {iAmFs && (
          <div className="rounded-lg border border-blue-400/30 bg-blue-400/5 px-4 py-3 text-sm text-center text-blue-400">
            As the Forensic Scientist, you cannot make accusations — guide investigators through your scene markers.
          </div>
        )}

        {/* Accusation submitted banner */}
        {!iAmFs && iHaveAccused && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${iVotedWrong ? "border-destructive/30 bg-destructive/5" : "bg-muted/30"}`}>
            <p className="text-muted-foreground mb-1">
              {iVotedWrong ? "Your accusation was wrong" : "Your accusation — waiting for verdict"}
            </p>
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
            rightNode: id === fsPlayerId
              ? <span className="text-blue-400 text-xs">Forensic Scientist</span>
              : accusations[id]
                ? eliminatedPlayers[id]
                  ? <span className="text-amber-500/80 text-xs">Wrong vote</span>
                  : <DoneNode label="Voted" />
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

      {/* Sticky submit accusation button */}
      {canAccuse && viewMode === "accusation" && (
        <div className="fixed bottom-0 left-0 right-0 flex justify-center px-4 pb-6 pt-4 bg-gradient-to-t from-background via-background/95 to-transparent pointer-events-none">
          <div className="w-full max-w-md pointer-events-auto">
            {accusationValid ? (
              <div className="mb-2 text-center text-xs text-muted-foreground">
                Accusing{" "}
                <span className="font-medium text-foreground">
                  {players.find(([id]) => id === accusedPlayerId)?.[1].name}
                </span>
                {" · "}
                <span className="text-foreground">{accusedMeans}</span>
                {" · "}
                <span className="text-foreground">{accusedEvidence}</span>
              </div>
            ) : (
              <div className="mb-2 text-center text-xs text-muted-foreground">
                Select a suspect, their means, and evidence
              </div>
            )}
            <Button
              disabled={!accusationValid}
              onClick={() => submitAccusation(mp.playerId, accusedPlayerId!, accusedMeans!, accusedEvidence!)}
              className="w-full"
            >
              Submit Accusation
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
