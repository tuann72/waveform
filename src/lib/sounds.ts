const cache: Record<string, HTMLAudioElement> = {};

export function playPointSound(points: number) {
  const index = Math.min(3, Math.max(0, points));
  const src = `/${index}-point.mp3`;
  if (!cache[src]) cache[src] = new Audio(src);
  const audio = cache[src];
  audio.currentTime = 0;
  audio.play().catch(() => {});
}
