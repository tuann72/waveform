import { useEffect, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { useGame } from "@/context/GameContext"
import { useMultiplayer } from "@/context/MultiplayerContext"
import { useStorage, useMutation, clearGameData } from "@/lib/liveblocks"
import { useLeaveRoom } from "@/hooks/useLeaveRoom"
import { EmojiReactions } from "@/components/game/EmojiReactions"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Ellipsis } from "@/components/ui/ellipsis"
import { getPalette } from "@/lib/colorPalette"
import type { PaletteName } from "@/lib/colorPalette"

export function ColorformResultsView() {
  const { goTo } = useGame()
  const { mp } = useMultiplayer()
  const { leaving, handleLeave } = useLeaveRoom()
  const [breakdownView, setBreakdownView] = useState<"round" | "player">("round")
  const [closedRounds, setClosedRounds] = useState(new Set<number>())
  const [closedPlayers, setClosedPlayers] = useState(new Set<string>())

  const players = useStorage((s) => (s ? Object.entries(s.players) : [])) ?? []
  const queue = useStorage((s) => (s ? [...s.guessingQueue] : [])) ?? []
  const guessResults = useStorage((s) =>
    s
      ? (s.guessResults as Record<string, { position: number; points: number }>)
      : ({} as Record<string, { position: number; points: number }>),
  ) ?? {}
  const playerColors = useStorage((s) =>
    s ? (s.playerColors as Record<string, number[]>) : ({} as Record<string, number[]>),
  ) ?? {}
  const playerClues = useStorage((s) =>
    s ? (s.playerClues as Record<string, string[]>) : ({} as Record<string, string[]>),
  ) ?? {}
  const phase = useStorage((s) => s?.phase)
  const colorPaletteName = (useStorage((s) => s?.colorPaletteName) ?? "base") as PaletteName
  const palette = getPalette(colorPaletteName)

  // Non-hosts follow host back to lobby
  useEffect(() => {
    if (!mp.isHost && phase === "lobby") goTo("waitingRoom")
  }, [phase, goTo, mp.isHost])

  const resetForNewGame = useMutation(({ storage }) => {
    clearGameData(storage)
  }, [])

  function handlePlayAgain() {
    resetForNewGame()
    goTo("waitingRoom")
  }

  function toggleRound(dialIndex: number) {
    setClosedRounds((prev) => {
      const next = new Set(prev)
      next.has(dialIndex) ? next.delete(dialIndex) : next.add(dialIndex)
      return next
    })
  }

  function togglePlayer(playerId: string) {
    setClosedPlayers((prev) => {
      const next = new Set(prev)
      next.has(playerId) ? next.delete(playerId) : next.add(playerId)
      return next
    })
  }

  // Compute total scores per player
  const scoreMap: Record<string, number> = {}
  for (const [id] of players) scoreMap[id] = 0
  for (const [key, res] of Object.entries(guessResults)) {
    const parts = key.split("-")
    if (parts.length === 3) {
      const guesserId = parts[0]
      if (guesserId in scoreMap) scoreMap[guesserId] += res.points
    }
  }

  const ranked = [...players].sort(([a], [b]) => (scoreMap[b] ?? 0) - (scoreMap[a] ?? 0))
  const winner = ranked[0]
  const maxScore = winner ? scoreMap[winner[0]] : 0

  // Unique (authorId, dialIndex) pairs in queue order
  const breakdownEntries = queue.reduce<{ dialIndex: number; authorId: string }[]>((acc, e) => {
    if (!acc.find((x) => x.dialIndex === e.dialIndex && x.authorId === e.authorId)) {
      acc.push({ dialIndex: e.dialIndex, authorId: e.authorId })
    }
    return acc
  }, [])

  // Group entries by round (dialIndex) for "By Round" view
  const roundGroups = breakdownEntries.reduce<Map<number, { authorId: string }[]>>((map, e) => {
    const arr = map.get(e.dialIndex) ?? []
    arr.push({ authorId: e.authorId })
    map.set(e.dialIndex, arr)
    return map
  }, new Map())
  const sortedRounds = [...roundGroups.keys()].sort((a, b) => a - b)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-4 py-8 pb-24">
      <EmojiReactions />
      <div className="w-full max-w-sm flex flex-col gap-6">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-3xl font-bold">Results</h2>
          {winner && (
            <p className="text-muted-foreground mt-1">
              <span className="font-semibold text-foreground">{winner[1].name}</span> wins with{" "}
              {maxScore} pts!
            </p>
          )}
        </div>

        {/* Leaderboard */}
        <div className="flex flex-col gap-2">
          {ranked.map(([id, info], i) => (
            <div key={id} className="flex items-center gap-3 py-2">
              <span className="text-lg font-bold w-6 text-muted-foreground">{i + 1}</span>
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: info.color }}
              />
              <div className="flex-1">
                <span className="text-sm font-medium">{info.name}</span>
                {id === mp.playerId && (
                  <span className="text-xs text-muted-foreground ml-1">(you)</span>
                )}
                {info.isHost && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    Host
                  </Badge>
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
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Round Breakdown
            </p>
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

          {/* By Round — one collapsible card per round */}
          {breakdownView === "round" &&
            sortedRounds.map((dialIndex) => {
              const entries = roundGroups.get(dialIndex) ?? []
              const isOpen = !closedRounds.has(dialIndex)

              return (
                <div key={dialIndex} className="rounded-xl border overflow-hidden">
                  {/* Card header */}
                  <button
                    onClick={() => toggleRound(dialIndex)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/40 transition-colors cursor-pointer"
                  >
                    <span>Round {dialIndex + 1}</span>
                    {isOpen ? <ChevronDown size={15} className="text-muted-foreground" /> : <ChevronRight size={15} className="text-muted-foreground" />}
                  </button>

                  {/* Card body */}
                  {isOpen && (
                    <div className="flex flex-col divide-y border-t">
                      {entries.map(({ authorId }) => {
                        const targetIndex = playerColors[authorId]?.[dialIndex]
                        const authorInfo = players.find(([id]) => id === authorId)?.[1]
                        const clue = playerClues[authorId]?.[dialIndex] ?? ""
                        const guessers = players.filter(([id]) => id !== authorId)

                        return (
                          <div key={authorId} className="p-4 flex flex-col gap-3">
                            {/* Author + clue */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                {authorInfo && (
                                  <span
                                    className="w-1.5 h-1.5 rounded-full"
                                    style={{ background: authorInfo.color }}
                                  />
                                )}
                                <span>by {authorInfo?.name ?? "?"}</span>
                              </div>
                              <p className="text-sm font-medium">"{clue}"</p>
                            </div>

                            {/* Target swatch */}
                            {targetIndex !== undefined && (
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-8 h-8 rounded-lg flex-shrink-0 border-2 border-border shadow-sm"
                                  style={{ background: palette[targetIndex] }}
                                />
                                <span className="text-xs text-muted-foreground font-mono">
                                  {palette[targetIndex]}
                                </span>
                                <span className="text-xs text-muted-foreground ml-1">← target</span>
                              </div>
                            )}

                            {/* Guessers */}
                            <div className="flex flex-col gap-1.5">
                              {guessers.map(([gid, ginfo]) => {
                                const res = guessResults[`${gid}-${dialIndex}-${authorId}`]
                                return (
                                  <div key={gid} className="flex items-center gap-2 text-xs">
                                    <span
                                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                      style={{ background: ginfo.color }}
                                    />
                                    <span className="text-muted-foreground w-20 truncate">{ginfo.name}</span>
                                    {res !== undefined ? (
                                      <>
                                        <div
                                          className="w-5 h-5 rounded flex-shrink-0 border border-border/50"
                                          style={{ background: palette[res.position] }}
                                        />
                                        <span className="font-mono text-muted-foreground text-[10px]">
                                          {palette[res.position]}
                                        </span>
                                        <span className="ml-auto font-semibold text-foreground">
                                          +{res.points}
                                        </span>
                                      </>
                                    ) : (
                                      <span className="ml-auto text-muted-foreground">—</span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}

          {/* By Player — one collapsible card per player */}
          {breakdownView === "player" &&
            ranked.map(([playerId, playerInfo]) => {
              const myGuesses = breakdownEntries
                .filter(({ authorId }) => authorId !== playerId)
                .map(({ dialIndex, authorId }) => {
                  const key = `${playerId}-${dialIndex}-${authorId}`
                  const result = guessResults[key]
                  if (!result) return null
                  const targetIndex = playerColors[authorId]?.[dialIndex]
                  const authorInfo = players.find(([id]) => id === authorId)?.[1]
                  const clue = playerClues[authorId]?.[dialIndex] ?? ""
                  return { dialIndex, authorId, result, targetIndex, authorInfo, clue }
                })
                .filter(Boolean) as {
                  dialIndex: number
                  authorId: string
                  result: { position: number; points: number }
                  targetIndex: number | undefined
                  authorInfo: { name: string; color: string } | undefined
                  clue: string
                }[]

              const isOpen = !closedPlayers.has(playerId)

              return (
                <div key={playerId} className="rounded-xl border overflow-hidden">
                  {/* Card header */}
                  <button
                    onClick={() => togglePlayer(playerId)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: playerInfo.color }}
                      />
                      <span className="text-sm font-medium">
                        {playerInfo.name}
                        {playerId === mp.playerId ? " (you)" : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{scoreMap[playerId] ?? 0} pts</span>
                      {isOpen ? <ChevronDown size={15} className="text-muted-foreground" /> : <ChevronRight size={15} className="text-muted-foreground" />}
                    </div>
                  </button>

                  {/* Card body */}
                  {isOpen && (
                    <div className="flex flex-col gap-3 p-4 border-t">
                      {myGuesses.map(({ dialIndex, authorId, result, targetIndex, authorInfo, clue }) => (
                        <div
                          key={`${dialIndex}-${authorId}`}
                          className="flex flex-col gap-1.5 pl-4 border-l-2"
                          style={{ borderColor: playerInfo.color + "60" }}
                        >
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            {authorInfo && (
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ background: authorInfo.color }}
                              />
                            )}
                            <span>
                              {authorInfo?.name ?? "?"}'s clue: "{clue}"
                            </span>
                            <span className="ml-auto font-semibold text-foreground">
                              +{result.points} pt{result.points !== 1 ? "s" : ""}
                            </span>
                          </div>
                          {targetIndex !== undefined && (
                            <div className="flex items-center gap-2">
                              <div
                                className="w-5 h-5 rounded border border-border/50 flex-shrink-0"
                                style={{ background: palette[result.position] }}
                                title="Your guess"
                              />
                              <span className="text-xs text-muted-foreground">→</span>
                              <div
                                className="w-5 h-5 rounded border-2 border-white shadow flex-shrink-0"
                                style={{ background: palette[targetIndex] }}
                                title="Target"
                              />
                            </div>
                          )}
                        </div>
                      ))}

                      {myGuesses.length === 0 && (
                        <p className="text-xs text-muted-foreground">No guesses recorded</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
        </div>

        {mp.isHost ? (
          <Button onClick={handlePlayAgain}>Play Again</Button>
        ) : (
          <p className="text-sm text-center text-muted-foreground">
            Waiting for host to start a new game<Ellipsis />
          </p>
        )}
        <Button
          variant="ghost"
          className="text-muted-foreground"
          onClick={handleLeave}
          disabled={leaving}
        >
          {leaving ? "Leaving…" : "Leave Game"}
        </Button>
      </div>
    </div>
  )
}
