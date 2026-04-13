import { useRef } from "react";
import { useDialDrag } from "@/hooks/useDialDrag";
import { ZONE_WIDTHS } from "@/types/game";
import type { SpectrumCard } from "@/types/game";
import { cn } from "@/lib/utils";

export interface ExtraNeedle {
  position: number;
  color: string;
}

interface SpectrumDialProps {
  card: SpectrumCard;
  dialPosition: number;
  onDialChange: (pos: number) => void;
  targetPosition?: number;
  showTarget: boolean;
  disabled?: boolean;
  hideNeedle?: boolean;
  smooth?: boolean;
  extraNeedles?: ExtraNeedle[];
}

interface Segment {
  left: number;
  right: number;
  color: string;
}

function buildSegments(target: number): Segment[] {
  const { bullseye, mid, outer } = ZONE_WIDTHS;
  return [
    { left: target - outer,    right: target - mid,      color: "rgba(251,191,36,0.5)" },
    { left: target - mid,      right: target - bullseye, color: "rgba(250,204,21,0.65)" },
    { left: target - bullseye, right: target + bullseye, color: "rgba(74,222,128,0.75)" },
    { left: target + bullseye, right: target + mid,      color: "rgba(250,204,21,0.65)" },
    { left: target + mid,      right: target + outer,    color: "rgba(251,191,36,0.5)" },
  ].map((s) => ({
    ...s,
    left: Math.max(0, s.left),
    right: Math.min(100, s.right),
  }));
}

export function SpectrumDial({
  card,
  dialPosition,
  onDialChange,
  targetPosition,
  showTarget,
  disabled,
  hideNeedle,
  smooth,
  extraNeedles,
}: SpectrumDialProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const { handlePointerDown, handlePointerMove, handlePointerUp } = useDialDrag({
    trackRef,
    onChange: onDialChange,
    disabled,
  });

  return (
    <div className="w-full select-none">
      <div className="flex justify-between mb-3 px-1">
        <span className="text-sm font-medium text-muted-foreground">{card.left}</span>
        <span className="text-sm font-medium text-muted-foreground">{card.right}</span>
      </div>

      <div
        className={cn("relative", disabled ? "cursor-default" : "cursor-ew-resize")}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Track */}
        <div
          ref={trackRef}
          className="relative h-10 rounded-xl overflow-hidden bg-gradient-to-r from-purple-700 to-zinc-300"
        >
          {showTarget && targetPosition !== undefined && (
            <>
              {buildSegments(targetPosition).map((seg, i) => (
                <div
                  key={i}
                  className="absolute inset-y-0"
                  style={{ left: `${seg.left}%`, width: `${seg.right - seg.left}%`, background: seg.color }}
                />
              ))}
            </>
          )}
        </div>

        {/* Extra needles — other players (always smooth, rendered below main needle) */}
        {extraNeedles?.map((n, i) => (
          <div
            key={i}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none"
            style={{ left: `${n.position}%`, transition: "left 60ms linear" }}
          >
            <div className="w-0 h-0 mb-0.5" style={{ borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: `7px solid ${n.color}` }} />
            <div className="w-0.5 h-10" style={{ background: n.color, boxShadow: `0 0 4px ${n.color}` }} />
            <div className="w-0 h-0 mt-0.5" style={{ borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderBottom: `7px solid ${n.color}` }} />
          </div>
        ))}

        {/* Main needle — local player (white, rendered on top) */}
        {!hideNeedle && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none"
            style={{ left: `${dialPosition}%`, transition: smooth ? "left 60ms linear" : undefined }}
          >
            <div className="w-0 h-0 mb-0.5" style={{ borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "8px solid white" }} />
            <div className="w-0.5 h-10 bg-white shadow-md" />
            <div className="w-0 h-0 mt-0.5" style={{ borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderBottom: "8px solid white" }} />
          </div>
        )}
      </div>
    </div>
  );
}
