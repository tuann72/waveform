import { useEffect, useRef } from "react"

const W = 320
const DINO_X = 52
const DINO_BODY_W = 18
const DINO_BODY_H = 20
const DINO_HEAD_W = 15
const DINO_HEAD_H = 12
const DINO_TOTAL_H = DINO_BODY_H + DINO_HEAD_H - 3   // 29
const DINO_DUCK_W = 26
const DINO_DUCK_H = 14
const BIRD_W = 22
const BIRD_H = 9
const GRAVITY = 0.65
const JUMP_VEL = -12
const BASE_SPEED = 3.5
const MAX_SPEED = 9

interface Cactus { kind: "cactus"; x: number; w: number; h: number }
interface Bird    { kind: "bird";   x: number; y: number }
type Obstacle = Cactus | Bird

type Phase = "idle" | "playing" | "dead"

interface State {
  phase: Phase
  dinoTop: number
  vel: number
  onGround: boolean
  isDucking: boolean
  obstacles: Obstacle[]
  frame: number
  score: number
  speed: number
  nextCactus: number
  nextBird: number
}

function makeState(groundY: number): State {
  return {
    phase: "idle",
    dinoTop: groundY - DINO_TOTAL_H,
    vel: 0,
    onGround: true,
    isDucking: false,
    obstacles: [],
    frame: 0,
    score: 0,
    speed: BASE_SPEED,
    nextCactus: 90,
    nextBird: 220,
  }
}

interface Props { height?: number }

export function DinoGame({ height = 160 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const groundY = height - 18
  const s = useRef<State>(makeState(groundY))
  const isPaused = useRef(false)
  const unpausedAt = useRef(0)

  // Low bird (duck required): flies at dino head level
  // Math for H=160: GY=142, low=116 → bird bottom 125, duck top 130 → no overlap ✓
  const birdLowY  = groundY - DINO_BODY_H - 12
  // High bird (safe): flies above standing dino head
  const birdHighY = groundY - DINO_TOTAL_H - 15

  function jump() {
    const st = s.current
    if (st.isDucking) return
    if (st.phase === "dead") {
      s.current = { ...makeState(groundY), phase: "playing", vel: JUMP_VEL, onGround: false }
    } else if (st.phase === "idle") {
      st.phase = "playing"
      st.vel = JUMP_VEL
      st.onGround = false
    } else if (st.onGround) {
      st.vel = JUMP_VEL
      st.onGround = false
    }
  }

  function startDuck() { s.current.isDucking = true }
  function stopDuck()  { s.current.isDucking = false }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const GY = groundY

    function drawBird(ctx: CanvasRenderingContext2D, bx: number, by: number, wingsUp: boolean) {
      // body
      ctx.fillRect(bx + 6, by + 2, 10, 6)
      // beak
      ctx.fillRect(bx + 16, by + 3, 5, 2)
      // wings alternate between up and down
      if (wingsUp) {
        ctx.fillRect(bx,      by,     7, 3)
        ctx.fillRect(bx + 15, by + 1, 7, 3)
      } else {
        ctx.fillRect(bx,      by + 6, 7, 3)
        ctx.fillRect(bx + 15, by + 6, 7, 3)
      }
    }

    function draw() {
      const ctx = canvas!.getContext("2d")
      if (!ctx) return
      const st = s.current
      ctx.clearRect(0, 0, W, height)

      const raw = getComputedStyle(canvas!).color
      const fg = raw.startsWith("rgba") ? raw : raw.replace("rgb(", "rgba(").replace(")", ", 1)")
      ctx.fillStyle = fg

      // ground line
      ctx.globalAlpha = 0.15
      ctx.fillRect(0, GY, W, 2)
      ctx.globalAlpha = 1

      // obstacles
      for (const obs of st.obstacles) {
        if (obs.kind === "cactus") {
          const trunkW = 8
          const trunkX = obs.x + Math.floor((obs.w - trunkW) / 2)
          ctx.fillRect(trunkX, GY - obs.h, trunkW, obs.h)
          if (obs.w > trunkW) {
            const armH = Math.floor(obs.h * 0.55)
            const armTop = GY - armH
            ctx.fillRect(obs.x, armTop, 6, armH)
            ctx.fillRect(obs.x + obs.w - 6, armTop + 5, 6, armH - 5)
            ctx.fillRect(obs.x + 6, GY - Math.floor(obs.h * 0.45), trunkX - obs.x - 6, 5)
            ctx.fillRect(trunkX + trunkW, GY - Math.floor(obs.h * 0.4), obs.x + obs.w - 6 - trunkX - trunkW, 5)
          }
        } else {
          drawBird(ctx, obs.x, obs.y, Math.floor(st.frame / 9) % 2 === 0)
        }
      }

      // dino
      const ducking = st.isDucking && st.onGround
      if (ducking) {
        ctx.fillRect(DINO_X - 2, GY - DINO_DUCK_H, DINO_DUCK_W, DINO_DUCK_H)
        ctx.fillRect(DINO_X + DINO_DUCK_W - 6, GY - DINO_DUCK_H - 5, 10, 7)  // head nub
      } else {
        const bodyTop = st.dinoTop + DINO_HEAD_H - 3
        ctx.fillRect(DINO_X,     bodyTop,       DINO_BODY_W, DINO_BODY_H)
        ctx.fillRect(DINO_X + 3, st.dinoTop,    DINO_HEAD_W, DINO_HEAD_H)
        ctx.fillRect(DINO_X - 5, bodyTop + 6,   7,           5)  // tail
      }

      // score
      ctx.font = "bold 13px monospace"
      ctx.textAlign = "right"
      ctx.textBaseline = "top"
      ctx.fillText(String(Math.floor(st.score)).padStart(5, "0"), W - 10, 8)

      // idle / dead / paused overlays — drawn after all game objects
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      if (isPaused.current && st.phase === "playing") {
        ctx.globalAlpha = 0.18
        ctx.fillRect(0, 0, W, height)
        ctx.globalAlpha = 0.7
        ctx.font = "bold 13px monospace"
        ctx.fillText("PAUSED", W / 2, height * 0.38)
        ctx.globalAlpha = 0.45
        ctx.font = "11px monospace"
        ctx.fillText("click to resume", W / 2, height * 0.54)
        ctx.globalAlpha = 1
      } else if (st.phase === "idle") {
        ctx.globalAlpha = 0.38
        ctx.font = "11px monospace"
        ctx.fillText("↑ = jump  •  ↓ = duck", W / 2, height * 0.36)
        ctx.fillText("tap top = jump  •  tap bottom = duck", W / 2, height * 0.51)
        ctx.globalAlpha = 1
      } else if (st.phase === "dead") {
        ctx.font = "bold 13px monospace"
        ctx.fillText("GAME OVER", W / 2, height * 0.34)
        ctx.globalAlpha = 0.45
        ctx.font = "11px monospace"
        ctx.fillText("tap to restart", W / 2, height * 0.5)
        ctx.globalAlpha = 1
      }
    }

    function tick() {
      const st = s.current

      if (st.phase === "playing" && !isPaused.current) {
        // ducking in the air = fast-fall
        if (st.isDucking && !st.onGround && st.vel < 0) st.vel = 6

        st.vel += GRAVITY
        st.dinoTop += st.vel
        if (st.dinoTop >= GY - DINO_TOTAL_H) {
          st.dinoTop = GY - DINO_TOTAL_H
          st.vel = 0
          st.onGround = true
        }

        st.speed = Math.min(MAX_SPEED, BASE_SPEED + st.frame * 0.005)
        st.frame++
        st.score += st.speed * 0.045

        // spawn cactus
        st.nextCactus--
        if (st.nextCactus <= 0) {
          const cluster = Math.random() < 0.35
          st.obstacles.push({
            kind: "cactus",
            x: W + 10,
            w: cluster ? 28 : 12 + Math.floor(Math.random() * 6),
            h: cluster ? 26 + Math.floor(Math.random() * 8) : 22 + Math.floor(Math.random() * 14),
          })
          const gap = Math.max(55, 100 - Math.floor(st.speed * 4))
          st.nextCactus = gap + Math.floor(Math.random() * 50)
        }

        // spawn birds (after frame 200)
        if (st.frame > 200) {
          st.nextBird--
          if (st.nextBird <= 0) {
            st.obstacles.push({
              kind: "bird",
              x: W + 10,
              y: Math.random() < 0.6 ? birdLowY : birdHighY,
            })
            st.nextBird = 120 + Math.floor(Math.random() * 90)
          }
        }

        // move obstacles (birds slightly faster)
        for (const obs of st.obstacles) obs.x -= st.speed * (obs.kind === "bird" ? 1.15 : 1)
        st.obstacles = st.obstacles.filter(o => o.x + (o.kind === "cactus" ? o.w : BIRD_W) > 0)

        // collision — hitbox depends on duck state
        let dl: number, dr: number, dt: number, db: number
        if (st.isDucking && st.onGround) {
          dl = DINO_X - 2 + 2
          dr = DINO_X - 2 + DINO_DUCK_W - 2
          dt = GY - DINO_DUCK_H + 2
          db = GY - 2
        } else {
          dl = DINO_X + 3
          dr = DINO_X + DINO_BODY_W - 2
          dt = st.dinoTop + 2
          db = st.dinoTop + DINO_TOTAL_H - 2
        }

        for (const obs of st.obstacles) {
          let obsL: number, obsR: number, obsT: number, obsB: number
          if (obs.kind === "cactus") {
            obsL = obs.x + 2;  obsR = obs.x + obs.w - 2
            obsT = GY - obs.h + 2;  obsB = GY - 2
          } else {
            obsL = obs.x + 2;  obsR = obs.x + BIRD_W - 2
            obsT = obs.y + 1;  obsB = obs.y + BIRD_H - 1
          }
          if (dr > obsL && dl < obsR && db > obsT && dt < obsB) {
            st.phase = "dead"
          }
        }
      }

      draw()
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [height, groundY, birdLowY, birdHighY])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowUp") { e.preventDefault(); jump() }
    if (e.key === "ArrowDown") { e.preventDefault(); startDuck() }
  }

  function handleKeyUp(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") stopDuck()
  }

  function handleMouseMove() {
    if (s.current.phase === "playing" && Date.now() - unpausedAt.current > 800) {
      isPaused.current = true
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    e.currentTarget.focus()
    if (isPaused.current) {
      isPaused.current = false
      unpausedAt.current = Date.now()
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const relY = (e.clientY - rect.top) / rect.height
    if (relY > 0.55 && s.current.phase === "playing") {
      startDuck()
    } else {
      jump()
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground text-center">while you wait</p>
      <div
        className="rounded-lg border overflow-hidden select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        style={{ touchAction: "none", cursor: "pointer" }}
        onMouseMove={handleMouseMove}
        onPointerDown={handlePointerDown}
        onPointerUp={stopDuck}
        onPointerLeave={stopDuck}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        tabIndex={0}
        role="button"
        aria-label="Dino runner mini-game"
      >
        <canvas ref={canvasRef} width={W} height={height} className="w-full block" />
      </div>
    </div>
  )
}
