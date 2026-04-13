export type AppView =
  | "start"
  | "joinOrHost"
  | "waitingRoom"
  | "multiClue"
  | "multiGuess"
  | "multiResults";
export const ZONE_WIDTHS = { bullseye: 2, mid: 6, outer: 10 } as const;
export const ZONE_POINTS = { bullseye: 4, mid: 3, outer: 2, miss: 0 } as const;
export const DEFAULT_ROUNDS = 3;
export const ROUND_OPTIONS = [1, 3, 5, 7, 10] as const;

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
