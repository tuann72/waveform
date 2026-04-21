import { useMemo } from "react"
import { cn } from "@/lib/utils"
import {
  COLOR_PALETTE,
  PALETTE_COLS,
  PALETTE_ROWS,
  PALETTE_SIZE,
  chebyshevDistance,
} from "@/lib/colorPalette"

interface ColorGridProps {
  selectedIndex: number | null
  onSelect: (index: number) => void
  /** Highlight this cell as the revealed target */
  targetIndex?: number
  /**
   * Draw square zone outlines around this cell.
   * Cells at dist ≤ 1 form the inner 3×3 ring, dist ≤ 2 form the outer 5×5 ring.
   * Borders are drawn on each cell's outer edges so together they trace clean squares.
   */
  scoreRadiusCenter?: number
  /** Colored player-dot overlays shown after reveal */
  guessMarkers?: { index: number; playerColor: string }[]
  disabled?: boolean
  /** Custom palette (defaults to COLOR_PALETTE) */
  palette?: readonly string[]
}

const BORDER_Z1 = "rgba(255,255,255,0.95)"  // inner 3×3 outline — 2 pts
const BORDER_Z2 = "rgba(255,255,255,0.55)"  // outer 5×5 outline — 1 pt
const BORDER_THICK = "2px"

const GRID_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: `repeat(${PALETTE_COLS}, 1fr)`,
  gap: "1px",
  background: "#000",
}

export function ColorGrid({
  selectedIndex,
  onSelect,
  targetIndex,
  scoreRadiusCenter,
  guessMarkers = [],
  disabled = false,
  palette = COLOR_PALETTE,
}: ColorGridProps) {
  // Two sets: z1 = cells within dist ≤ 1 (3×3), z2 = cells within dist ≤ 2 (5×5)
  const zoneSets = useMemo(() => {
    if (scoreRadiusCenter === undefined) return null
    const z1 = new Set<number>()
    const z2 = new Set<number>()
    for (let i = 0; i < PALETTE_SIZE; i++) {
      const d = chebyshevDistance(scoreRadiusCenter, i)
      if (d <= 1) z1.add(i)
      if (d <= 2) z2.add(i)
    }
    return { z1, z2 }
  }, [scoreRadiusCenter])

  const markersByIndex = useMemo(() => {
    const m = new Map<number, string[]>()
    for (const { index, playerColor } of guessMarkers) {
      const arr = m.get(index) ?? []
      arr.push(playerColor)
      m.set(index, arr)
    }
    return m
  }, [guessMarkers])

  // Returns border spans for a cell based on which zone boundary edges it sits on.
  // Each cell only borders the edges that face outside its zone, so adjacent cells
  // together trace a clean square perimeter.
  function renderZoneBorders(idx: number) {
    if (!zoneSets) return null
    const { z1, z2 } = zoneSets

    const inZ1 = z1.has(idx)
    const inZ2 = z2.has(idx)
    if (!inZ1 && !inZ2) return null

    const row = Math.floor(idx / PALETTE_COLS)
    const col = idx % PALETTE_COLS
    const topIdx    = row > 0             ? idx - PALETTE_COLS : -1
    const bottomIdx = row < PALETTE_ROWS - 1 ? idx + PALETTE_COLS : -1
    const leftIdx   = col > 0             ? idx - 1           : -1
    const rightIdx  = col < PALETTE_COLS - 1 ? idx + 1       : -1

    // Determine which zone set and color to use for this cell
    const zoneSet = inZ1 ? z1 : z2
    const color   = inZ1 ? BORDER_Z1 : BORDER_Z2

    const borders: React.ReactNode[] = []
    if (!zoneSet.has(topIdx))
      borders.push(<span key="t" className="absolute top-0 left-0 right-0 pointer-events-none" style={{ height: BORDER_THICK, background: color }} />)
    if (!zoneSet.has(bottomIdx))
      borders.push(<span key="b" className="absolute bottom-0 left-0 right-0 pointer-events-none" style={{ height: BORDER_THICK, background: color }} />)
    if (!zoneSet.has(leftIdx))
      borders.push(<span key="l" className="absolute top-0 left-0 bottom-0 pointer-events-none" style={{ width: BORDER_THICK, background: color }} />)
    if (!zoneSet.has(rightIdx))
      borders.push(<span key="r" className="absolute top-0 right-0 bottom-0 pointer-events-none" style={{ width: BORDER_THICK, background: color }} />)

    return borders
  }

  function renderCell(idx: number) {
    const isSelected = idx === selectedIndex
    const isTarget   = idx === targetIndex
    const markers    = markersByIndex.get(idx) ?? []

    return (
      <button
        key={idx}
        onClick={() => !disabled && onSelect(idx)}
        disabled={disabled}
        className={cn(
          "relative aspect-square",
          !disabled && "cursor-pointer hover:z-10 hover:scale-125",
          disabled && "cursor-default",
        )}
        style={{ background: palette[idx] }}
        aria-label={palette[idx]}
      >
        {renderZoneBorders(idx)}
        {isTarget && (
          <span
            className="absolute inset-0 pointer-events-none"
            style={{ boxShadow: "inset 0 0 0 3px white, inset 0 0 0 5px rgba(0,0,0,0.6)", background: "rgba(255,255,255,0.25)" }}
          />
        )}
        {isSelected && (
          <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span
              className="w-1.5 h-1.5 rounded-full bg-white"
              style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.45)" }}
            />
          </span>
        )}
        {markers.length > 0 && (
          <span className="absolute inset-0 flex flex-wrap items-center justify-center gap-px pointer-events-none p-0.5">
            {markers.slice(0, 4).map((pc, i) => (
              <span
                key={i}
                className="w-1 h-1 rounded-full"
                style={{ background: pc, outline: "1px solid rgba(255,255,255,0.8)" }}
              />
            ))}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="w-full overflow-hidden" style={GRID_STYLE}>
      {Array.from({ length: PALETTE_SIZE }, (_, i) => renderCell(i))}
    </div>
  )
}
