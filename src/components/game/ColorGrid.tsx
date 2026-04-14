import { useMemo } from "react"
import { cn } from "@/lib/utils"
import {
  COLOR_PALETTE,
  PALETTE_COLS,
  PALETTE_SIZE,
  chebyshevDistance,
} from "@/lib/colorPalette"

interface ColorGridProps {
  selectedIndex: number | null
  onSelect: (index: number) => void
  /** Highlight this cell as the revealed target */
  targetIndex?: number
  /**
   * Show score-zone rings around this cell:
   *   distance 1 (incl. diagonals) → green tint  (1 pt)
   */
  scoreRadiusCenter?: number
  /** Colored player-dot overlays shown after reveal */
  guessMarkers?: { index: number; playerColor: string }[]
  disabled?: boolean
}

const ZONE_TINT = "rgba(74,222,128,0.32)"

const GRID_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: `repeat(${PALETTE_COLS}, 1fr)`,
  gap: "2px",
  background: "hsl(var(--border))",
}

export function ColorGrid({
  selectedIndex,
  onSelect,
  targetIndex,
  scoreRadiusCenter,
  guessMarkers = [],
  disabled = false,
}: ColorGridProps) {
  const zoneSet = useMemo(() => {
    if (scoreRadiusCenter === undefined) return null
    const set = new Set<number>()
    for (let i = 0; i < PALETTE_SIZE; i++) {
      if (chebyshevDistance(scoreRadiusCenter, i) === 1) set.add(i)
    }
    return set
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

  function renderCell(idx: number) {
    const isSelected = idx === selectedIndex
    const isTarget = idx === targetIndex
    const inZone = zoneSet?.has(idx)
    const markers = markersByIndex.get(idx) ?? []

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
        style={{ background: COLOR_PALETTE[idx] }}
        aria-label={COLOR_PALETTE[idx]}
      >
        {inZone && (
          <span
            className="absolute inset-0 pointer-events-none"
            style={{ background: ZONE_TINT }}
          />
        )}
        {isTarget && (
          <span
            className="absolute inset-0 pointer-events-none"
            style={{ boxShadow: "inset 0 0 0 2px white, inset 0 0 0 3.5px rgba(0,0,0,0.55)" }}
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
    <div className="w-full rounded-lg overflow-hidden" style={GRID_STYLE}>
      {Array.from({ length: PALETTE_SIZE }, (_, i) => renderCell(i))}
    </div>
  )
}
