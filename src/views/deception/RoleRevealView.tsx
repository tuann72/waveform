import { useEffect, useState } from "react";
import { useMultiplayer } from "@/context/MultiplayerContext";
import { useGame } from "@/context/GameContext";
import { useStorage, useMutation } from "@/lib/liveblocks";
import { deriveKey, decryptJson, encryptJson } from "@/lib/crypto";
import { PlayerStatusList, DoneNode, WaitingNode } from "@/components/game/PlayerStatusList";
import { Button } from "@/components/ui/button";
import { Ellipsis } from "@/components/ui/ellipsis";
import { useLeaveRoom } from "@/hooks/useLeaveRoom";
import type { DeceptionRole, DeceptionRoleBlob, MurdererSolution } from "@/types/deception";

const ROLE_INFO: Record<DeceptionRole, { label: string; description: string; color: string }> = {
  "forensic-scientist": {
    label: "Forensic Scientist",
    description:
      "You know who the murderer is. Guide investigators by placing markers on scene tiles — but you cannot speak about the crime. Choose your markers wisely.",
    color: "text-blue-400",
  },
  murderer: {
    label: "Murderer",
    description:
      "You committed the crime. Select which of your cards is the murder weapon and which is the key evidence. The Forensic Scientist will try to expose you — misdirect them.",
    color: "text-red-400",
  },
  accomplice: {
    label: "Accomplice",
    description:
      "You know who the murderer is. Help them escape by misdirecting investigators during discussion. Win together if the murderer is not caught.",
    color: "text-orange-400",
  },
  investigator: {
    label: "Investigator",
    description:
      "Observe the Forensic Scientist's scene markers carefully. Discuss with your fellow investigators and identify the murderer, their weapon, and key evidence.",
    color: "text-green-400",
  },
};

export function RoleRevealView() {
  const { mp, setDeceptionRole } = useMultiplayer();
  const { goTo } = useGame();
  const { leaving, handleLeave } = useLeaveRoom();

  const players = useStorage((s) => (s ? Object.entries(s.players) : [])) ?? [];
  const encryptedRoles = useStorage((s) =>
    s ? (s.deceptionEncryptedRoles as Record<string, string>) : {}
  ) ?? {};
  const dealtCards = useStorage((s) =>
    s ? (s.deceptionDealtCards as Record<string, { meansCards: string[]; evidenceCards: string[] }>) : {}
  ) ?? {};
  const acknowledged = useStorage((s) =>
    s ? (s.deceptionRoleAcknowledged as Record<string, boolean>) : {}
  ) ?? {};
  const encryptedSolution = useStorage((s) => s?.deceptionEncryptedSolutionForHost ?? null);
  const encryptedSolutionForFs = useStorage((s) => s?.deceptionEncryptedSolutionForFs ?? null);
  const hostId = useStorage((s) => s?.hostId ?? "") ?? "";

  const [myRole, setMyRole] = useState<DeceptionRoleBlob | null>(null);
  const [decryptError, setDecryptError] = useState(false);
  const [selectedMeans, setSelectedMeans] = useState<string | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fsSolution, setFsSolution] = useState<MurdererSolution | null>(null);

  const myHand = dealtCards[mp.playerId];
  const alreadyAcknowledged = acknowledged[mp.playerId] === true;

  // Decrypt own role
  useEffect(() => {
    const blob = encryptedRoles[mp.playerId];
    if (!blob) return;
    deriveKey(mp.roomCode, mp.playerId)
      .then((key) => decryptJson(blob, key))
      .then((data) => {
        const blob = data as DeceptionRoleBlob;
        setMyRole(blob);
        setDeceptionRole(blob.role);
      })
      .catch(() => setDecryptError(true));
  }, [encryptedRoles[mp.playerId]]);

  // FS: decrypt own solution once it's written by the murderer
  useEffect(() => {
    if (myRole?.role !== "forensic-scientist" || !encryptedSolutionForFs || fsSolution) return;
    deriveKey(mp.roomCode, mp.playerId)
      .then((key) => decryptJson(encryptedSolutionForFs, key))
      .then((data) => setFsSolution(data as MurdererSolution))
      .catch(() => {});
  }, [encryptedSolutionForFs, myRole?.role]);

  const writeAcknowledged = useMutation(({ storage }, playerId: string) => {
    storage.get("deceptionRoleAcknowledged").set(playerId, true);
  }, []);

  const writeSolutionForHost = useMutation(({ storage }, hostBlob: string, fsBlob: string) => {
    storage.set("deceptionEncryptedSolutionForHost", hostBlob);
    storage.set("deceptionEncryptedSolutionForFs", fsBlob);
  }, []);

  const advanceToFsPlacement = useMutation(({ storage }) => {
    storage.set("deceptionPhase", "fs-placement");
    storage.set("deceptionFsTimerStart", Date.now());
  }, []);

  // Host watches: all players acknowledged + solution submitted → advance
  useEffect(() => {
    if (!mp.isHost) return;
    const allAcknowledged =
      players.length > 0 && players.every(([id]) => acknowledged[id] === true);
    const solutionReady = encryptedSolution !== null;
    if (allAcknowledged && solutionReady) {
      advanceToFsPlacement();
    }
  }, [acknowledged, encryptedSolution, players, mp.isHost]);

  // Non-hosts navigate when phase changes
  const phase = useStorage((s) => s?.deceptionPhase);
  useEffect(() => {
    if (phase === "fs-placement") goTo("deceptionFsPlacement");
  }, [phase]);

  async function handleConfirmMurderer() {
    if (!selectedMeans || !selectedEvidence || !myRole?.fsPlayerId) return;
    setSubmitting(true);
    try {
      const solution = { meansCard: selectedMeans, evidenceCard: selectedEvidence };
      const hostKey = await deriveKey(mp.roomCode, hostId);
      const hostBlob = await encryptJson(solution, hostKey);
      const fsKey = await deriveKey(mp.roomCode, myRole.fsPlayerId);
      const fsBlob = await encryptJson(solution, fsKey);
      writeSolutionForHost(hostBlob, fsBlob);
      writeAcknowledged(mp.playerId);
    } finally {
      setSubmitting(false);
    }
  }

  function handleAcknowledge() {
    writeAcknowledged(mp.playerId);
  }

  const playerMap = Object.fromEntries(players);
  const totalPlayers = players.length;
  const acknowledgedCount = players.filter(([id]) => acknowledged[id]).length;

  if (decryptError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center flex flex-col gap-3 max-w-xs">
          <p className="text-destructive">Failed to decrypt your role. Try rejoining the room.</p>
          <Button variant="ghost" onClick={handleLeave} disabled={leaving}>Leave Room</Button>
        </div>
      </div>
    );
  }

  if (!myRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Receiving your role<Ellipsis /></p>
      </div>
    );
  }

  const info = ROLE_INFO[myRole.role];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Your Role</p>
          <h2 className={`text-2xl font-bold ${info.color}`}>{info.label}</h2>
        </div>

        <div className="rounded-xl border bg-muted/40 px-5 py-4 text-sm text-muted-foreground leading-relaxed">
          {info.description}
          {(myRole.role === "accomplice" || myRole.role === "forensic-scientist") && myRole.murdererPlayerId && (
            <p className="mt-3 text-foreground font-medium">
              The murderer is:{" "}
              <span className={myRole.role === "forensic-scientist" ? "text-blue-400" : "text-orange-400"}>
                {playerMap[myRole.murdererPlayerId]?.name ?? "Unknown"}
              </span>
            </p>
          )}
        </div>

        {/* FS: see all players' cards and murderer's selected solution */}
        {myRole.role === "forensic-scientist" && (
          <div className="flex flex-col gap-3">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">All Players' Cards</p>
            {players.map(([id, info]) => {
              const hand = dealtCards[id];
              if (!hand) return null;
              const isMurderer = id === myRole.murdererPlayerId;
              return (
                <div key={id} className={`rounded-xl border px-4 py-3 flex flex-col gap-2 ${isMurderer ? "border-red-400/40 bg-red-400/5" : "bg-muted/20"}`}>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: info.color }} />
                    <span className="text-sm font-medium text-foreground">
                      {info.name}{id === mp.playerId ? " (you)" : ""}
                    </span>
                    {isMurderer && <span className="ml-auto text-[10px] text-red-400 uppercase tracking-wide">murderer</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Means</p>
                      {hand.meansCards.map((c) => (
                        <p key={c} className={`text-xs ${fsSolution?.meansCard === c ? "text-red-400 font-semibold" : "text-foreground"}`}>{c}</p>
                      ))}
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Evidence</p>
                      {hand.evidenceCards.map((c) => (
                        <p key={c} className={`text-xs ${fsSolution?.evidenceCard === c ? "text-red-400 font-semibold" : "text-foreground"}`}>{c}</p>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
            {!fsSolution && (
              <p className="text-xs text-muted-foreground text-center">Waiting for murderer to select their weapon<Ellipsis /></p>
            )}
            {fsSolution && (
              <div className="rounded-lg border border-red-400/30 bg-red-400/5 px-4 py-2.5 text-sm">
                <p className="text-[10px] uppercase tracking-widest text-red-400/70 mb-1">Murder weapon &amp; key evidence</p>
                <p className="font-medium text-red-400">{fsSolution.meansCard} · {fsSolution.evidenceCard}</p>
              </div>
            )}
          </div>
        )}

        {/* Murderer: pick solution cards */}
        {myRole.role === "murderer" && !alreadyAcknowledged && myHand && (
          <div className="flex flex-col gap-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Select your murder weapon
            </p>
            <div className="flex flex-wrap gap-2">
              {myHand.meansCards.map((card) => (
                <button
                  key={card}
                  onClick={() => setSelectedMeans(card)}
                  className={`px-3 py-1.5 rounded-lg border text-sm transition-colors cursor-pointer ${
                    selectedMeans === card
                      ? "border-red-400 bg-red-400/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-red-400/50"
                  }`}
                >
                  {card}
                </button>
              ))}
            </div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Select your key evidence
            </p>
            <div className="flex flex-wrap gap-2">
              {myHand.evidenceCards.map((card) => (
                <button
                  key={card}
                  onClick={() => setSelectedEvidence(card)}
                  className={`px-3 py-1.5 rounded-lg border text-sm transition-colors cursor-pointer ${
                    selectedEvidence === card
                      ? "border-red-400 bg-red-400/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-red-400/50"
                  }`}
                >
                  {card}
                </button>
              ))}
            </div>
            <Button
              onClick={handleConfirmMurderer}
              disabled={!selectedMeans || !selectedEvidence || submitting}
              className="w-full"
            >
              {submitting ? "Confirming…" : "Confirm Selection"}
            </Button>
          </div>
        )}

        {/* Everyone else (or murderer after selection) */}
        {(myRole.role !== "murderer" || alreadyAcknowledged) && !alreadyAcknowledged && (
          <Button onClick={handleAcknowledge} className="w-full">
            I understand my role
          </Button>
        )}

        {alreadyAcknowledged && (
          <p className="text-sm text-center text-muted-foreground">
            Waiting for others<Ellipsis />
          </p>
        )}

        {/* Player readiness */}
        <PlayerStatusList
          myPlayerId={mp.playerId}
          entries={players.map(([id, info]) => ({
            id,
            name: info.name,
            color: info.color,
            rightNode: acknowledged[id] ? <DoneNode label="Ready" /> : <WaitingNode />,
          }))}
        />

        <p className="text-xs text-center text-muted-foreground">
          {acknowledgedCount} / {totalPlayers} ready
        </p>
      </div>
    </div>
  );
}
