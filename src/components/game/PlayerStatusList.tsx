import { Ellipsis } from "@/components/ui/ellipsis";

export interface PlayerStatusEntry {
  id: string;
  name: string;
  color: string;
  rightNode: React.ReactNode;
}

interface PlayerStatusListProps {
  entries: PlayerStatusEntry[];
  myPlayerId: string;
}

export function PlayerStatusList({ entries, myPlayerId }: PlayerStatusListProps) {
  if (!entries.length) return null;
  return (
    <div className="flex flex-col gap-1">
      {entries.map((e) => (
        <div key={e.id} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: e.color }} />
          <span className="text-muted-foreground">
            {e.name}
            {e.id === myPlayerId ? " (you)" : ""}
          </span>
          <span className="ml-auto">{e.rightNode}</span>
        </div>
      ))}
    </div>
  );
}

export function WaitingNode({ label = "Waiting" }: { label?: string }) {
  return (
    <span className="text-muted-foreground">
      {label}
      <Ellipsis />
    </span>
  );
}

export function DoneNode({ label = "Done" }: { label?: string }) {
  return <span className="text-muted-foreground">{label}</span>;
}
