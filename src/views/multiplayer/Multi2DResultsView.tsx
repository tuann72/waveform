import { useStorage } from "@/lib/liveblocks";
import type { Dial2DConfig } from "@/lib/liveblocks";
import { ResultsView } from "@/components/game/ResultsView";
import { SpectrumPlane } from "@/components/game/SpectrumPlane";

export function Multi2DResultsView() {
  const player2DDials = useStorage((s) =>
    s ? (s.player2DDials as unknown as Record<string, Dial2DConfig[]>) : ({} as Record<string, Dial2DConfig[]>)
  ) ?? {};

  return (
    <ResultsView
      renderByRoundEntry={({ dialIndex, authorId, guessers, guessResults }) => {
        const dial = player2DDials[authorId]?.[dialIndex];
        const extraPoints = guessers.flatMap(([gid, ginfo]) => {
          const res = guessResults[`${gid}-${dialIndex}-${authorId}`];
          return res ? [{ x: res.position, y: res.posY ?? 50, color: ginfo.color }] : [];
        });
        return (
          <>
            {dial && (
              <SpectrumPlane
                config={dial}
                position={{ x: 50, y: 50 }}
                onPositionChange={() => {}}
                showTarget
                disabled
                hidePoint
                extraPoints={extraPoints}
              />
            )}
            <div className="flex flex-col gap-1">
              {guessers.map(([gid, ginfo]) => {
                const res = guessResults[`${gid}-${dialIndex}-${authorId}`];
                if (!res) return null;
                return (
                  <div key={gid} className="flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ginfo.color }} />
                    <span className="text-muted-foreground flex-1">{ginfo.name}</span>
                    <span className="font-semibold">
                      {res.points >= 0 ? "+" : ""}{res.points} pt{Math.abs(res.points) !== 1 ? "s" : ""}
                      {res.doubleDown && <span className="ml-1 text-amber-400 text-[10px]">2×</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        );
      }}
      // No renderByPlayerGuess → "By Player" tab is hidden for 2D
    />
  );
}
