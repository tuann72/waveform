import { useGame } from "@/context/GameContext";
import { Button } from "@/components/ui/button";

export function StartView() {
  const { goTo } = useGame();

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-8 px-4"
      style={{
        background:
          "linear-gradient(-45deg, #2563eb, #7c3aed, #a855f7, #f97316)",
        backgroundSize: "300% 300%",
        animation: "gradient-flow 8s ease infinite",
      }}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-6xl font-semibold tracking-tight text-white">
          Waveform
        </h1>
        <p className="text-lg text-white/70">
          How well do you read the spectrum?
        </p>
      </div>
      <Button
        size="lg"
        className="px-12 text-base cursor-pointer"
        onClick={() => goTo("joinOrHost")}
      >
        Play
      </Button>
    </div>
  );
}
