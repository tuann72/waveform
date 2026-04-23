import { MEANS_CARDS, EVIDENCE_CARDS, SCENE_TILES, LOCATION_TILES } from "@/data/deceptionCards";
import type { DeceptionRole, DeceptionRoleMapBlob, DealtHand, SceneTileEntry } from "@/types/deception";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function assignRoles(playerIds: string[], enableAccomplice: boolean): DeceptionRoleMapBlob {
  const shuffled = shuffle([...playerIds]);
  const roles: Record<string, DeceptionRole> = {};

  const [fs, murderer, ...rest] = shuffled;
  roles[fs] = "forensic-scientist";
  roles[murderer] = "murderer";

  let accomplicePlayerId: string | undefined;
  if (enableAccomplice && rest.length >= 1) {
    const [accomplice, ...investigators] = rest;
    roles[accomplice] = "accomplice";
    accomplicePlayerId = accomplice;
    for (const id of investigators) roles[id] = "investigator";
  } else {
    for (const id of rest) roles[id] = "investigator";
  }

  return { roles, murdererPlayerId: murderer, accomplicePlayerId };
}

export function dealCards(playerIds: string[], cardsPerPlayer = 4): Record<string, DealtHand> {
  const shuffledMeans = shuffle([...MEANS_CARDS]);
  const shuffledEvidence = shuffle([...EVIDENCE_CARDS]);
  const result: Record<string, DealtHand> = {};
  playerIds.forEach((id, i) => {
    result[id] = {
      meansCards: shuffledMeans.slice(i * cardsPerPlayer, (i + 1) * cardsPerPlayer),
      evidenceCards: shuffledEvidence.slice(i * cardsPerPlayer, (i + 1) * cardsPerPlayer),
    };
  });
  return result;
}

export function drawSceneTiles(): {
  tiles: SceneTileEntry[];
  pool: SceneTileEntry[];
} {
  const locationSet = LOCATION_TILES[Math.floor(Math.random() * LOCATION_TILES.length)];
  const locationTile: SceneTileEntry = { category: "Location", options: locationSet };

  const causeOfDeath = SCENE_TILES.find((t) => t.category === "Cause of Death")!;
  const remaining = shuffle(SCENE_TILES.filter((t) => t.category !== "Cause of Death"));

  // First 4 go into the scene, the rest stay in the pool for future swaps
  const active = remaining.slice(0, 4);
  const pool = remaining.slice(4).map((t) => ({ category: t.category, options: [...t.options] }));

  return {
    tiles: [locationTile, causeOfDeath, ...active],
    pool,
  };
}
