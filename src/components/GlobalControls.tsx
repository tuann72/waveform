import { useEffect, useState } from "react";
import { Moon, Sun, Volume2, VolumeX } from "lucide-react";
import { useTheme } from "@/components/theme-context";
import { useMute } from "@/context/MuteContext";

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

export function GlobalControls() {
  const { setTheme } = useTheme();
  const { muted, toggleMute } = useMute();
  const resolved = useResolvedTheme();

  const btnClass =
    "p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer";

  return (
    <div className="fixed top-3 right-3 z-50 flex items-center gap-0.5 rounded-lg border border-border/60 bg-background/90 backdrop-blur-sm shadow-sm px-0.5 py-0.5">
      <button onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} className={btnClass}>
        {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
      </button>
      <button
        onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
        aria-label="Toggle theme"
        className={btnClass}
      >
        {resolved === "dark" ? <Moon size={15} /> : <Sun size={15} />}
      </button>
    </div>
  );
}
