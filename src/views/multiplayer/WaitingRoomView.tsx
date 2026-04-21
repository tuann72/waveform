import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { motion, type Variants } from "motion/react";
import { useGame } from "@/context/GameContext";
import { useMultiplayer } from "@/context/MultiplayerContext";
import { useStorage, useMutation, clearGameData } from "@/lib/liveblocks";
import type { GameMode } from "@/lib/liveblocks";
import { useLeaveRoom } from "@/hooks/useLeaveRoom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ROUND_OPTIONS } from "@/types/game";
import { CARD_CATEGORIES } from "@/data/spectrumCards";
import { Ellipsis } from "@/components/ui/ellipsis";
import { QRCodeSVG } from "qrcode.react";
import { COLOR_PALETTE, COLOR_PALETTE_DEUTERANOMALY, PALETTE_COLS } from "@/lib/colorPalette";
import type { PaletteName } from "@/lib/colorPalette";

function MiniPalettePreview({ palette }: { palette: readonly string[] }) {
  return (
    <div
      className="rounded overflow-hidden"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${PALETTE_COLS}, 1fr)`,
        gap: "1px",
        background: "#000",
      }}
    >
      {palette.map((color, i) => (
        <div key={i} style={{ background: color, aspectRatio: "1" }} />
      ))}
    </div>
  );
}

const INSTRUCTIONS: Record<string, { title: string; steps: string[] }> = {
  classic: {
    title: "Classic",
    steps: [
      "Each player sees a spectrum dial (e.g. Hot ↔ Cold) with a hidden target zone.",
      "Write a clue that hints at where the target sits on the dial.",
      "Everyone else drags the needle to their best guess.",
      "Closer guesses score more points — bullseye scores 3.",
    ],
  },
  "2d": {
    title: "2D",
    steps: [
      "Each player sees a 2D plane with two spectrums — one horizontal, one vertical.",
      "Your target is a hidden point on the plane. Write ONE clue that hints at both axes.",
      "Everyone else taps where they think the target is — scoring uses circular zones.",
      "Bullseye = 3 pts · close = 2 pts · near = 1 pt · miss = 0 pts.",
    ],
  },
  colorform: {
    title: "Colorform",
    steps: [
      "You're shown 3 color swatches — pick one and write a clue for it.",
      "Everyone else taps the color they think you picked on a 32×16 color grid.",
      "Exact match scores 3 pts · 1 cell away scores 2 pts · 2 cells away scores 1 pt.",
    ],
  },
};

function HowToPlayCollapsible({ mode }: { mode: string }) {
  const [open, setOpen] = useState(false);
  const info = INSTRUCTIONS[mode] ?? INSTRUCTIONS.classic;

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors text-sm text-muted-foreground cursor-pointer"
      >
        <span>How to play · {info.title}</span>
        <ChevronDown
          size={14}
          className="transition-transform duration-200 flex-shrink-0"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>
      {open && (
        <ol className="mt-2 flex flex-col gap-1.5 px-3 py-2.5 rounded-lg border border-border bg-muted/20 text-sm text-muted-foreground list-none">
          {info.steps.map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-xs font-mono text-muted-foreground/60 mt-0.5 flex-shrink-0">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const MAX_PLAYERS = 12;
const COPY_FEEDBACK_MS = 2000;
const NO_HOST_TIMEOUT_MS = 8000;

const TIMER_OPTIONS = [
  { value: 30, label: "30s" },
  { value: 60, label: "1 min" },
  { value: 90, label: "90s" },
  { value: 120, label: "2 min" },
  { value: 0, label: "No limit" },
];

const PLAYER_COLORS = [
  "#f87171", "#fb923c", "#facc15", "#4ade80",
  "#22d3ee", "#60a5fa", "#a78bfa", "#e879f9",
  "#f472b6", "#34d399", "#818cf8", "#94a3b8",
];

const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

export function WaitingRoomView() {
  const { state, goTo } = useGame();
  const { mp } = useMultiplayer();

  const phase = useStorage((s) => s?.phase);
  const players = useStorage((s) => s ? Object.entries(s.players) : []) ?? [];
  const totalRounds = useStorage((s) => s?.totalRounds ?? state.totalRounds);
  const gameMode = useStorage((s) => s?.gameMode ?? "classic");
  const clueTimerDuration = useStorage((s) => s?.clueTimerDuration ?? 90);
  const selectedCategories = useStorage((s) => s?.selectedCategories ?? []) ?? [];
  const colorPaletteName = (useStorage((s) => s?.colorPaletteName) ?? "base") as PaletteName;

  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [noHostFound, setNoHostFound] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const storageLoaded = useStorage((s) => s !== null);
  const { leaving, handleLeave } = useLeaveRoom();
  // Non-hosts navigate when phase changes lobby → clue.
  // Hosts NEVER navigate via this effect — they use the Start Game button.
  const seenLobby = useRef(false);

  // Host resets room to a clean state (handles stale rooms from previous games)
  const initRoom = useMutation(({ storage }, id: string, name: string) => {
    const players = storage.get("players");
    // Already registered — reconnecting mid-game or returning after play again; leave state intact
    if (players.has(id)) return;
    // New host or stale room from a previous session — full reset
    clearGameData(storage);
    for (const k of players.keys()) players.delete(k);
    players.set(id, { name, isHost: true, color: PLAYER_COLORS[0] });
  }, []);

  // Non-host registration — enforces 12-player cap
  const registerPlayer = useMutation(
    ({ storage }, id: string, name: string) => {
      const players = storage.get("players");
      if (players.has(id)) return; // already registered (returning after play again)
      if (players.size >= MAX_PLAYERS) return;
      const colorIndex = players.size % PLAYER_COLORS.length;
      players.set(id, { name, isHost: false, color: PLAYER_COLORS[colorIndex] });
    },
    [],
  );

  useEffect(() => {
    if (!storageLoaded) return;
    if (mp.isHost) {
      initRoom(mp.playerId, mp.playerName);
    } else {
      registerPlayer(mp.playerId, mp.playerName);
    }
  }, [storageLoaded]);

  useEffect(() => {
    if (mp.isHost) return; // host navigates explicitly via Start Game button
    if (phase === "lobby") { seenLobby.current = true; return; }
    if (phase === "clue" && seenLobby.current) goTo("multiClue");
  }, [phase, goTo, mp.isHost]);

  const playersRef = useRef(players);
  useEffect(() => { playersRef.current = players; }, [players]);

  // Warn non-hosts if no host appears after a timeout — likely a bad room code
  useEffect(() => {
    if (!storageLoaded || mp.isHost) return;
    const timer = setTimeout(() => {
      const hasHost = playersRef.current.some(([, info]) => info.isHost);
      if (!hasHost) setNoHostFound(true);
    }, NO_HOST_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [storageLoaded]);

  function handleCopy(type: "code" | "link") {
    const text = type === "link"
      ? `${window.location.origin}/?room=${mp.roomCode}`
      : mp.roomCode;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(type);
      setTimeout(() => setCopied(null), COPY_FEEDBACK_MS);
    });
  }

  const setRounds = useMutation(({ storage }, rounds: number) => {
    storage.set("totalRounds", rounds);
  }, []);

  const setGameMode = useMutation(({ storage }, mode: GameMode) => {
    storage.set("gameMode", mode);
  }, []);

  const setClueTimer = useMutation(({ storage }, duration: number) => {
    storage.set("clueTimerDuration", duration);
  }, []);

  const setSelectedCategories = useMutation(({ storage }, cats: string[]) => {
    storage.set("selectedCategories", cats);
  }, []);

  const setColorPalette = useMutation(({ storage }, name: PaletteName) => {
    storage.set("colorPaletteName", name);
  }, []);

  const kickPlayer = useMutation(({ storage }, kickId: string) => {
    storage.get("players").delete(kickId);
  }, []);

  const updatePlayerColor = useMutation(({ storage }, id: string, color: string) => {
    const p = storage.get("players").get(id);
    if (p) storage.get("players").set(id, { ...p, color });
  }, []);

  function toggleCategory(cat: string) {
    if (!mp.isHost) return;
    const next = selectedCategories.includes(cat)
      ? selectedCategories.filter((c) => c !== cat)
      : [...selectedCategories, cat];
    setSelectedCategories(next);
  }

  const startGame = useMutation(({ storage }) => {
    storage.set("cluePhaseStartTime", Date.now());
    storage.set("phase", "clue");
  }, []);

  function handleStart() {
    startGame();
    goTo("multiClue");
  }

  const playerCount = players?.length ?? 0;
  const canStart = mp.isHost && playerCount >= 2;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-4">
      <motion.div
        className="w-full max-w-xs flex flex-col gap-6"
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.07 } } }}
      >
        {/* Header */}
        <motion.div variants={item} className="text-center">
          <h2 className="text-xl font-semibold">Waiting Room</h2>
          <p className="text-sm text-muted-foreground mt-1">Share the code with friends</p>
        </motion.div>

        {/* Room code */}
        <motion.div variants={item} className="rounded-xl border bg-muted/40 px-6 py-4 flex flex-col items-center gap-3">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Room Code</p>
          <p className="text-4xl font-mono font-bold tracking-[0.2em] text-foreground">
            {mp.roomCode}
          </p>
          <QRCodeSVG
            value={`${window.location.origin}/?room=${mp.roomCode}`}
            size={140}
            className="rounded-lg"
          />
          <div className="grid grid-cols-2 gap-2 w-full">
            <Button variant="outline" size="sm" onClick={() => handleCopy("code")}>
              {copied === "code" ? "Copied!" : "Copy Code"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleCopy("link")}>
              {copied === "link" ? "Copied!" : "Copy Link"}
            </Button>
          </div>
        </motion.div>

        <motion.div variants={item}><Separator /></motion.div>

        {/* Game mode selection */}
        <motion.div variants={item} className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Game Mode</p>
          <div className="flex flex-col gap-2">
            {/* Classic + 2D side by side */}
            <div className="grid grid-cols-2 gap-2">
              {(["classic", "2d"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => mp.isHost && setGameMode(mode)}
                  disabled={!mp.isHost}
                  className={`rounded-lg border-2 px-3 py-3 text-sm font-medium transition-colors cursor-pointer disabled:cursor-default ${
                    gameMode === mode
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {mode === "classic" ? "Classic" : "2D"}
                </button>
              ))}
            </div>
            {/* Colorform separated */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-border/60" />
              <span className="text-[10px] text-muted-foreground/50 uppercase tracking-widest px-1">color</span>
              <div className="flex-1 h-px bg-border/60" />
            </div>
            <button
              onClick={() => mp.isHost && setGameMode("colorform")}
              disabled={!mp.isHost}
              className={`w-full rounded-lg border-2 px-3 py-3 text-sm font-medium transition-colors cursor-pointer disabled:cursor-default ${
                gameMode === "colorform"
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              Colorform
            </button>
          </div>
          {!mp.isHost && (
            <p className="text-xs text-muted-foreground text-center">Only the host can change settings</p>
          )}
        </motion.div>

        {/* How to play — updates based on selected mode */}
        <motion.div variants={item}>
          <HowToPlayCollapsible mode={gameMode ?? "classic"} />
        </motion.div>

        {/* Color Palette — Colorform only */}
        {gameMode === "colorform" && (
          <motion.div variants={item} className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Color Palette</p>
            <div className="flex items-center gap-2">
              {/* Base palette button */}
              <div className="relative group">
                <button
                  onClick={() => mp.isHost && setColorPalette("base")}
                  className={`rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors ${mp.isHost ? "cursor-pointer" : "cursor-default"} ${
                    colorPaletteName === "base"
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  Base
                </button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-56 rounded-lg border bg-background shadow-xl p-1.5 hidden group-hover:block">
                  <MiniPalettePreview palette={COLOR_PALETTE} />
                </div>
              </div>
              {/* Colorblind palette button */}
              <div className="relative group">
                <button
                  onClick={() => mp.isHost && setColorPalette("deuteranomaly")}
                  className={`rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors ${mp.isHost ? "cursor-pointer" : "cursor-default"} ${
                    colorPaletteName === "deuteranomaly"
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  Deuteranomaly
                </button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-56 rounded-lg border bg-background shadow-xl p-1.5 hidden group-hover:block">
                  <MiniPalettePreview palette={COLOR_PALETTE_DEUTERANOMALY} />
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Rounds + Clue Timer */}
        <motion.div variants={item} className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Rounds</Label>
            <Select
              value={String(totalRounds ?? 3)}
              onValueChange={(v) => setRounds(Number(v))}
              disabled={!mp.isHost}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROUND_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Clue Timer</Label>
            <Select
              value={String(clueTimerDuration ?? 90)}
              onValueChange={(v) => setClueTimer(Number(v))}
              disabled={!mp.isHost}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMER_OPTIONS.map(({ value, label }) => (
                  <SelectItem key={value} value={String(value)}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </motion.div>

        {/* Card categories — not applicable in Colorform mode */}
        {gameMode !== "colorform" && <motion.div variants={item} className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground">Card Categories</Label>
            <span className="text-xs text-muted-foreground">
              {selectedCategories.length === 0 ? "All" : `${selectedCategories.length} selected`}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => mp.isHost && setSelectedCategories([])}
              disabled={!mp.isHost}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer disabled:cursor-default ${
                selectedCategories.length === 0
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              All
            </button>
            {CARD_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                disabled={!mp.isHost}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer disabled:cursor-default ${
                  selectedCategories.includes(cat)
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </motion.div>}

        <motion.div variants={item}><Separator /></motion.div>

        {/* No-host warning — shown to non-hosts when no host appears after timeout */}
        {noHostFound && (
          <motion.div variants={item} className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            No host found. The room code may be invalid.{" "}
            <button onClick={handleLeave} className="underline cursor-pointer">Leave room</button>
          </motion.div>
        )}

        {/* Player list */}
        <motion.div variants={item} className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Players ({playerCount})
          </p>
          {players?.map(([id, info]) => (
            <div key={id} className="flex flex-col">
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  {id === mp.playerId ? (
                    <button
                      onClick={() => setColorPickerOpen((v) => !v)}
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0 cursor-pointer hover:scale-150 transition-transform"
                      style={{ background: info.color }}
                      aria-label="Change your color"
                    />
                  ) : (
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: info.color }}
                    />
                  )}
                  <span className="text-sm text-foreground">{info.name}</span>
                </div>
                <div className="flex gap-1 items-center">
                  {info.isHost && <Badge variant="secondary">Host</Badge>}
                  {id === mp.playerId && <Badge variant="outline">You</Badge>}
                  {mp.isHost && id !== mp.playerId && (
                    <button
                      onClick={() => kickPlayer(id)}
                      className="ml-1 text-muted-foreground hover:text-destructive transition-colors text-base leading-none cursor-pointer"
                      aria-label={`Kick ${info.name}`}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
              {id === mp.playerId && colorPickerOpen && (
                <div className="flex flex-wrap gap-1.5 pb-2 pl-4">
                  {PLAYER_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => { updatePlayerColor(mp.playerId, color); setColorPickerOpen(false); }}
                      className="w-5 h-5 rounded-full cursor-pointer hover:scale-125 transition-transform flex-shrink-0"
                      style={{
                        background: color,
                        outline: info.color === color ? "2px solid white" : undefined,
                        outlineOffset: "1px",
                      }}
                      aria-label={color}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
          {playerCount < 2 && (
            <p className="text-xs text-muted-foreground mt-1">
              Waiting for players to join<Ellipsis />
            </p>
          )}
          {!mp.isHost && playerCount >= MAX_PLAYERS && !players?.find(([id]) => id === mp.playerId) && (
            <p className="text-xs text-destructive mt-1">Room is full (max {MAX_PLAYERS} players).</p>
          )}
        </motion.div>

        {mp.isHost ? (
          <motion.div variants={item}>
            <Button className="w-full" onClick={handleStart} disabled={!canStart}>
              {canStart ? "Start Game" : "Waiting for players…"}
            </Button>
          </motion.div>
        ) : (
          <motion.p variants={item} className="text-sm text-center text-muted-foreground">
            Waiting for host to start<Ellipsis />
          </motion.p>
        )}

        <motion.div variants={item}>
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={handleLeave} disabled={leaving}>
            {leaving ? "Leaving…" : "Leave Room"}
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}
