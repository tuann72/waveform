// 20 hue columns at 18° steps — full 360° wheel
export const PALETTE_COLS = 20
// 20 lightness rows: very dark at top → vivid in the middle → light pastel at bottom
export const PALETTE_ROWS = 20
export const PALETTE_SIZE = PALETTE_COLS * PALETTE_ROWS // 400

// Each row: lightness + saturation, arranged top (dark) → bottom (light/pastel)
// Matches the Hues & Cues board layout: dark shades → vivid → pastels
const ROWS = [
  { l:  8, s: 70 },
  { l: 12, s: 76 },
  { l: 17, s: 82 },
  { l: 22, s: 87 },
  { l: 28, s: 91 },
  { l: 34, s: 95 },
  { l: 40, s: 98 },
  { l: 46, s: 100 },
  { l: 52, s: 100 }, // ← peak vivid band
  { l: 57, s: 100 },
  { l: 62, s: 98 },
  { l: 67, s: 95 },
  { l: 72, s: 91 },
  { l: 77, s: 87 },
  { l: 81, s: 83 },
  { l: 85, s: 78 },
  { l: 88, s: 73 },
  { l: 91, s: 68 },
  { l: 94, s: 62 },
  { l: 96, s: 55 },
] as const

function hslToHex(h: number, s: number, l: number): string {
  const s2 = s / 100
  const l2 = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s2 * Math.min(l2, 1 - l2)
  const f = (n: number) =>
    Math.round((l2 - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))) * 255)
  return `#${[f(0), f(8), f(4)].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`
}

// Palette: rows of hue×lightness, left→right = hue 0°→360°, top→bottom = dark→pastel
export const COLOR_PALETTE: readonly string[] = (() => {
  const colors: string[] = []
  for (const { l, s } of ROWS) {
    for (let col = 0; col < PALETTE_COLS; col++) {
      colors.push(hslToHex((col / PALETTE_COLS) * 360, s, l))
    }
  }
  return colors
})()

// Chebyshev (chessboard) distance with hue wrap-around.
// Diagonals count as distance 1; the hue axis wraps (column 0 ↔ column 19 are adjacent).
export function chebyshevDistance(a: number, b: number): number {
  if (a === b) return 0
  const rowA = Math.floor(a / PALETTE_COLS)
  const colA = a % PALETTE_COLS
  const rowB = Math.floor(b / PALETTE_COLS)
  const colB = b % PALETTE_COLS
  const rawCol = Math.abs(colA - colB)
  const colDist = Math.min(rawCol, PALETTE_COLS - rawCol) // hue wraps
  return Math.max(colDist, Math.abs(rowA - rowB))
}

// Scoring: exact = 2pts, adjacent (incl. diagonal) = 1pt, else 0
export function calcColorPoints(guessIndex: number, targetIndex: number): number {
  const dist = chebyshevDistance(guessIndex, targetIndex)
  if (dist === 0) return 2
  if (dist === 1) return 1
  return 0
}

// Generate 3 visually distinct palette indices for the clue-picking phase.
// Guaranteed at least 4 Chebyshev steps apart so the choices look meaningfully different.
export function pickColorOptions(): number[] {
  const options: number[] = []
  let attempts = 0
  while (options.length < 3 && attempts++ < 600) {
    const idx = Math.floor(Math.random() * PALETTE_SIZE)
    if (options.every((c) => chebyshevDistance(c, idx) >= 4)) options.push(idx)
  }
  while (options.length < 3) {
    const idx = Math.floor(Math.random() * PALETTE_SIZE)
    if (!options.includes(idx)) options.push(idx)
  }
  return options
}
