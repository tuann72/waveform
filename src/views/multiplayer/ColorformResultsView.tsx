import { useStorage } from "@/lib/liveblocks";
import { ResultsView } from "@/components/game/ResultsView";
import { getPalette } from "@/lib/colorPalette";
import type { PaletteName } from "@/lib/colorPalette";

export function ColorformResultsView() {
  const playerColors = useStorage((s) =>
    s ? (s.playerColors as Record<string, number[]>) : ({} as Record<string, number[]>)
  ) ?? {};
  const colorPaletteName = (useStorage((s) => s?.colorPaletteName) ?? "base") as PaletteName;
  const palette = getPalette(colorPaletteName);

  return (
    <ResultsView
      renderByRoundEntry={({ dialIndex, authorId, guessers, guessResults }) => {
        const targetIndex = playerColors[authorId]?.[dialIndex];
        return (
          <>
            {targetIndex !== undefined && (
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-lg flex-shrink-0 border-2 border-border shadow-sm"
                  style={{ background: palette[targetIndex] }}
                />
                <span className="text-xs text-muted-foreground font-mono">{palette[targetIndex]}</span>
                <span className="text-xs text-muted-foreground ml-1">← target</span>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              {guessers.map(([gid, ginfo]) => {
                const res = guessResults[`${gid}-${dialIndex}-${authorId}`];
                return (
                  <div key={gid} className="flex items-center gap-2 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: ginfo.color }} />
                    <span className="text-muted-foreground w-20 truncate">{ginfo.name}</span>
                    {res !== undefined ? (
                      <>
                        <div className="w-5 h-5 rounded flex-shrink-0 border border-border/50" style={{ background: palette[res.position] }} />
                        <span className="font-mono text-muted-foreground text-[10px]">{palette[res.position]}</span>
                        <span className="ml-auto font-semibold text-foreground">+{res.points}</span>
                      </>
                    ) : (
                      <span className="ml-auto text-muted-foreground">—</span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        );
      }}
      renderByPlayerGuess={({ dialIndex, authorId, result }) => {
        const targetIndex = playerColors[authorId]?.[dialIndex];
        if (targetIndex === undefined) return null;
        return (
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded flex-shrink-0 border border-border/50"
              style={{ background: palette[result.position] }}
              title="Your guess"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <div
              className="w-5 h-5 rounded flex-shrink-0 border-2 border-white shadow"
              style={{ background: palette[targetIndex] }}
              title="Target"
            />
          </div>
        );
      }}
    />
  );
}
