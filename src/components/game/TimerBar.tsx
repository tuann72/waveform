function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`;
}

interface TimerBarProps {
  timeLeft: number | null;
  duration: number;        // total duration in seconds, used to compute percent
  label?: string;
}

export function TimerBar({ timeLeft, duration, label = "Time remaining" }: TimerBarProps) {
  if (timeLeft === null) return null;

  const percent = duration > 0 ? (timeLeft / duration) * 100 : 100;
  const barColor = percent > 30 ? "bg-primary" : percent > 10 ? "bg-amber-500" : "bg-red-500";
  const textColor =
    percent <= 10 ? "text-red-500" : percent <= 30 ? "text-amber-500" : "text-foreground";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={`text-sm font-mono font-semibold tabular-nums ${textColor}`}>
          {timeLeft === 0 ? "Time's up!" : formatTime(timeLeft)}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
