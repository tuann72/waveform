import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useOthers, useUpdateMyPresence, useStorage } from "@/lib/liveblocks";
import { useMultiplayer } from "@/context/MultiplayerContext";

const HAMSTERS = Array.from({ length: 12 }, (_, i) => `/hamsters/hamster${i + 1}.jpg`);

interface Floater {
  id: string;
  src: string;
  x: number;
  borderColor?: string;
}

export function EmojiReactions() {
  const updateMyPresence = useUpdateMyPresence();
  const others = useOthers();
  const { mp } = useMultiplayer();
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const seenRef = useRef<Record<string, string>>({});
  const isFirstRunRef = useRef(true);
  const spamLockedRef = useRef(false);

  const playersRaw = useStorage((s) => (s ? Object.entries(s.players) : null));
  const colorMap = useMemo(
    () => new Map((playersRaw ?? []).map(([id, info]) => [id, info.color])),
    [playersRaw],
  );

  const removeFloater = useCallback((id: string) => {
    setFloaters((prev) => {
      const next = prev.filter((f) => f.id !== id);
      if (next.length < 50) spamLockedRef.current = false;
      return next;
    });
  }, []);

  // Local reaction: spawn floater immediately and broadcast via presence
  const handleReact = useCallback((src: string) => {
    if (spamLockedRef.current) return;
    const id = Math.random().toString(36).slice(2);
    updateMyPresence({ reaction: { emoji: src, id } });
    const x = 5 + Math.random() * 80;
    setFloaters((prev) => {
      const next = [...prev, { id: `local-${id}`, src, x, borderColor: colorMap.get(mp.playerId) }];
      if (next.length >= 50) spamLockedRef.current = true;
      return next;
    });
  }, [updateMyPresence, colorMap, mp.playerId]);

  // Spawn floaters for incoming reactions from other players.
  // First run: mark all existing reactions as seen without spawning —
  // they're stale presence carried over from before this view mounted.
  useEffect(() => {
    const incoming: Floater[] = []

    for (const other of others) {
      const reaction = other.presence?.reaction;
      const pid = other.presence?.playerId;
      if (!reaction || !pid) continue;
      if (seenRef.current[pid] === reaction.id) continue;
      seenRef.current[pid] = reaction.id;
      if (isFirstRunRef.current) continue;
      incoming.push({
        id: `${pid}-${reaction.id}`,
        src: reaction.emoji,
        x: 5 + Math.random() * 80,
        borderColor: colorMap.get(pid),
      })
    }
    isFirstRunRef.current = false;

    if (incoming.length > 0) {
      startTransition(() => {
        setFloaters((prev) => {
          const next = [...prev, ...incoming];
          if (next.length >= 50) spamLockedRef.current = true;
          return next;
        })
      })
    }
  }, [others, colorMap]);

  return (
    <>
      {/* Floating hamsters — fixed to viewport, pointer-events-none so they don't block interaction */}
      <AnimatePresence>
        {floaters.map((f) => (
          <motion.img
            key={f.id}
            src={f.src}
            initial={{ opacity: 1, y: 0 }}
            animate={{ opacity: 0, y: "-42vh" }}
            transition={{
              y: { duration: 4.5, ease: "easeOut" },
              opacity: { duration: 3.2, ease: "linear" },
            }}
            onAnimationComplete={() => removeFloater(f.id)}
            className="fixed w-12 h-12 rounded-full object-cover pointer-events-none z-50 select-none"
            style={{
              left: `${f.x}%`,
              bottom: "68px",
              outline: f.borderColor ? `3px solid ${f.borderColor}` : undefined,
              outlineOffset: "2px",
            }}
          />
        ))}
      </AnimatePresence>

      {/* Hamster picker bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center gap-2 px-4 py-2 bg-background/80 backdrop-blur-sm border-t border-border overflow-x-auto">
        {HAMSTERS.map((src) => (
          <button
            key={src}
            onClick={() => handleReact(src)}
            className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden transition-transform hover:scale-125 active:scale-95 cursor-pointer"
          >
            <img src={src} className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
    </>
  );
}
