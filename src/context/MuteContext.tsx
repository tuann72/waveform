import { createContext, useContext, useState } from "react";

const MuteContext = createContext({ muted: false, toggleMute: () => {} });

export function MuteProvider({ children }: { children: React.ReactNode }) {
  const [muted, setMuted] = useState(() => localStorage.getItem("wf-muted") === "true");
  function toggleMute() {
    setMuted((m) => {
      const next = !m;
      localStorage.setItem("wf-muted", String(next));
      return next;
    });
  }
  return <MuteContext.Provider value={{ muted, toggleMute }}>{children}</MuteContext.Provider>;
}

export function useMute() {
  return useContext(MuteContext);
}
