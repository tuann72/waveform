import { ZONE_WIDTHS, ZONE_POINTS } from "@/types/game";

export function calcPoints(dial: number, target: number): number {
  const delta = Math.abs(dial - target);
  if (delta <= ZONE_WIDTHS.bullseye) return ZONE_POINTS.bullseye;
  if (delta <= ZONE_WIDTHS.mid) return ZONE_POINTS.mid;
  if (delta <= ZONE_WIDTHS.outer) return ZONE_POINTS.outer;
  return ZONE_POINTS.miss;
}
