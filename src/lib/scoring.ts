import { ZONE_WIDTHS, ZONE_POINTS } from "@/types/game";

export function calcPoints(dial: number, target: number): number {
  const delta = Math.abs(dial - target);
  if (delta <= ZONE_WIDTHS.bullseye) return ZONE_POINTS.bullseye;
  if (delta <= ZONE_WIDTHS.mid) return ZONE_POINTS.mid;
  if (delta <= ZONE_WIDTHS.outer) return ZONE_POINTS.outer;
  return ZONE_POINTS.miss;
}

export const ZONE_RADII_2D = { bullseye: 4, mid: 12, outer: 16 } as const;

export function calcPoints2D(
  x: number,
  y: number,
  targetX: number,
  targetY: number,
): number {
  const dist = Math.sqrt((x - targetX) ** 2 + (y - targetY) ** 2);
  if (dist <= ZONE_RADII_2D.bullseye) return ZONE_POINTS.bullseye;
  if (dist <= ZONE_RADII_2D.mid) return ZONE_POINTS.mid;
  if (dist <= ZONE_RADII_2D.outer) return ZONE_POINTS.outer;
  return ZONE_POINTS.miss;
}

export function applyDoubleDown(
  rawPoints: number,
  doubleDown: boolean,
): number {
  if (!doubleDown) return rawPoints;
  return rawPoints > 0 ? rawPoints * 2 : -2;
}
