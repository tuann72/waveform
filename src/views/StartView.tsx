import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
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

  if (theme !== "system") return theme;
  return systemDark ? "dark" : "light";
}

export function StartView() {
  const { goTo } = useGame();
  const { setTheme } = useTheme();
  const resolved = useResolvedTheme();
  function toggleTheme() {
    setTheme(resolved === "dark" ? "light" : "dark");
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center gap-8 px-4 overflow-hidden">
      {/* Lava lamp WebGL background */}
      <WaveBackground isDark={resolved === "dark"} />

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        aria-label="Toggle theme"
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white cursor-pointer z-10"
      >
        {resolved === "dark" ? <Moon size={18} /> : <Sun size={18} />}
      </button>

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
