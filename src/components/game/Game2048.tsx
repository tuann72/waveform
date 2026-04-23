import { useState, useCallback, useRef } from "react";

type Grid = (number | null)[][];
type Phase = "playing" | "won" | "over";

function emptyGrid(): Grid {
  return Array.from({ length: 4 }, () => Array<number | null>(4).fill(null));
}

function spawnTile(grid: Grid): Grid {
  const empty: [number, number][] = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (grid[r][c] === null) empty.push([r, c]);
  if (!empty.length) return grid;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  const next = grid.map((row) => [...row]);
  next[r][c] = Math.random() < 0.9 ? 2 : 4;
  return next;
}

function slideRow(row: (number | null)[]): { row: (number | null)[]; gained: number } {
  const nums = row.filter((x): x is number => x !== null);
  let gained = 0;
  const merged: number[] = [];
  let i = 0;
  while (i < nums.length) {
    if (i + 1 < nums.length && nums[i] === nums[i + 1]) {
      const v = nums[i] * 2;
      merged.push(v);
      gained += v;
      i += 2;
    } else {
      merged.push(nums[i++]);
    }
  }
  while (merged.length < 4) merged.push(0);
  return { row: merged.map((x) => x || null), gained };
}

function applyMove(
  grid: Grid,
  dir: "left" | "right" | "up" | "down",
): { grid: Grid; gained: number; moved: boolean } {
  let gained = 0;
  let moved = false;
  const ng = grid.map((r) => [...r]);

  if (dir === "left" || dir === "right") {
    for (let r = 0; r < 4; r++) {
      const fwd = dir === "right" ? [...grid[r]].reverse() : [...grid[r]];
      const { row: slid, gained: g } = slideRow(fwd);
      const result = dir === "right" ? [...slid].reverse() : slid;
      if (result.some((v, c) => v !== grid[r][c])) moved = true;
      ng[r] = result;
      gained += g;
    }
  } else {
    for (let c = 0; c < 4; c++) {
      const col =
        dir === "down"
          ? [grid[3][c], grid[2][c], grid[1][c], grid[0][c]]
          : [grid[0][c], grid[1][c], grid[2][c], grid[3][c]];
      const { row: slid, gained: g } = slideRow(col);
      const result = dir === "down" ? [...slid].reverse() : slid;
      for (let r = 0; r < 4; r++) {
        if (result[r] !== grid[r][c]) moved = true;
        ng[r][c] = result[r];
      }
      gained += g;
    }
  }

  return { grid: ng, gained, moved };
}

function isOver(grid: Grid): boolean {
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      if (grid[r][c] === null) return false;
      if (c < 3 && grid[r][c] === grid[r][c + 1]) return false;
      if (r < 3 && grid[r][c] === grid[r + 1][c]) return false;
    }
  return true;
}

const TILE_COLORS: Record<number, [string, string]> = {
  2: ["#eee4da", "#776e65"],
  4: ["#ede0c8", "#776e65"],
  8: ["#f2b179", "#f9f6f2"],
  16: ["#f59563", "#f9f6f2"],
  32: ["#f67c5f", "#f9f6f2"],
  64: ["#f65e3b", "#f9f6f2"],
  128: ["#edcf72", "#f9f6f2"],
  256: ["#edcc61", "#f9f6f2"],
  512: ["#edc850", "#f9f6f2"],
  1024: ["#edc53f", "#f9f6f2"],
  2048: ["#edc22e", "#f9f6f2"],
};

function tileStyle(val: number): React.CSSProperties {
  const [bg, fg] = TILE_COLORS[val] ?? ["#3c3a32", "#f9f6f2"];
  const fontSize =
    val >= 1024 ? "0.8rem" : val >= 128 ? "0.9rem" : val >= 16 ? "1.1rem" : "1.3rem";
  return { background: bg, color: fg, fontSize, fontWeight: 700 };
}

function newGame(): Grid {
  return spawnTile(spawnTile(emptyGrid()));
}

export function Game2048() {
  const [grid, setGrid] = useState<Grid>(newGame);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [phase, setPhase] = useState<Phase>("playing");
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const doMove = useCallback(
    (dir: "left" | "right" | "up" | "down") => {
      if (phase === "over") return;
      setGrid((prev) => {
        const { grid: ng, gained, moved } = applyMove(prev, dir);
        if (!moved) return prev;
        const next = spawnTile(ng);
        if (gained > 0) {
          setScore((s) => {
            const ns = s + gained;
            setBest((b) => Math.max(b, ns));
            return ns;
          });
        }
        if (phase === "playing" && next.some((row) => row.some((v) => v === 2048))) {
          setPhase("won");
        } else if (isOver(next)) {
          setPhase("over");
        }
        return next;
      });
    },
    [phase],
  );

  const restart = useCallback(() => {
    setGrid(newGame());
    setScore(0);
    setPhase("playing");
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    const map: Record<string, "left" | "right" | "up" | "down"> = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
    };
    if (map[e.key]) {
      e.preventDefault();
      doMove(map[e.key]);
    }
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
    if (Math.abs(dx) > Math.abs(dy)) doMove(dx > 0 ? "right" : "left");
    else doMove(dy > 0 ? "down" : "up");
  }

  return (
    <div
      className="select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring p-2"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: "none" }}
    >
      <div className="flex justify-between items-center mb-2 px-1">
        <span className="font-mono text-xs font-bold tabular-nums">
          {String(score).padStart(5, "0")}
        </span>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          BEST {String(best).padStart(5, "0")}
        </span>
        <button
          onClick={restart}
          className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors cursor-pointer"
        >
          new
        </button>
      </div>

      <div
        className="relative rounded w-full"
        style={{
          background: "#bbada0",
          padding: 6,
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 6,
        }}
      >
        {grid.flat().map((val, i) => (
          <div
            key={i}
            className="rounded flex items-center justify-center"
            style={{
              aspectRatio: "1",
              ...(val ? tileStyle(val) : { background: "rgba(238,228,218,0.35)" }),
            }}
          >
            {val ?? ""}
          </div>
        ))}

        {phase !== "playing" && (
          <div
            className="absolute inset-0 flex flex-col gap-2 items-center justify-center rounded"
            style={{ background: "rgba(238,228,218,0.75)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="font-bold text-sm" style={{ color: "#776e65" }}>
              {phase === "won" ? "You reached 2048!" : "Game over"}
            </span>
            <button
              onClick={phase === "won" ? () => setPhase("playing") : restart}
              className="text-xs px-3 py-1 rounded font-bold cursor-pointer"
              style={{ background: "#8f7a66", color: "#f9f6f2" }}
            >
              {phase === "won" ? "Keep going" : "Try again"}
            </button>
          </div>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground/40 mt-1.5">
        arrow keys or swipe
      </p>
    </div>
  );
}
