import { useEffect, useRef, useState } from "react"
import { useGame } from "@/context/GameContext"
import { useMultiplayer } from "@/context/MultiplayerContext"
import { useStorage, useMutation, useOthers, useUpdateMyPresence } from "@/lib/liveblocks"
import type { Dial2DConfig } from "@/lib/liveblocks"
import { SpectrumPlane } from "@/components/game/SpectrumPlane"
import type { ExtraPoint } from "@/components/game/SpectrumPlane"
import { EmojiReactions } from "@/components/game/EmojiReactions"
import { Button } from "@/components/ui/button"
import { Ellipsis } from "@/components/ui/ellipsis"
import { calcPoints2D, applyDoubleDown } from "@/lib/scoring"

export function Multi2DGuessView() {
  const { goTo } = useGame()
  const { mp } = useMultiplayer()
  const updateMyPresence = useUpdateMyPresence()
  const others = useOthers()

  const players = useStorage((s) => (s ? Object.entries(s.players) : [])) ?? []
  const player2DDials = useStorage((s) =>
    s ? (s.player2DDials as unknown as Record<string, Dial2DConfig[]>) : ({} as Record<string, Dial2DConfig[]>)
  ) ?? {}
  const playerClues = useStorage((s) =>
    s ? (s.playerClues as Record<string, string[]>) : ({} as Record<string, string[]>)
  ) ?? {}
  const queue = useStorage((s) => (s ? [...s.guessingQueue] : [])) ?? []
  const currentGuessIndex = useStorage((s) => s?.currentGuessIndex ?? 0) ?? 0
  const guessResults = useStorage((s) =>
    s ? (s.guessResults as Record<string, { position: number; posY?: number; points: number; doubleDown?: boolean }>) : {}
  ) ?? {}
  const phase = useStorage((s) => s?.phase)

  const [position, setPosition] = useState({ x: 50, y: 50 })
  const [resetFor, setResetFor] = useState<number | null>(null)
  const [autoAdvanceTimer, setAutoAdvanceTimer] = useState<number | null>(null)
  const [doubleDown, setDoubleDown] = useState(false)
  const isAdvancing = useRef(false)

  const currentEntry = queue[currentGuessIndex ?? 0]
  const amIAuthor = currentEntry?.authorId === mp.playerId

  const guessers = players
    .filter(([id]) => id !== currentEntry?.authorId)
    .map(([id, info]) => ({ id, color: info.color, name: info.name }))
  const amIGuesser = guessers.some(g => g.id === mp.playerId)

  const allGuessersLocked =
    guessers.length > 0 &&
    !!currentEntry &&
    guessers.every(g => !!guessResults[`${g.id}-${currentEntry.dialIndex}-${currentEntry.authorId}`])

  const authorDial = currentEntry
    ? (player2DDials[currentEntry.authorId]?.[currentEntry.dialIndex] ?? null)
    : null

  const recordGuess = useMutation(
    ({ storage }, guesserId: string, dialIndex: number, authorId: string, x: number, y: number, points: number, dd: boolean) => {
      const key = `${guesserId}-${dialIndex}-${authorId}`
      storage.get("guessResults").set(key, { position: x, posY: y, points, doubleDown: dd })
    },
    [],
  )

  const advanceGuess = useMutation(({ storage }) => {
    const current = storage.get("currentGuessIndex")
    const nextIndex = current + 1
    storage.set("currentGuessIndex", nextIndex)
    if (nextIndex >= storage.get("guessingQueue").length) storage.set("phase", "results")
  }, [])

  if (currentGuessIndex !== resetFor) {
    setResetFor(currentGuessIndex ?? 0)
    setPosition({ x: 50, y: 50 })
    setDoubleDown(false)
  }

  useEffect(() => {
    updateMyPresence({ dialPosition: null, dialPositionY: null })
    isAdvancing.current = false
  }, [currentGuessIndex])

  useEffect(() => {
    if (phase === "results") goTo("multiResults")
  }, [phase, goTo])

  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = "" }
  }, [])

  useEffect(() => {
    if (!allGuessersLocked) return
    const DURATION = 12
    const startTime = Date.now()
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      setAutoAdvanceTimer(Math.max(0, DURATION - elapsed))
    }, 200)
    return () => { clearInterval(interval); setAutoAdvanceTimer(null) }
  }, [allGuessersLocked, currentGuessIndex])

  useEffect(() => {
    if (autoAdvanceTimer === 0 && amIAuthor && allGuessersLocked && !isAdvancing.current) {
      isAdvancing.current = true
      advanceGuess()
    }
  }, [autoAdvanceTimer])

  function handlePositionChange(pos: { x: number; y: number }) {
    setPosition(pos)
    updateMyPresence({ dialPosition: pos.x, dialPositionY: pos.y })
  }

  function handleLockIn() {
    if (!currentEntry || !amIGuesser || !authorDial) return
    const rawPts = calcPoints2D(position.x, position.y, authorDial.targetX, authorDial.targetY)
    const pts = applyDoubleDown(rawPts, doubleDown)
    recordGuess(mp.playerId, currentEntry.dialIndex, currentEntry.authorId, position.x, position.y, pts, doubleDown)
  }

  function handleAdvance() {
    if (isAdvancing.current) return
    isAdvancing.current = true
    advanceGuess()
  }

  if (!queue.length || !currentEntry || !authorDial) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading<Ellipsis /></p>
      </div>
    )
  }

  const authorName = players.find(([id]) => id === currentEntry.authorId)?.[1].name ?? "?"
  const clue = playerClues[currentEntry.authorId]?.[currentEntry.dialIndex] ?? ""

  const myResultKey = amIGuesser ? `${mp.playerId}-${currentEntry.dialIndex}-${currentEntry.authorId}` : null
  const myResult = myResultKey ? guessResults[myResultKey] : undefined
  const amILocked = !!myResult

  const displayPosition = amILocked ? { x: myResult!.position, y: myResult!.posY ?? 50 } : position

  // Extra dots: author always sees live + locked; everyone sees after reveal
  const extraPoints: ExtraPoint[] = amIAuthor
    ? guessers.flatMap(g => {
        const key = `${g.id}-${currentEntry.dialIndex}-${currentEntry.authorId}`
        const result = guessResults[key]
        if (result) return [{ x: result.position, y: result.posY ?? 50, color: g.color }]
        const other = others.find(o => o.presence?.playerId === g.id)
        const lx = other?.presence?.dialPosition
        const ly = other?.presence?.dialPositionY
        return lx != null && ly != null ? [{ x: lx, y: ly, color: g.color }] : []
      })
    : allGuessersLocked
      ? guessers.map(g => {
          const key = `${g.id}-${currentEntry.dialIndex}-${currentEntry.authorId}`
          const r = guessResults[key]
          return { x: r?.position ?? 50, y: r?.posY ?? 50, color: g.color }
        })
      : []

  const currentRound = currentEntry.dialIndex + 1
  const totalDialRounds = Math.max(...queue.map(e => e.dialIndex)) + 1

  return (
    <div className="h-screen overflow-hidden flex flex-col items-center justify-center gap-5 bg-background px-4 py-6 pb-20">
      <EmojiReactions />
      <div className="w-full max-w-sm flex flex-col gap-4">
        {/* Header */}
        <div className="text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
            Round {currentRound} of {totalDialRounds}
          </p>
          <h2 className="text-xl font-semibold">
            {amIAuthor ? "Watch the guesses" : "Place your point"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Clue by <span className="font-medium">{authorName}</span>
          </p>
        </div>

        {/* Clue */}
        <div className="rounded-xl border bg-muted/40 px-6 py-3 text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Clue</p>
          <p className="text-2xl font-semibold text-foreground">{clue}</p>
        </div>

        {/* 2D Plane */}
        <SpectrumPlane
          config={authorDial}
          position={displayPosition}
          onPositionChange={amIGuesser && !amILocked ? handlePositionChange : () => {}}
          showTarget={amIAuthor || allGuessersLocked}
          disabled={!amIGuesser || amILocked || amIAuthor}
          hidePoint={amIAuthor}
          extraPoints={extraPoints}
        />

        {/* Guesser status */}
        {(amIAuthor || amILocked || allGuessersLocked) && (
          <div className="flex flex-col gap-1">
            {guessers.map(g => {
              const key = `${g.id}-${currentEntry.dialIndex}-${currentEntry.authorId}`
              const result = guessResults[key]
              const locked = !!result
              return (
                <div key={g.id} className="flex items-center gap-2 text-xs">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: g.color }} />
                  <span className="text-muted-foreground">{g.name}{g.id === mp.playerId ? " (you)" : ""}</span>
                  <span className="ml-auto">
                    {allGuessersLocked && result ? (
                      <span className="font-semibold text-foreground">
                        {result.points >= 0 ? "+" : ""}{result.points} pt{Math.abs(result.points) !== 1 ? "s" : ""}
                        {result.doubleDown && <span className="ml-1 text-amber-400 font-bold text-[10px]">2×</span>}
                      </span>
                    ) : locked ? (
                      <span className="text-muted-foreground">Locked in</span>
                    ) : (
                      <span className="text-muted-foreground">Placing<Ellipsis /></span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Guesser actions */}
        {amIGuesser && !amILocked && (
          <div className="flex gap-2">
            <button
              onClick={() => setDoubleDown(v => !v)}
              title="Double your points if you score anything — lose 2 pts if you miss"
              className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                doubleDown
                  ? "border-amber-500 bg-amber-500/10 text-amber-500"
                  : "border-border text-muted-foreground hover:border-amber-500/50"
              }`}
            >
              Double Down{doubleDown ? " ✓" : ""}
            </button>
            <Button className="flex-1" onClick={handleLockIn}>Lock In</Button>
          </div>
        )}

        {amIGuesser && amILocked && !allGuessersLocked && (
          <p className="text-sm text-center text-muted-foreground">Waiting for others<Ellipsis /></p>
        )}

        {allGuessersLocked && amIAuthor && (
          <div className="flex items-center gap-3">
            <Button className="flex-1" onClick={handleAdvance}>Next</Button>
            {autoAdvanceTimer !== null && autoAdvanceTimer > 0 && (
              <span className="text-sm text-muted-foreground tabular-nums w-6 text-center">{autoAdvanceTimer}</span>
            )}
          </div>
        )}

        {allGuessersLocked && !amIAuthor && (
          <p className="text-sm text-center text-muted-foreground">
            Waiting for {authorName} to continue
            {autoAdvanceTimer !== null && autoAdvanceTimer > 0 && (
              <span className="ml-1 tabular-nums">({autoAdvanceTimer})</span>
            )}
          </p>
        )}

        {amIAuthor && !allGuessersLocked && (
          <p className="text-sm text-center text-muted-foreground">Watching guesses come in<Ellipsis /></p>
        )}
      </div>
    </div>
  )
}
