import { useState, useRef } from "react";
import { useGame } from "@/context/GameContext";
import { useMultiplayer } from "@/context/MultiplayerContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function JoinOrHostView() {
  const { goTo } = useGame();
  const { mp, setPlayerName, hostRoom, joinRoom } = useMultiplayer();
  // Pre-fill code from URL param (e.g. /?room=AB12CD) via lazy initializers
  const [showJoin, setShowJoin] = useState(() => {
    return !!new URLSearchParams(window.location.search).get("room");
  });
  const [code, setCode] = useState(() => {
    const p = new URLSearchParams(window.location.search).get("room");
    return p ? p.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5) : "";
  });
  const [nameError, setNameError] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const nameValid = mp.playerName.trim().length > 0;

  function requireName() {
    if (!nameValid) {
      setNameError(true);
      nameRef.current?.focus();
      return false;
    }
    setNameError(false);
    return true;
  }

  function handleHost() {
    if (!requireName()) return;
    hostRoom();
    goTo("waitingRoom");
  }

  function handleJoin() {
    if (!requireName()) return;
    if (code.length < 5) return;
    joinRoom(code);
    goTo("waitingRoom");
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-4">
      <div className="w-full max-w-xs flex flex-col gap-5">
        <div className="text-center">
          <h2 className="text-2xl font-semibold">Multiplayer</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Host a room or join with a code
          </p>
        </div>

        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="player-name">
            Your name <span className="text-destructive">*</span>
          </Label>
          <Input
            ref={nameRef}
            id="player-name"
            placeholder="Enter your name"
            value={mp.playerName}
            onChange={(e) => {
              setPlayerName(e.target.value);
              if (e.target.value.trim()) setNameError(false);
            }}
            maxLength={20}
            autoFocus
            className={nameError ? "border-destructive focus-visible:ring-destructive" : ""}
          />
          {nameError && (
            <p className="text-xs text-destructive">Please enter your name first</p>
          )}
        </div>

        {!showJoin ? (
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="h-20 flex flex-col gap-1"
              onClick={handleHost}
            >
              <span className="font-semibold">Host</span>
              <span className="text-xs text-muted-foreground">Create a room</span>
            </Button>
            <Button
              variant="outline"
              className="h-20 flex flex-col gap-1"
              onClick={() => {
                if (!requireName()) return;
                setShowJoin(true);
              }}
            >
              <span className="font-semibold">Join</span>
              <span className="text-xs text-muted-foreground">Enter a code</span>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="room-code">Room code</Label>
              <Input
                id="room-code"
                placeholder="XXXXX"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))
                }
                className="font-mono tracking-[0.3em] text-center text-lg uppercase"
                maxLength={5}
                autoFocus
              />
            </div>
            <Button onClick={handleJoin} disabled={code.length < 5}>
              Join Room
            </Button>
          </div>
        )}

        <Button variant="ghost" className="text-muted-foreground" onClick={() => goTo("start")}>
          ← Back
        </Button>
      </div>
    </div>
  );
}
