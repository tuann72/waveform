import { useEffect, useRef, useState } from "react"
import { useGame } from "@/context/GameContext"
import { useMultiplayer } from "@/context/MultiplayerContext"
import { useStorage, useMutation, useOthers, useUpdateMyPresence } from "@/lib/liveblocks"
import type { Dial2DConfig } from "@/lib/liveblocks"
import { SpectrumPlane } from "@/components/game/SpectrumPlane"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Ellipsis } from "@/components/ui/ellipsis"
import { spectrumCards } from "@/data/spectrumCards"
import { cn } from "@/lib/utils"

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pickDials2D(totalRounds: number, selectedCategories: string[]): Dial2DConfig[] {
  const pool = selectedCategories.length > 0
    ? spectrumCards.filter(c => c.category && selectedCategories.includes(c.category))
    : spectrumCards
  const shuffled = shuffle([...pool])
  return Array.from({ length: totalRounds }, (_, i) => {
    const h = shuffled[(i * 2) % shuffled.length]
    const v = shuffled[(i * 2 + 1) % shuffled.length]
    return {
      id: `${h.id}|${v.id}`,
      left: h.left,
      right: h.right,
      bottom: v.left,
      top: v.right,
      targetX: Math.random() * 86 + 7,
      targetY: Math.random() * 86 + 7,
    }
  })
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`
}

export function Multi2DClueView() {
  const { goTo } = useGame()
  const { mp } = useMultiplayer()
  const updatePresence = useUpdateMyPresence()
  const others = useOthers()

  const totalRounds = useStorage((s) => s?.totalRounds ?? 3) ?? 3
  const players = useStorage((s) => (s ? Object.entries(s.players) : [])) ?? []
  const player2DDials = useStorage((s) =>
    s ? (s.player2DDials as unknown as Record<string, Dial2DConfig[]>) : ({} as Record<string, Dial2DConfig[]>)
  ) ?? {}
  const playerClues = useStorage((s) =>
    s ? (s.playerClues as Record<string, string[]>) : ({} as Record<string, string[]>)
  ) ?? {}
  const phase = useStorage((s) => s?.phase)
  const clueTimerDuration = useStorage((s) => s?.clueTimerDuration ?? 90) ?? 90
  const cluePhaseStartTime = useStorage((s) => s?.cluePhaseStartTime ?? null)
  const selectedCategories = useStorage((s) => s?.selectedCategories ?? []) ?? []

  const myDials = player2DDials[mp.playerId] ?? []

  const [clues, setClues] = useState<string[]>([])
  const [currentDial, setCurrentDial] = useState(0)
  const [cluesInitializedFor, setCluesInitializedFor] = useState(0)
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [hasRerolled, setHasRerolled] = useState(false)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const savedOnExpiryRef = useRef(false)

  if (myDials.length > 0 && myDials.length !== cluesInitializedFor) {
    setCluesInitializedFor(myDials.length)
    setClues(Array(myDials.length).fill(""))
  }

  const effectiveTimerDuration = clueTimerDuration * totalRounds
  const timerActive = clueTimerDuration > 0 && cluePhaseStartTime !== null

  useEffect(() => {
    if (!clueTimerDuration || !cluePhaseStartTime) return
    const tick = () => {
      const elapsed = Math.floor((Date.now() - cluePhaseStartTime) / 1000)
      setTimeLeft(Math.max(0, effectiveTimerDuration - elapsed))
    }
    tick()
    const interval = setInterval(tick, 500)
    return () => clearInterval(interval)
  }, [clueTimerDuration, cluePhaseStartTime, effectiveTimerDuration])

  const timerExpired = timerActive && timeLeft === 0

  useEffect(() => {
    if (phase === "guessing") goTo("multiGuess")
    if (phase === "results") goTo("multiResults")
  }, [phase, goTo])

  const savePlayer2DDials = useMutation(({ storage }, playerId: string, dials: Dial2DConfig[]) => {
    const pd = storage.get("player2DDials")
    if (!pd.get(playerId)) pd.set(playerId, dials)
  }, [])

  const saveClues = useMutation(({ storage }, playerId: string, submitted: string[]) => {
    storage.get("playerClues").set(playerId, submitted)
  }, [])

  const advanceToGuessing2D = useMutation(({ storage }, playerIds: string[]) => {
    if (storage.get("phase") !== "clue") return
    const dialsMap = storage.get("player2DDials")
    const cluesMap = storage.get("playerClues")
    const lb = storage.get("guessingQueue")
    const maxDials = Math.max(...playerIds.map(id => (dialsMap.get(id) ?? []).length), 0)
    for (let d = 0; d < maxDials; d++) {
      for (const authorId of playerIds) {
        const authorClues = cluesMap.get(authorId) ?? []
        if (authorClues[d]?.trim()) lb.push({ dialIndex: d, authorId })
      }
    }
    storage.set("currentGuessIndex", 0)
    storage.set("phase", lb.length > 0 ? "guessing" : "results")
  }, [])

  const rerollDial2D = useMutation(({ storage }, playerId: string, roundIndex: number, categories: string[]) => {
    const pd = storage.get("player2DDials")
    const current = pd.get(playerId) ?? []
    const usedIds = new Set(current.flatMap(d => d.id.split("|")))
    const pool = categories.length > 0
      ? spectrumCards.filter(c => c.category && categories.includes(c.category))
      : spectrumCards
    const available = shuffle(pool.filter(c => !usedIds.has(c.id)))
    const src = available.length >= 2 ? available : shuffle([...pool])
    const h = src[0]
    const v = src[1] ?? src[0]
    const newDials = [...current]
    newDials[roundIndex] = {
      id: `${h.id}|${v.id}`,
      left: h.left,
      right: h.right,
      bottom: v.left,
      top: v.right,
      targetX: Math.random() * 86 + 7,
      targetY: Math.random() * 86 + 7,
    }
    pd.set(playerId, newDials)
  }, [])

  const clearMyClues = useMutation(({ storage }, playerId: string) => {
    storage.get("playerClues").delete(playerId)
  }, [])

  useEffect(() => {
    if (!player2DDials[mp.playerId]) {
      savePlayer2DDials(mp.playerId, pickDials2D(totalRounds, selectedCategories))
    }
  }, [totalRounds])

  useEffect(() => {
    if (!timerExpired || savedOnExpiryRef.current || hasSubmitted) return
    savedOnExpiryRef.current = true
    saveClues(mp.playerId, clues)
    updatePresence({ cluesComplete: true })
  }, [timerExpired])

  useEffect(() => {
    if (!mp.isHost || !timerExpired || !players.length) return
    const allPlayerIds = players.map(([id]) => id)
    const allComplete = others.every(o => o.presence?.cluesComplete === true)
    if (allComplete) { advanceToGuessing2D(allPlayerIds); return }
    const timer = setTimeout(() => advanceToGuessing2D(allPlayerIds), 5000)
    return () => clearTimeout(timer)
  }, [timerExpired, mp.isHost, players, others])

  useEffect(() => {
    if (!mp.isHost || !players.length || timerExpired) return
    const allPlayerIds = players.map(([id]) => id)
    const allReady = allPlayerIds.every(id => {
      const dialCount = player2DDials[id]?.length ?? 0
      return dialCount > 0 && (playerClues[id]?.length ?? 0) >= dialCount && playerClues[id]?.every(c => c.trim())
    })
    if (allReady) advanceToGuessing2D(allPlayerIds)
  }, [playerClues, player2DDials, players])

  function handleSubmitAll() {
    if (clues.some(c => !c.trim())) return
    setHasSubmitted(true)
    saveClues(mp.playerId, clues)
    updatePresence({ cluesComplete: true })
  }

  function handleReroll() {
    const next = [...clues]
    next[currentDial] = ""
    setClues(next)
    setHasRerolled(true)
    rerollDial2D(mp.playerId, currentDial, selectedCategories)
  }

  function handleUnlock() {
    setHasSubmitted(false)
    clearMyClues(mp.playerId)
    updatePresence({ cluesComplete: false })
  }

  const allOthersSubmitted = players
    .filter(([id]) => id !== mp.playerId)
    .every(([id]) => {
      const saved = playerClues[id] ?? []
      const dialCount = player2DDials[id]?.length ?? 0
      return dialCount > 0 && saved.length >= dialCount && saved.every(c => c.trim())
    })

  const myCluesSubmitted = hasSubmitted || timerExpired

  const timerPercent =
    timerActive && timeLeft !== null && effectiveTimerDuration > 0
      ? (timeLeft / effectiveTimerDuration) * 100
      : 100
  const timerBarColor =
    timerPercent > 30 ? "bg-primary" : timerPercent > 10 ? "bg-amber-500" : "bg-red-500"
  const timerTextColor =
    timerPercent <= 10 ? "text-red-500" : timerPercent <= 30 ? "text-amber-500" : "text-foreground"

  if (!myDials.length) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading<Ellipsis /></p>
      </div>
    )
  }

  const dial = myDials[currentDial]

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-4 py-8">
      <div className="w-full max-w-sm flex flex-col gap-5">
        <div className="text-center">
          <h2 className="text-xl font-semibold">Write Your Clue</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Give one clue that hints at both axes
          </p>
        </div>

        {/* Timer bar */}
        {timerActive && (
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Time remaining</span>
              <span className={`text-sm font-mono font-semibold tabular-nums ${timerTextColor}`}>
                {timerExpired ? "Time's up!" : formatTime(timeLeft ?? 0)}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${timerBarColor}`} style={{ width: `${timerPercent}%` }} />
            </div>
          </div>
        )}

        {/* Progress indicator */}
        <div className="flex items-center">
          <span className="text-xs text-muted-foreground">Round {currentDial + 1} of {myDials.length}</span>
        </div>

        {/* Round tabs */}
        <div className="flex gap-1">
          {myDials.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentDial(i)}
              disabled={myCluesSubmitted}
              className={cn(
                "flex-1 h-1.5 rounded-full transition-colors cursor-pointer",
                i === currentDial ? "bg-primary" : clues[i]?.trim() ? "bg-primary/40" : "bg-muted",
              )}
            />
          ))}
        </div>

        {/* 2D plane — target visible, no player dot (clue phase) */}
        <SpectrumPlane
          config={dial}
          position={{ x: 50, y: 50 }}
          onPositionChange={() => {}}
          showTarget={true}
          disabled={true}
          hidePoint={true}
        />

        {/* Reroll button */}
        {!myCluesSubmitted && (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" disabled={hasRerolled} onClick={handleReroll} className="text-xs">
              {hasRerolled ? "Rerolled" : "Reroll Both Axes"}
            </Button>
          </div>
        )}

        {/* Clue input */}
        {!myCluesSubmitted ? (
          <div className="flex flex-col gap-2">
            <div className="relative">
              <Input
                key={currentDial}
                placeholder="One clue for both axes…"
                value={clues[currentDial] ?? ""}
                maxLength={50}
                onChange={e => {
                  const next = [...clues]
                  next[currentDial] = e.target.value
                  setClues(next)
                }}
                onKeyDown={e => {
                  if (e.key === "Enter" && currentDial < myDials.length - 1) setCurrentDial(n => n + 1)
                }}
                autoFocus
              />
              <span className={cn(
                "absolute right-2 bottom-1.5 text-xs tabular-nums pointer-events-none",
                (clues[currentDial]?.length ?? 0) >= 45 ? "text-amber-500" : "text-muted-foreground/50",
                (clues[currentDial]?.length ?? 0) >= 50 && "text-red-500",
              )}>
                {clues[currentDial]?.length ?? 0}/50
              </span>
            </div>
            <div className="flex gap-2">
              {currentDial > 0 && (
                <Button variant="outline" className="flex-1" onClick={() => setCurrentDial(n => n - 1)}>← Prev</Button>
              )}
              {currentDial < myDials.length - 1 ? (
                <Button className="flex-1" onClick={() => setCurrentDial(n => n + 1)}>Next →</Button>
              ) : (
                <Button className="flex-1" disabled={clues.some(c => !c.trim())} onClick={handleSubmitAll}>
                  Submit All Clues
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-2">
            <p className="text-center text-sm text-muted-foreground">
              {timerExpired && !hasSubmitted
                ? "Time's up! Your clues have been saved."
                : <>Clues submitted! Waiting for others<Ellipsis /></>}
            </p>
            {hasSubmitted && !timerExpired && !allOthersSubmitted && (
              <Button variant="outline" size="sm" onClick={handleUnlock}>Edit Clues</Button>
            )}
          </div>
        )}

        <Separator />

        {/* Player status */}
        <div className="flex flex-col gap-1.5">
          {players.map(([id, info]) => {
            const saved = playerClues[id] ?? []
            const fullyDone = saved.length > 0 && saved.every(c => c.trim())
            const partial = !fullyDone && saved.some(c => c.trim())
            return (
              <div key={id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: info.color }} />
                  <span>{info.name}{id === mp.playerId ? " (you)" : ""}</span>
                </div>
                <Badge variant={fullyDone ? "default" : "outline"}>
                  {fullyDone ? "Ready" : partial ? "Partial" : <>Writing<Ellipsis /></>}
                </Badge>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
