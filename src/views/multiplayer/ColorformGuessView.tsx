import { useEffect, useRef, useState } from "react"
import { useGame } from "@/context/GameContext"
import { useMultiplayer } from "@/context/MultiplayerContext"
import { useStorage, useMutation } from "@/lib/liveblocks"
import { ColorGrid } from "@/components/game/ColorGrid"
import { EmojiReactions } from "@/components/game/EmojiReactions"
import { Button } from "@/components/ui/button"
import { Ellipsis } from "@/components/ui/ellipsis"
import { calcColorPoints, COLOR_PALETTE } from "@/lib/colorPalette"

export function ColorformGuessView() {
  const { goTo } = useGame()
  const { mp } = useMultiplayer()

  const players = useStorage((s) => (s ? Object.entries(s.players) : [])) ?? []
  const playerColors = useStorage((s) =>
    s ? (s.playerColors as Record<string, number[]>) : ({} as Record<string, number[]>),
  ) ?? {}
  const playerClues = useStorage((s) =>
    s ? (s.playerClues as Record<string, string[]>) : ({} as Record<string, string[]>),
  ) ?? {}
  const queue = useStorage((s) => (s ? [...s.guessingQueue] : [])) ?? []
  const currentGuessIndex = useStorage((s) => s?.currentGuessIndex ?? 0) ?? 0
  const guessResults = useStorage((s) =>
    s
      ? (s.guessResults as Record<string, { position: number; points: number }>)
      : ({} as Record<string, { position: number; points: number }>),
  ) ?? {}
  const phase = useStorage((s) => s?.phase)

  const [selectedColorIndex, setSelectedColorIndex] = useState<number | null>(null)
  const [resetFor, setResetFor] = useState<number | null>(null)
  const [autoAdvanceTimer, setAutoAdvanceTimer] = useState<number | null>(null)
  const isAdvancing = useRef(false)

  const currentEntry = queue[currentGuessIndex ?? 0]
  const amIAuthor = currentEntry?.authorId === mp.playerId

  const guessers = players
    .filter(([id]) => id !== currentEntry?.authorId)
    .map(([id, info]) => ({ id, color: info.color, name: info.name }))
  const amIGuesser = guessers.some((g) => g.id === mp.playerId)

  const allGuessersLocked =
    guessers.length > 0 &&
    !!currentEntry &&
    guessers.every((g) => {
      const key = `${g.id}-${currentEntry.dialIndex}-${currentEntry.authorId}`
      return !!guessResults[key]
    })

  const authorTarget = playerColors[currentEntry?.authorId ?? ""]?.[currentEntry?.dialIndex ?? 0]

  if (currentGuessIndex !== resetFor) {
    setResetFor(currentGuessIndex ?? 0)
    setSelectedColorIndex(null)
  }

  useEffect(() => {
    isAdvancing.current = false
  }, [currentGuessIndex])

  useEffect(() => {
    if (phase === "results") goTo("multiResults")
  }, [phase, goTo])

  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [])

  useEffect(() => {
    if (!allGuessersLocked) return
    const DURATION = 12
    const startTime = Date.now()
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      setAutoAdvanceTimer(Math.max(0, DURATION - elapsed))
    }, 200)
    return () => {
      clearInterval(interval)
      setAutoAdvanceTimer(null)
    }
  }, [allGuessersLocked, currentGuessIndex])

  const recordGuess = useMutation(
    (
      { storage },
      guesserId: string,
      dialIndex: number,
      authorId: string,
      colorIndex: number,
      points: number,
    ) => {
      const key = `${guesserId}-${dialIndex}-${authorId}`
      storage.get("guessResults").set(key, { position: colorIndex, points })
    },
    [],
  )

  const advanceGuess = useMutation(({ storage }) => {
    const current = storage.get("currentGuessIndex")
    const nextIndex = current + 1
    storage.set("currentGuessIndex", nextIndex)
    if (nextIndex >= storage.get("guessingQueue").length) {
      storage.set("phase", "results")
    }
  }, [])

  useEffect(() => {
    if (autoAdvanceTimer === 0 && amIAuthor && allGuessersLocked && !isAdvancing.current) {
      isAdvancing.current = true
      advanceGuess()
    }
  }, [autoAdvanceTimer, amIAuthor, allGuessersLocked, advanceGuess])

  function handleLockIn() {
    if (!currentEntry || !amIGuesser || selectedColorIndex === null) return
    const pts = calcColorPoints(selectedColorIndex, authorTarget ?? 0)
    recordGuess(mp.playerId, currentEntry.dialIndex, currentEntry.authorId, selectedColorIndex, pts)
  }

  function handleAdvance() {
    if (isAdvancing.current) return
    isAdvancing.current = true
    advanceGuess()
  }

  if (!queue.length || !currentEntry) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading<Ellipsis /></p>
      </div>
    )
  }

  const authorName = players.find(([id]) => id === currentEntry.authorId)?.[1].name ?? "?"
  const clue = playerClues[currentEntry.authorId]?.[currentEntry.dialIndex] ?? ""

  const myResultKey = amIGuesser
    ? `${mp.playerId}-${currentEntry.dialIndex}-${currentEntry.authorId}`
    : null
  const myResult = myResultKey ? guessResults[myResultKey] : undefined
  const amILocked = !!myResult

  const guessMarkers = allGuessersLocked
    ? guessers.flatMap((g) => {
        const key = `${g.id}-${currentEntry.dialIndex}-${currentEntry.authorId}`
        const result = guessResults[key]
        return result !== undefined ? [{ index: result.position, playerColor: g.color }] : []
      })
    : []

  const displayColorIndex = amILocked ? myResult!.position : selectedColorIndex
  const currentRound = currentEntry.dialIndex + 1
  const totalDialRounds = Math.max(...queue.map((e) => e.dialIndex)) + 1

  const scoreRadiusCenter = allGuessersLocked ? authorTarget : undefined

  return (
    <div className="h-screen overflow-y-auto flex flex-col items-center bg-background pb-20">
      <EmojiReactions />

      <div className="w-full max-w-sm px-4 pt-5 flex flex-col gap-4">
        <div className="text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
            Round {currentRound} of {totalDialRounds}
          </p>
          <h2 className="text-xl font-semibold">
            {amIAuthor ? "Watch the guesses" : "Find the color"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Clue by <span className="font-medium">{authorName}</span>
          </p>
        </div>

        <div className="rounded-xl border bg-muted/40 px-6 py-4 text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Clue</p>
          <p className="text-2xl font-semibold text-foreground">{clue}</p>
        </div>
      </div>

      <div className="w-full px-2 mt-4">
        <ColorGrid
          selectedIndex={displayColorIndex}
          onSelect={amIGuesser && !amILocked ? setSelectedColorIndex : () => {}}
          targetIndex={allGuessersLocked ? authorTarget : undefined}
          scoreRadiusCenter={scoreRadiusCenter}
          guessMarkers={guessMarkers}
          disabled={!amIGuesser || amILocked || amIAuthor}
        />
      </div>

      <div className="w-full max-w-sm px-4 mt-4 flex flex-col gap-4">

        {amIGuesser && !amILocked && (
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex-shrink-0 border border-border transition-colors"
              style={{
                background:
                  selectedColorIndex !== null
                    ? COLOR_PALETTE[selectedColorIndex]
                    : "hsl(var(--muted))",
              }}
            />
            <Button
              className="flex-1"
              disabled={selectedColorIndex === null}
              onClick={handleLockIn}
            >
              Lock In
            </Button>
          </div>
        )}

        {amIGuesser && amILocked && (
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex-shrink-0 border-2 border-border"
              style={{ background: COLOR_PALETTE[myResult!.position] }}
            />
            <div className="flex-1">
              {allGuessersLocked ? (
                <p className="text-sm font-semibold text-foreground">
                  +{myResult!.points} pt{myResult!.points !== 1 ? "s" : ""}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Locked in — waiting for others<Ellipsis />
                </p>
              )}
            </div>
          </div>
        )}

        {(amIAuthor || amILocked || allGuessersLocked) && (
          <div className="flex flex-col gap-1.5">
            {guessers.map((g) => {
              const key = `${g.id}-${currentEntry.dialIndex}-${currentEntry.authorId}`
              const result = guessResults[key]
              const locked = !!result
              return (
                <div key={g.id} className="flex items-center gap-2 text-xs">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: g.color }}
                  />
                  <span className="text-muted-foreground">
                    {g.name}
                    {g.id === mp.playerId ? " (you)" : ""}
                  </span>
                  {result !== undefined && (
                    <div
                      className="ml-1 w-4 h-4 rounded flex-shrink-0 border border-border/50"
                      style={{ background: COLOR_PALETTE[result.position] }}
                    />
                  )}
                  <span className="ml-auto">
                    {allGuessersLocked && result !== undefined ? (
                      <span className="font-semibold text-foreground">
                        +{result.points} pt{result.points !== 1 ? "s" : ""}
                      </span>
                    ) : locked ? (
                      <span className="text-muted-foreground">Locked in</span>
                    ) : (
                      <span className="text-muted-foreground">
                        Picking<Ellipsis />
                      </span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {allGuessersLocked && authorTarget !== undefined && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border">
            <div
              className="w-10 h-10 rounded-lg flex-shrink-0 border-2 border-white shadow"
              style={{ background: COLOR_PALETTE[authorTarget] }}
            />
            <div>
              <p className="text-xs text-muted-foreground">Target color</p>
              <p className="text-sm font-mono">{COLOR_PALETTE[authorTarget]}</p>
            </div>
          </div>
        )}

        {allGuessersLocked && amIAuthor && (
          <div className="flex items-center gap-3">
            <Button className="flex-1" onClick={handleAdvance}>
              Next
            </Button>
            {autoAdvanceTimer !== null && autoAdvanceTimer > 0 && (
              <span className="text-sm text-muted-foreground tabular-nums w-6 text-center">
                {autoAdvanceTimer}
              </span>
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
          <p className="text-sm text-center text-muted-foreground">
            Watching guesses come in<Ellipsis />
          </p>
        )}
      </div>
    </div>
  )
}
