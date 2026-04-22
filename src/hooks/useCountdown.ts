import { useEffect, useState } from "react";

export function useCountdown(
  startTime: number | null,
  duration: number,  // seconds; 0 = disabled
  tickMs = 500,
): number | null {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!duration || !startTime) {
      setTimeLeft(null);
      return;
    }
    const tick = () =>
      setTimeLeft(Math.max(0, duration - Math.floor((Date.now() - startTime) / 1000)));
    tick();
    const id = setInterval(tick, tickMs);
    return () => clearInterval(id);
  }, [startTime, duration, tickMs]);

  return timeLeft;
}
