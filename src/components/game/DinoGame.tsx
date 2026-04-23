import { useEffect, useRef, useState } from "react";
import { Game2048 } from "./Game2048";

const W = 320;
const DINO_X = 42;
const DINO_BODY_W = 14;
const DINO_BODY_H = 15;
const DINO_HEAD_W = 11;
const DINO_HEAD_H = 9;
const DINO_TOTAL_H = DINO_BODY_H + DINO_HEAD_H - 3; // 21
const DINO_DUCK_W = 19;
const DINO_DUCK_H = 10;
const BIRD_W = 16;
const BIRD_H = 7;
const GRAVITY = 0.65;
const JUMP_VEL = -12;
const BASE_SPEED = 3.5;
const MAX_SPEED = 9;

interface Cactus {
  kind: "cactus";
  x: number;
  w: number;
  h: number;
}
interface Bird {
  kind: "bird";
  x: number;
  y: number;
}
type Obstacle = Cactus | Bird;

type Phase = "idle" | "playing" | "dead";

interface State {
  phase: Phase;
  dinoTop: number;
  vel: number;
  onGround: boolean;
  isDucking: boolean;
  obstacles: Obstacle[];
  frame: number;
  score: number;
  speed: number;
  nextCactus: number;
  nextBird: number;
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
    nextCactus: 130,
    nextBird: 220,
  };
}

interface Props {
  height?: number;
}

export function DinoGame({ height = 160 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const groundY = height - 18;
  const s = useRef<State>(makeState(groundY));
  const isPaused = useRef(false);
  const unpausedAt = useRef(0);
  const [collapsed, setCollapsed] = useState(false);
  const [selectedGame, setSelectedGame] = useState<"dino" | "2048">("dino");
  const collapsedRef = useRef(collapsed);
  const selectedGameRef = useRef(selectedGame);
  collapsedRef.current = collapsed;
  selectedGameRef.current = selectedGame;

  const birdLowY = groundY - DINO_BODY_H - 10;
  const birdHighY = groundY - DINO_TOTAL_H - 13;

  function jump() {
    const st = s.current;
    if (st.isDucking) return;
    if (st.phase === "dead") {
      s.current = {
        ...makeState(groundY),
        phase: "playing",
        vel: JUMP_VEL,
        onGround: false,
      };
    } else if (st.phase === "idle") {
      st.phase = "playing";
      st.vel = JUMP_VEL;
      st.onGround = false;
    } else if (st.onGround) {
      st.vel = JUMP_VEL;
      st.onGround = false;
    }
  }

  function startDuck() {
    s.current.isDucking = true;
  }
  function stopDuck() {
    s.current.isDucking = false;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const GY = groundY;

    function drawBird(
      ctx: CanvasRenderingContext2D,
      bx: number,
      by: number,
      wingsUp: boolean,
    ) {
      ctx.fillRect(bx + 4, by + 2, 7, 4); // body
      ctx.fillRect(bx + 11, by + 2, 4, 2); // beak
      if (wingsUp) {
        ctx.fillRect(bx, by, 5, 2);
        ctx.fillRect(bx + 10, by + 1, 5, 2);
      } else {
        ctx.fillRect(bx, by + 5, 5, 2);
        ctx.fillRect(bx + 10, by + 5, 5, 2);
      }
    }

    function draw() {
      const ctx = canvas!.getContext("2d");
      if (!ctx) return;
      const st = s.current;

      const isDark = document.documentElement.classList.contains("dark");
      const bg = isDark ? "#09090b" : "#ffffff";
      const fg = isDark ? "#ffffff" : "#0a0a0a";
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, height);
      ctx.fillStyle = fg;

      // ground line
      ctx.globalAlpha = 0.15;
      ctx.fillRect(0, GY, W, 2);
      ctx.globalAlpha = 1;

      // obstacles
      for (const obs of st.obstacles) {
        if (obs.kind === "cactus") {
          const trunkW = 6;
          const trunkX = obs.x + Math.floor((obs.w - trunkW) / 2);
          ctx.fillRect(trunkX, GY - obs.h, trunkW, obs.h);
          if (obs.w > trunkW) {
            const armH = Math.floor(obs.h * 0.55);
            const armTop = GY - armH;
            ctx.fillRect(obs.x, armTop, 4, armH);
            ctx.fillRect(obs.x + obs.w - 4, armTop + 4, 4, armH - 4);
            ctx.fillRect(
              obs.x + 4,
              GY - Math.floor(obs.h * 0.45),
              trunkX - obs.x - 4,
              4,
            );
            ctx.fillRect(
              trunkX + trunkW,
              GY - Math.floor(obs.h * 0.4),
              obs.x + obs.w - 4 - trunkX - trunkW,
              4,
            );
          }
        } else {
          drawBird(ctx, obs.x, obs.y, Math.floor(st.frame / 9) % 2 === 0);
        }
      }

      // dino
      const ducking = st.isDucking && st.onGround;
      if (ducking) {
        ctx.fillRect(DINO_X - 2, GY - DINO_DUCK_H, DINO_DUCK_W, DINO_DUCK_H);
        ctx.fillRect(DINO_X + DINO_DUCK_W - 4, GY - DINO_DUCK_H - 4, 7, 5); // head nub
      } else {
        const bodyTop = st.dinoTop + DINO_HEAD_H - 3;
        ctx.fillRect(DINO_X, bodyTop, DINO_BODY_W, DINO_BODY_H);
        ctx.fillRect(DINO_X + 2, st.dinoTop, DINO_HEAD_W, DINO_HEAD_H);
        ctx.fillRect(DINO_X - 4, bodyTop + 5, 5, 4); // tail
      }

      // score
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText(String(Math.floor(st.score)).padStart(5, "0"), W - 10, 8);

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (isPaused.current && st.phase === "playing") {
        ctx.globalAlpha = 0.18;
        ctx.fillRect(0, 0, W, height);
        ctx.globalAlpha = 0.7;
        ctx.font = "bold 11px monospace";
        ctx.fillText("PAUSED", W / 2, height * 0.38);
        ctx.globalAlpha = 0.45;
        ctx.font = "10px monospace";
        ctx.fillText("click to resume", W / 2, height * 0.54);
        ctx.globalAlpha = 1;
      } else if (st.phase === "idle") {
        ctx.globalAlpha = 0.38;
        ctx.font = "10px monospace";
        ctx.fillText("↑ = jump  •  ↓ = duck", W / 2, height * 0.36);
        ctx.fillText(
          "tap top = jump  •  tap bottom = duck",
          W / 2,
          height * 0.51,
        );
        ctx.globalAlpha = 1;
      } else if (st.phase === "dead") {
        ctx.font = "bold 11px monospace";
        ctx.fillText("GAME OVER", W / 2, height * 0.34);
        ctx.globalAlpha = 0.45;
        ctx.font = "10px monospace";
        ctx.fillText("tap to restart", W / 2, height * 0.5);
        ctx.globalAlpha = 1;
      }
    }

    const TARGET_FPS = 60;
    const FRAME_MS = 1000 / TARGET_FPS;
    let lastTime = 0;

    function tick(now: number) {
      if (collapsedRef.current || selectedGameRef.current !== "dino") {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const elapsed = now - lastTime;
      if (elapsed < FRAME_MS * 0.75) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      lastTime = now - (elapsed % FRAME_MS);

      const st = s.current;

      if (st.phase === "playing" && !isPaused.current) {
        if (st.isDucking && !st.onGround && st.vel < 0) st.vel = 6;

        st.vel += GRAVITY;
        st.dinoTop += st.vel;
        if (st.dinoTop >= GY - DINO_TOTAL_H) {
          st.dinoTop = GY - DINO_TOTAL_H;
          st.vel = 0;
          st.onGround = true;
        }

        st.speed = Math.min(MAX_SPEED, BASE_SPEED + st.frame * 0.005);
        st.frame++;
        st.score += st.speed * 0.045;

        // spawn cactus
        st.nextCactus--;
        if (st.nextCactus <= 0) {
          const cluster = Math.random() < 0.35;
          st.obstacles.push({
            kind: "cactus",
            x: W + 10,
            w: cluster ? 21 : 9 + Math.floor(Math.random() * 5),
            h: cluster
              ? 20 + Math.floor(Math.random() * 6)
              : 17 + Math.floor(Math.random() * 10),
          });
          const gap = Math.max(80, 130 - Math.floor(st.speed * 4));
          st.nextCactus = gap + Math.floor(Math.random() * 50);
        }

        // spawn birds (after frame 200)
        if (st.frame > 200) {
          st.nextBird--;
          if (st.nextBird <= 0) {
            st.obstacles.push({
              kind: "bird",
              x: W + 10,
              y: Math.random() < 0.6 ? birdLowY : birdHighY,
            });
            st.nextBird = 120 + Math.floor(Math.random() * 90);
          }
        }

        for (const obs of st.obstacles)
          obs.x -= st.speed * (obs.kind === "bird" ? 1.15 : 1);
        st.obstacles = st.obstacles.filter(
          (o) => o.x + (o.kind === "cactus" ? o.w : BIRD_W) > 0,
        );

        // collision
        let dl: number, dr: number, dt: number, db: number;
        if (st.isDucking && st.onGround) {
          dl = DINO_X - 2 + 2;
          dr = DINO_X - 2 + DINO_DUCK_W - 2;
          dt = GY - DINO_DUCK_H + 2;
          db = GY - 2;
        } else {
          dl = DINO_X + 2;
          dr = DINO_X + DINO_BODY_W - 2;
          dt = st.dinoTop + 2;
          db = st.dinoTop + DINO_TOTAL_H - 2;
        }

        for (const obs of st.obstacles) {
          let obsL: number, obsR: number, obsT: number, obsB: number;
          if (obs.kind === "cactus") {
            obsL = obs.x + 2;
            obsR = obs.x + obs.w - 2;
            obsT = GY - obs.h + 2;
            obsB = GY - 2;
          } else {
            obsL = obs.x + 2;
            obsR = obs.x + BIRD_W - 2;
            obsT = obs.y + 1;
            obsB = obs.y + BIRD_H - 1;
          }
          if (dr > obsL && dl < obsR && db > obsT && dt < obsB) {
            st.phase = "dead";
          }
        }
      }

      draw();
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [height, groundY, birdLowY, birdHighY]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      jump();
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      startDuck();
    }
  }

  function handleKeyUp(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") stopDuck();
  }

  function handleMouseMove() {
    if (
      s.current.phase === "playing" &&
      Date.now() - unpausedAt.current > 800
    ) {
      isPaused.current = true;
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.focus();
    if (isPaused.current) {
      isPaused.current = false;
      unpausedAt.current = Date.now();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const relY = (e.clientY - rect.top) / rect.height;
    if (relY > 0.55 && s.current.phase === "playing") {
      startDuck();
    } else {
      jump();
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors text-center cursor-pointer"
      >
        while you wait {collapsed ? "▸" : "▾"}
      </button>
      {!collapsed && (
        <div className="flex gap-1 justify-center">
          <button
            onClick={() => setSelectedGame("dino")}
            className={`text-xs px-2 py-0.5 rounded transition-colors cursor-pointer ${selectedGame === "dino" ? "text-foreground" : "text-muted-foreground/40 hover:text-muted-foreground"}`}
          >
            Dinosaur
          </button>
          <span className="text-muted-foreground/30 text-xs self-center">|</span>
          <button
            onClick={() => setSelectedGame("2048")}
            className={`text-xs px-2 py-0.5 rounded transition-colors cursor-pointer ${selectedGame === "2048" ? "text-foreground" : "text-muted-foreground/40 hover:text-muted-foreground"}`}
          >
            2048
          </button>
        </div>
      )}
      {/* Canvas stays mounted always so the RAF loop never needs to restart */}
      <div
        className="rounded-lg border overflow-hidden select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground bg-background"
        style={{
          display: !collapsed && selectedGame === "dino" ? undefined : "none",
          touchAction: "none",
          cursor: "pointer",
        }}
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
        <canvas
          ref={canvasRef}
          width={W}
          height={height}
          className="w-full block"
        />
      </div>
      {!collapsed && selectedGame === "2048" && (
        <div className="rounded-lg border overflow-hidden text-foreground bg-background">
          <Game2048 />
        </div>
      )}
    </div>
  );
}
