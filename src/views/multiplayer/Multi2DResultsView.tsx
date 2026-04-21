import { useEffect, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { useGame } from "@/context/GameContext"
import { useMultiplayer } from "@/context/MultiplayerContext"
import { useStorage, useMutation, clearGameData } from "@/lib/liveblocks"
import type { Dial2DConfig } from "@/lib/liveblocks"
import { useLeaveRoom } from "@/hooks/useLeaveRoom"
import { EmojiReactions } from "@/components/game/EmojiReactions"
import { SpectrumPlane } from "@/components/game/SpectrumPlane"
import type { ExtraPoint } from "@/components/game/SpectrumPlane"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Ellipsis } from "@/components/ui/ellipsis"

export function Multi2DResultsView() {
  const { goTo } = useGame()
  const { mp } = useMultiplayer()
  const { leaving, handleLeave } = useLeaveRoom()
  const [closedRoundGroups, setClosedRoundGroups] = useState(new Set<number>())
  const [closedRounds, setClosedRounds] = useState(new Set<string>())

  const players = useStorage((s) => (s ? Object.entries(s.players) : [])) ?? []
  const queue = useStorage((s) => (s ? [...s.guessingQueue] : [])) ?? []
  const guessResults = useStorage((s) =>
    s ? (s.guessResults as Record<string, { position: number; posY?: number; points: number; doubleDown?: boolean }>) : {}
  ) ?? {}
  const player2DDials = useStorage((s) =>
    s ? (s.player2DDials as unknown as Record<string, Dial2DConfig[]>) : ({} as Record<string, Dial2DConfig[]>)
  ) ?? {}
  const playerClues = useStorage((s) =>
    s ? (s.playerClues as Record<string, string[]>) : ({} as Record<string, string[]>)
  ) ?? {}
  const phase = useStorage((s) => s?.phase)

  useEffect(() => {
    if (!mp.isHost && phase === "lobby") goTo("waitingRoom")
  }, [phase, goTo, mp.isHost])

  const resetForNewGame = useMutation(({ storage }) => { clearGameData(storage) }, [])

  function handlePlayAgain() {
    resetForNewGame()
    goTo("waitingRoom")
  }

  // Compute scores
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

  const breakdownEntries = queue.reduce<{ dialIndex: number; authorId: string }[]>((acc, e) => {
    if (!acc.find(x => x.dialIndex === e.dialIndex && x.authorId === e.authorId)) acc.push({ dialIndex: e.dialIndex, authorId: e.authorId })
    return acc
  }, [])

  const byRound = breakdownEntries.reduce<Record<number, { dialIndex: number; authorId: string }[]>>((acc, e) => {
    ;(acc[e.dialIndex] ??= []).push(e)
    return acc
  }, {})

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
                {id === mp.playerId && <span className="text-xs text-muted-foreground ml-1">(you)</span>}
                {info.isHost && <Badge variant="secondary" className="ml-2 text-xs">Host</Badge>}
              </div>
              <span className="text-lg font-bold">{scoreMap[id] ?? 0}</span>
            </div>
          ))}
        </div>

        <Separator />

        {/* Round breakdown */}
        <div className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Round Breakdown</p>
          {Object.entries(byRound).map(([dialIndexStr, entries]) => {
            const dialIndex = Number(dialIndexStr)
            const groupOpen = !closedRoundGroups.has(dialIndex)
            return (
              <div key={dialIndex} className="rounded-xl border overflow-hidden">
                <button
                  onClick={() => setClosedRoundGroups(prev => { const n = new Set(prev); n.has(dialIndex) ? n.delete(dialIndex) : n.add(dialIndex); return n })}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/40 transition-colors cursor-pointer"
                >
                  <span>Round {dialIndex + 1}</span>
                  {groupOpen ? <ChevronDown size={15} className="text-muted-foreground" /> : <ChevronRight size={15} className="text-muted-foreground" />}
                </button>
                {groupOpen && (
                  <div className="border-t flex flex-col divide-y">
                    {entries.map(({ authorId }) => {
                      const key = `${dialIndex}-${authorId}`
                      const isOpen = !closedRounds.has(key)
                      const dial = player2DDials[authorId]?.[dialIndex]
                      const authorInfo = players.find(([id]) => id === authorId)?.[1]
                      const authorName = authorInfo?.name ?? "?"
                      const clue = playerClues[authorId]?.[dialIndex] ?? ""
                      const guessers = players.filter(([id]) => id !== authorId)

                      const extraPoints: ExtraPoint[] = guessers.flatMap(([gid, ginfo]) => {
                        const res = guessResults[`${gid}-${dialIndex}-${authorId}`]
                        return res ? [{ x: res.position, y: res.posY ?? 50, color: ginfo.color }] : []
                      })

                      return (
                        <div key={key}>
                          <button
                            onClick={() => setClosedRounds(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })}
                            className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-muted/40 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-1.5">
                              {authorInfo && <span className="w-1.5 h-1.5 rounded-full" style={{ background: authorInfo.color }} />}
                              <span className="font-medium">{authorName}</span>
                              <span className="text-muted-foreground text-xs ml-1">"{clue}"</span>
                            </div>
                            {isOpen ? <ChevronDown size={14} className="text-muted-foreground flex-shrink-0" /> : <ChevronRight size={14} className="text-muted-foreground flex-shrink-0" />}
                          </button>
                          {isOpen && dial && (
                            <div className="px-4 pb-4 flex flex-col gap-3">
                              <SpectrumPlane
                                config={dial}
                                position={{ x: 50, y: 50 }}
                                onPositionChange={() => {}}
                                showTarget={true}
                                disabled={true}
                                hidePoint={true}
                                extraPoints={extraPoints}
                              />
                              <div className="flex flex-col gap-1">
                                {guessers.map(([gid, ginfo]) => {
                                  const res = guessResults[`${gid}-${dialIndex}-${authorId}`]
                                  if (!res) return null
                                  return (
                                    <div key={gid} className="flex items-center gap-2 text-xs">
                                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ginfo.color }} />
                                      <span className="text-muted-foreground flex-1">{ginfo.name}{gid === mp.playerId ? " (you)" : ""}</span>
                                      <span className="font-semibold">
                                        {res.points >= 0 ? "+" : ""}{res.points} pt{Math.abs(res.points) !== 1 ? "s" : ""}
                                        {res.doubleDown && <span className="ml-1 text-amber-400 text-[10px]">2×</span>}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <Separator />

        {mp.isHost ? (
          <Button className="w-full" onClick={handlePlayAgain}>Play Again</Button>
        ) : (
          <p className="text-sm text-center text-muted-foreground">Waiting for host<Ellipsis /></p>
        )}

        <Button variant="ghost" className="w-full text-muted-foreground" onClick={handleLeave} disabled={leaving}>
          {leaving ? "Leaving…" : "Leave Game"}
        </Button>
      </div>
    </div>
  )
}
