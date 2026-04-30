import { useState } from "react";
import { Users, Shield } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import PlayerAvatar from "./PlayerAvatar";

export default function TeamJoinModal({ open, onClose, match, allUsers, currentUser, onJoin }) {
  const [selected, setSelected] = useState(null);
  const [joining, setJoining] = useState(false);

  const teamA = match?.team_a || [];
  const teamB = match?.team_b || [];
  const maxPerTeam = (match?.max_players || 4) / 2;

  const teamAFull = teamA.length >= maxPerTeam;
  const teamBFull = teamB.length >= maxPerTeam;

  const getName = (email) => {
    const u = allUsers?.find((u) => u.email === email);
    return u?.full_name || email.split("@")[0];
  };

  const handleJoin = async () => {
    if (!selected) return;
    setJoining(true);
    await onJoin(selected);
    setJoining(false);
    onClose();
  };

  const TeamPanel = ({ team, label, emails, isFull, value }) => (
    <button
      onClick={() => !isFull && setSelected(value)}
      disabled={isFull}
      className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
        selected === value
          ? "border-primary bg-primary/5"
          : isFull
          ? "border-border bg-muted/30 opacity-50 cursor-not-allowed"
          : "border-border hover:border-primary/50 bg-card cursor-pointer"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="font-heading font-semibold text-sm">{label}</span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          isFull ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
        }`}>
          {emails.length}/{maxPerTeam} {isFull ? "Full" : "Open"}
        </span>
      </div>
      <div className="space-y-2">
        {emails.map((email) => (
          <div key={email} className="flex items-center gap-2">
            <PlayerAvatar name={getName(email)} size="sm" />
            <span className="text-sm">{getName(email)}</span>
          </div>
        ))}
        {Array.from({ length: maxPerTeam - emails.length }).map((_, i) => (
          <div key={`empty-${i}`} className="flex items-center gap-2 opacity-40">
            <div className="w-8 h-8 rounded-full border-2 border-dashed border-border" />
            <span className="text-xs text-muted-foreground">Open slot</span>
          </div>
        ))}
      </div>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm mx-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Choose Your Team
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {match?.match_type === "mixed_doubles" && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              Mixed doubles: each team must have 1 male & 1 female player.
            </p>
          )}

          <TeamPanel team="a" label="Team A" emails={teamA} isFull={teamAFull} value="team_a" />
          <TeamPanel team="b" label="Team B" emails={teamB} isFull={teamBFull} value="team_b" />

          <Button
            onClick={handleJoin}
            disabled={!selected || joining}
            className="w-full h-11 rounded-xl font-heading font-semibold"
          >
            {joining ? "Joining..." : `Join ${selected === "team_a" ? "Team A" : "Team B"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}