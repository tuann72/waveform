import { useStorage } from "@/lib/liveblocks";
import type { Dial2DConfig } from "@/lib/liveblocks";
import { MultiGuessBase } from "@/components/game/MultiGuessBase";

export function Multi2DGuessView() {
  const player2DDials = useStorage((s) =>
    s ? (s.player2DDials as unknown as Record<string, Dial2DConfig[]>) : ({} as Record<string, Dial2DConfig[]>)
  ) ?? {};

  return <MultiGuessBase mode={{ kind: "2d", player2DDials }} />;
}
