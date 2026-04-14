// 2D color wheel layout (32 cols × 16 rows):
//   top = red, right = blue, bottom = green, left = yellow
//   center = white/pastel, edges/corners = vivid saturated colors
export const PALETTE_COLS = 32
export const PALETTE_ROWS = 16
export const PALETTE_SIZE = PALETTE_COLS * PALETTE_ROWS // 512

export type PaletteName = "base" | "deuteranomaly"

// Factory: maps an atan2 angle to a hue, given cardinal-direction hues.
// Directions: up(−π/2), right(0), down(π/2), left(π)
// Hue travels BACKWARD through the wheel so corners mix naturally.
function makeAngleToHue(up: number, right: number, down: number, left: number) {
  function arc(from: number, to: number) { return ((from - to) + 360) % 360 }
  const a0 = arc(up, right), a1 = arc(right, down), a2 = arc(down, left), a3 = arc(left, up)
  return function(angle: number): number {
    const norm = ((angle + Math.PI / 2) / (Math.PI * 2) + 1) % 1
    if (norm < 0.25) return ((up    - (norm / 0.25) * a0) + 360) % 360
    if (norm < 0.5)  return ((right - ((norm - 0.25) / 0.25) * a1) + 360) % 360
    if (norm < 0.75) return ((down  - ((norm - 0.5)  / 0.25) * a2) + 360) % 360
    return                  ((left  - ((norm - 0.75) / 0.25) * a3) + 360) % 360
  }
}

// Base: red(top) / blue(right) / green(bottom) / yellow(left)
const angleToHueBase = makeAngleToHue(0, 240, 120, 60)
// Colorblind-friendly (deuteranopia/protanopia): avoids red-green axis entirely.
// cyan(top) / yellow(right) / magenta(bottom) / blue(left) — 180° rotation of base
const angleToHueColorblind = makeAngleToHue(180, 60, 300, 240)

function hslToHex(h: number, s: number, l: number): string {
  const s2 = s / 100
  const l2 = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s2 * Math.min(l2, 1 - l2)
  const f = (n: number) =>
    Math.round((l2 - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))) * 255)
  return `#${[f(0), f(8), f(4)].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`
}

function buildPalette(angleToHue: (a: number) => number): readonly string[] {
  const colors: string[] = []
  for (let row = 0; row < PALETTE_ROWS; row++) {
    for (let col = 0; col < PALETTE_COLS; col++) {
      const dx = col / (PALETTE_COLS - 1) - 0.5
      const dy = row / (PALETTE_ROWS - 1) - 0.5
      const dist = Math.min(1, Math.sqrt(dx * dx + dy * dy) / (0.5 * Math.SQRT2))
      // Smooth gradient: most pastel at center, gradually bolder toward edges
      const d = dist
      const hue = angleToHue(Math.atan2(dy, dx))
      const sat = Math.round(70 + d * 30)   // 70% (pastel center) → 100% (bold edge)
      // Top edge + top-left/top-right corners are darker (bold reds, oranges, purples)
      const topWeight = Math.max(0, -dy * 2) // 0 at center, 1 at top edge
      const lig = Math.round(80 - d * 42 - topWeight * d * 14)
      colors.push(hslToHex(hue, sat, lig))
    }
  }
  return colors
}

export const COLOR_PALETTE: readonly string[] = buildPalette(angleToHueBase)
export const COLOR_PALETTE_DEUTERANOMALY: readonly string[] = buildPalette(angleToHueColorblind)

export function getPalette(name: PaletteName): readonly string[] {
  return name === "deuteranomaly" ? COLOR_PALETTE_DEUTERANOMALY : COLOR_PALETTE
}

// Chebyshev distance (no wrap — 2D wheel has no periodic axis).
export function chebyshevDistance(a: number, b: number): number {
  if (a === b) return 0
  const rowA = Math.floor(a / PALETTE_COLS), colA = a % PALETTE_COLS
  const rowB = Math.floor(b / PALETTE_COLS), colB = b % PALETTE_COLS
  return Math.max(Math.abs(colA - colB), Math.abs(rowA - rowB))
}

// Scoring: exact = 3pts, 1 away = 2pts, 2 away = 1pt, else 0
export function calcColorPoints(guessIndex: number, targetIndex: number): number {
  const dist = chebyshevDistance(guessIndex, targetIndex)
  if (dist === 0) return 3
  if (dist === 1) return 2
  if (dist === 2) return 1
  return 0
}

// Generate random color options from the vivid zone (excludes the pastel center).
export function pickColorOptions(): number[] {
  // Build a pool of vivid indices (exclude center pastel zone)
  const pool: number[] = []
  for (let idx = 0; idx < PALETTE_SIZE; idx++) {
    const col = idx % PALETTE_COLS
    const row = Math.floor(idx / PALETTE_COLS)
    const dx = col / (PALETTE_COLS - 1) - 0.5
    const dy = row / (PALETTE_ROWS - 1) - 0.5
    const dist = Math.sqrt(dx * dx + dy * dy) / (0.5 * Math.SQRT2)
    if (dist >= 0.5) pool.push(idx)
  }
  // Pick 3 distinct random indices from the pool
  const options: number[] = []
  while (options.length < 3 && pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length)
    options.push(pool.splice(i, 1)[0])
  }
  return options
}
