import { useStorage } from "@/lib/liveblocks";
import type { DialConfig } from "@/lib/liveblocks";
import { MultiGuessBase } from "@/components/game/MultiGuessBase";

export function MultiGuessView() {
  const playerDials = useStorage((s) =>
    s ? (s.playerDials as Record<string, DialConfig[]>) : ({} as Record<string, DialConfig[]>)
  ) ?? {};

  return <MultiGuessBase mode={{ kind: "classic", playerDials }} />;
}
