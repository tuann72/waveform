import { useStorage } from "@/lib/liveblocks";
import type { DialConfig } from "@/lib/liveblocks";
import { ResultsView } from "@/components/game/ResultsView";
import { SpectrumDial } from "@/components/game/SpectrumDial";

export function MultiResultsView() {
  const playerDials = useStorage((s) =>
    s ? (s.playerDials as Record<string, DialConfig[]>) : ({} as Record<string, DialConfig[]>)
  ) ?? {};

  return (
    <ResultsView
      renderByRoundEntry={({ dialIndex, authorId, guessers, guessResults }) => {
        const dial = playerDials[authorId]?.[dialIndex];
        const extraNeedles = guessers.flatMap(([gid, ginfo]) => {
          const res = guessResults[`${gid}-${dialIndex}-${authorId}`];
          return res ? [{ position: res.position, color: ginfo.color }] : [];
        });
        return (
          <>
            {dial && (
              <SpectrumDial
                card={dial}
                dialPosition={50}
                onDialChange={() => {}}
                showTarget
                targetPosition={dial.targetPosition}
                disabled
                hideNeedle
                extraNeedles={extraNeedles}
              />
            )}
            <div className="flex flex-wrap gap-2">
              {guessers.map(([gid, ginfo]) => {
                const res = guessResults[`${gid}-${dialIndex}-${authorId}`];
                const pts = res?.points ?? 0;
                return (
                  <div key={gid} className="flex items-center gap-1 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: ginfo.color }} />
                    <span className="text-muted-foreground">{ginfo.name}:</span>
                    <span className="font-medium">
                      {pts >= 0 ? "+" : ""}{pts}
                      {res?.doubleDown && <span className="ml-0.5 text-amber-400 text-[10px]">2×</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        );
      }}
      renderByPlayerGuess={({ dialIndex, authorId, result }) => {
        const dial = playerDials[authorId]?.[dialIndex];
        return dial ? (
          <SpectrumDial
            card={dial}
            dialPosition={result.position}
            onDialChange={() => {}}
            showTarget
            targetPosition={dial.targetPosition}
            disabled
            smooth
          />
        ) : null;
      }}
    />
  );
}
