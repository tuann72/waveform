import { useEffect, useState } from "react";
import { useGame } from "@/context/GameContext";
import { useTheme } from "@/components/theme-context";
import { Button } from "@/components/ui/button";
import { WaveBackground } from "@/components/LavaLampBackground";

function useResolvedTheme(): "light" | "dark" {
  const { theme } = useTheme();
  const [systemDark, setSystemDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);
  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}

export function StartView() {
  const { goTo } = useGame();
  const resolved = useResolvedTheme();

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center gap-8 px-4 overflow-hidden">
      <WaveBackground isDark={resolved === "dark"} />

      {/* Content sits above the canvas */}
      <div className="relative z-10 flex flex-col items-center gap-3 text-center">
        <h1 className="text-6xl font-semibold tracking-tight text-white drop-shadow-lg">Waveform</h1>
        <p className="text-lg text-white/70">How well do you read the spectrum?</p>
      </div>

      <Button
        size="lg"
        className="relative z-10 px-12 text-base cursor-pointer"
        onClick={() => goTo("joinOrHost")}
      >
        Play
      </Button>

    </div>
  );
}