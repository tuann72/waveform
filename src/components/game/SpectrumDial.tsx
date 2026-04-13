import { useRef } from "react";
import { useDialDrag } from "@/hooks/useDialDrag";
import { ZONE_WIDTHS } from "@/types/game";
import type { SpectrumCard } from "@/types/game";
import { cn } from "@/lib/utils";

interface SpectrumDialProps {
  card: SpectrumCard;
  dialPosition: number;
  onDialChange: (pos: number) => void;
  targetPosition?: number;
  showTarget: boolean;
  disabled?: boolean;
  hideNeedle?: boolean;
}

interface Segment {
  left: number;
  right: number;
  color: string;
}

// Builds 5 non-overlapping segments centred on the target.
// Segments: [outer-left | mid-left | bullseye | mid-right | outer-right]
function buildSegments(target: number): Segment[] {
  const { bullseye, mid, outer } = ZONE_WIDTHS;
  return [
    {
      left: target - outer,
      right: target - mid,
      color: "rgba(251,191,36,0.5)",
    }, // outer-left
    {
      left: target - mid,
      right: target - bullseye,
      color: "rgba(250,204,21,0.65)",
    }, // mid-left
    {
      left: target - bullseye,
      right: target + bullseye,
      color: "rgba(74,222,128,0.75)",
    }, // bull's eye
    {
      left: target + bullseye,
      right: target + mid,
      color: "rgba(250,204,21,0.65)",
    }, // mid-right
    {
      left: target + mid,
      right: target + outer,
      color: "rgba(251,191,36,0.5)",
    }, // outer-right
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
}: SpectrumDialProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const { handlePointerDown, handlePointerMove, handlePointerUp } = useDialDrag(
    {
      trackRef,
      onChange: onDialChange,
      disabled,
    },
  );

  return (
    <div className="w-full select-none">
      {/* Concept labels */}
      <div className="flex justify-between mb-3 px-1">
        <span className="text-sm font-medium text-muted-foreground">
          {card.left}
        </span>
        <span className="text-sm font-medium text-muted-foreground">
          {card.right}
        </span>
      </div>

      {/* Track + needle container */}
      <div
        className={cn(
          "relative",
          disabled ? "cursor-default" : "cursor-ew-resize",
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Track */}
        <div
          ref={trackRef}
          className="relative h-10 rounded-xl overflow-hidden bg-gradient-to-r from-purple-700 to-zinc-300"
        >
          {/* Score zones — only shown on reveal */}
          {showTarget && targetPosition !== undefined && (
            <>
              {buildSegments(targetPosition).map((seg, i) => (
                <div
                  key={i}
                  className="absolute inset-y-0"
                  style={{
                    left: `${seg.left}%`,
                    width: `${seg.right - seg.left}%`,
                    background: seg.color,
                  }}
                />
              ))}
            </>
          )}
        </div>

        {/* Needle */}
        {!hideNeedle && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none"
            style={{ left: `${dialPosition}%` }}
          >
            {/* Triangle notch above */}
            <div
              className="w-0 h-0 mb-0.5"
              style={{
                borderLeft: "6px solid transparent",
                borderRight: "6px solid transparent",
                borderTop: "8px solid white",
              }}
            />
            {/* Vertical line through track */}
            <div className="w-0.5 h-10 bg-white shadow-md" />
            {/* Triangle notch below */}
            <div
              className="w-0 h-0 mt-0.5"
              style={{
                borderLeft: "6px solid transparent",
                borderRight: "6px solid transparent",
                borderBottom: "8px solid white",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
