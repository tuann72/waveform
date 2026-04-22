import { useEffect, useRef } from "react"
import type { Dial2DConfig } from "@/lib/liveblocks"
import { ZONE_RADII_2D } from "@/lib/scoring"
import { cn } from "@/lib/utils"

export interface ExtraPoint {
  x: number
  y: number
  color: string
}

interface SpectrumPlaneProps {
  config: Dial2DConfig
  position: { x: number; y: number }
  onPositionChange: (pos: { x: number; y: number }) => void
  showTarget?: boolean
  disabled?: boolean
  hidePoint?: boolean
  extraPoints?: ExtraPoint[]
}

const CANVAS_SIZE = 400

export function SpectrumPlane({
  config,
  position,
  onPositionChange,
  showTarget = false,
  disabled = false,
  hidePoint = false,
  extraPoints = [],
}: SpectrumPlaneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    // Subtle center axis lines — use computed foreground color so it works in both themes
    const fg = getComputedStyle(canvas).color || "rgb(0,0,0)"
    const axisColor = fg.startsWith("rgba")
      ? fg.replace(/,\s*[\d.]+\)$/, ", 0.12)")
      : fg.replace("rgb(", "rgba(").replace(")", ", 0.12)")
    ctx.strokeStyle = axisColor
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(CANVAS_SIZE / 2, 0)
    ctx.lineTo(CANVAS_SIZE / 2, CANVAS_SIZE)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, CANVAS_SIZE / 2)
    ctx.lineTo(CANVAS_SIZE, CANVAS_SIZE / 2)
    ctx.stroke()

    if (!showTarget) return

    const cx = (config.targetX / 100) * CANVAS_SIZE
    const cy = ((100 - config.targetY) / 100) * CANVAS_SIZE
    const scale = CANVAS_SIZE / 100

    // Outer zone (2 pts)
    ctx.beginPath()
    ctx.arc(cx, cy, ZONE_RADII_2D.outer * scale, 0, Math.PI * 2)
    ctx.fillStyle = "rgba(251,191,36,0.30)"
    ctx.fill()

    // Mid zone (3 pts)
    ctx.beginPath()
    ctx.arc(cx, cy, ZONE_RADII_2D.mid * scale, 0, Math.PI * 2)
    ctx.fillStyle = "rgba(250,204,21,0.50)"
    ctx.fill()

    // Bullseye (4 pts)
    ctx.beginPath()
    ctx.arc(cx, cy, ZONE_RADII_2D.bullseye * scale, 0, Math.PI * 2)
    ctx.fillStyle = "rgba(74,222,128,0.65)"
    ctx.fill()
  }, [showTarget, config.targetX, config.targetY])

  function getPos(e: React.PointerEvent): { x: number; y: number } {
    const rect = containerRef.current!.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, (1 - (e.clientY - rect.top) / rect.height) * 100)),
    }
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (disabled) return
    e.currentTarget.setPointerCapture(e.pointerId)
    onPositionChange(getPos(e))
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (disabled || e.buttons === 0) return
    onPositionChange(getPos(e))
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Top label */}
      <div className="text-center">
        <span className="text-xs font-medium text-muted-foreground">{config.top}</span>
      </div>

      <div className="flex items-center gap-2">
        {/* Left label */}
        <span className="text-xs text-muted-foreground w-10 text-right flex-shrink-0 leading-tight">{config.left}</span>

        {/* Plane */}
        <div
          ref={containerRef}
          className={cn(
            "relative flex-1 aspect-square rounded-lg border bg-muted/30 overflow-hidden",
            !disabled && "cursor-crosshair",
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
        >
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />

          {/* Extra player dots (other players) */}
          {extraPoints.map((pt, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 rounded-full pointer-events-none"
              style={{
                left: `${pt.x}%`,
                top: `${100 - pt.y}%`,
                transform: "translate(-50%, -50%)",
                background: pt.color,
                boxShadow: `0 0 0 2px rgba(255,255,255,0.9), 0 0 5px ${pt.color}`,
              }}
            />
          ))}

          {/* Main player dot */}
          {!hidePoint && (
            <div
              className="absolute w-3 h-3 rounded-full pointer-events-none z-10"
              style={{
                left: `${position.x}%`,
                top: `${100 - position.y}%`,
                transform: "translate(-50%, -50%)",
                background: "white",
                boxShadow: "0 0 0 2px rgba(0,0,0,0.35), 0 0 6px rgba(255,255,255,0.5)",
              }}
            />
          )}
        </div>

        {/* Right label */}
        <span className="text-xs text-muted-foreground w-10 flex-shrink-0 leading-tight">{config.right}</span>
      </div>

      {/* Bottom label */}
      <div className="text-center">
        <span className="text-xs font-medium text-muted-foreground">{config.bottom}</span>
      </div>
    </div>
  )
}
