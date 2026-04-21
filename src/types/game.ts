export type AppView =
  | "start"
  | "joinOrHost"
  | "waitingRoom"
  | "multiClue"
  | "multiGuess"
  | "multiResults";
export const ZONE_WIDTHS = { bullseye: 2, mid: 6, outer: 10 } as const;
export const ZONE_POINTS = { bullseye: 3, mid: 2, outer: 1, miss: 0 } as const;
export const DEFAULT_ROUNDS = 3;
export const ROUND_OPTIONS = [1, 2, 3, 4, 5] as const;

export interface SpectrumCard {
  id: string;
  left: string;
  right: string;
  category?: string;
}

export interface GameState {
  view: AppView;
  totalRounds: number;
}
