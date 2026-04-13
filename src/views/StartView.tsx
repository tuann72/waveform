import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useGame } from "@/context/GameContext";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";

const GRADIENTS = {
  light: "linear-gradient(-45deg, #2563eb, #7c3aed, #a855f7, #f97316)",
  dark:  "linear-gradient(-45deg, #1e3a8a, #4c1d95, #581c87, #7c2d12)",
};

function useResolvedTheme(): "light" | "dark" {
  const { theme } = useTheme();
  const [resolved, setResolved] = useState<"light" | "dark">(() => {
    if (theme !== "system") return theme;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    if (theme !== "system") {
      setResolved(theme);
      return;
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setResolved(mq.matches ? "dark" : "light");
    const handler = (e: MediaQueryListEvent) => setResolved(e.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return resolved;
}

export function StartView() {
  const { goTo } = useGame();
  const { setTheme } = useTheme();
  const resolved = useResolvedTheme();

  function toggleTheme() {
    setTheme(resolved === "dark" ? "light" : "dark");
  }

  return (
    <div
      className="relative min-h-screen flex flex-col items-center justify-center gap-8 px-4"
      style={{
        backgroundImage: GRADIENTS[resolved],
        backgroundSize: "300% 300%",
        animation: "gradient-flow 8s ease infinite",
      }}
    >
      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        aria-label="Toggle theme"
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white cursor-pointer"
      >
        {resolved === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-6xl font-semibold tracking-tight text-white">Waveform</h1>
        <p className="text-lg text-white/70">How well do you read the spectrum?</p>
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
