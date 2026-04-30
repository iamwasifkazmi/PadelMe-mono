import { useState } from "react";
import { Shield } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";

export default function HostScoreModal({ open, onClose, match, currentUserEmail, currentUserName, onConfirmed }) {
  const [score1, setScore1] = useState(match?.score_player1 || "");
  const [score2, setScore2] = useState(match?.score_player2 || "");
  const [saving, setSaving] = useState(false);

  const isDoubles = match?.team_a_emails?.length > 0;

  const handleConfirm = async () => {
    if (!score1 || !score2) return;
    setSaving(true);

    const s1 = Number(score1);
    const s2 = Number(score2);
    const winnerEmail = s1 >= s2 ? match.player1_email : match.player2_email;
    const winnerTeam = s1 >= s2 ? 'team_a' : 'team_b';

    await base44.entities.CompetitionMatch.update(match.id, {
      submitted_score_p1: score1,
      submitted_score_p2: score2,
      submitted_by: currentUserEmail,
      score_player1: score1,
      score_player2: score2,
      winner_email: isDoubles ? null : winnerEmail,
      winner_team: isDoubles ? winnerTeam : undefined,
      confirmed_by: currentUserEmail,
      status: "confirmed",
    });

    await base44.entities.ScoreAuditLog.create({
      competition_match_id: match.id,
      competition_id: match.competition_id,
      action: "admin_override",
      actor_email: currentUserEmail,
      actor_name: currentUserName || currentUserEmail,
      score_p1: score1,
      score_p2: score2,
      player1_name: match.player1_name,
      player2_name: match.player2_name,
      reason: "Organiser direct score entry",
      timestamp: new Date().toISOString(),
    });

    // Advance bracket
    await base44.functions.invoke("advanceBracket", {
      competition_id: match.competition_id,
      confirmed_match_id: match.id,
    });

    onConfirmed?.();
    onClose();
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm mx-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Enter Score (Organiser)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-muted-foreground text-sm">
            As organiser you can directly confirm this result. The bracket will advance automatically.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm font-medium mb-1.5 block">{isDoubles ? "Team A" : match?.player1_name}</Label>
              <Input
                placeholder="e.g. 6"
                value={score1}
                onChange={(e) => setScore1(e.target.value)}
                className="rounded-xl h-11 text-center font-heading font-bold text-lg"
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">{isDoubles ? "Team B" : match?.player2_name}</Label>
              <Input
                placeholder="e.g. 4"
                value={score2}
                onChange={(e) => setScore2(e.target.value)}
                className="rounded-xl h-11 text-center font-heading font-bold text-lg"
              />
            </div>
          </div>

          <Button
            onClick={handleConfirm}
            disabled={!score1 || !score2 || saving}
            className="w-full h-11 rounded-xl font-heading font-semibold"
          >
            {saving ? "Saving..." : "Confirm Result & Advance Bracket"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}