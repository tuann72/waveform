export type DeceptionRole = "forensic-scientist" | "murderer" | "accomplice" | "investigator";

export type DeceptionPhase = "role-reveal" | "fs-placement" | "discussion" | "results";

export interface MurdererSolution {
  meansCard: string;
  evidenceCard: string;
}

export interface DeceptionRoleBlob {
  role: DeceptionRole;
  murdererPlayerId?: string; // set for accomplice
}

export interface DeceptionRoleMapBlob {
  roles: Record<string, DeceptionRole>;
  murdererPlayerId: string;
  accomplicePlayerId?: string;
}

export interface DeceptionAccusation {
  accusedPlayerId: string;
  meansCard: string;
  evidenceCard: string;
}

export interface DealtHand {
  meansCards: string[];
  evidenceCards: string[];
}

export interface SceneTileEntry {
  category: string;
  options: string[];
}
