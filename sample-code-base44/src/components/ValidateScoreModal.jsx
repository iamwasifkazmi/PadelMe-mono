import { useState } from "react";
import { CheckCircle, XCircle, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";

export default function ValidateScoreModal({ open, onClose, match, currentUserEmail, currentUserName, onValidated }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const isDoubles = match?.match_type === "doubles" || match?.match_type === "mixed_doubles";

  const submitterName = match?.player1_email === match?.submitted_by
    ? match?.player1_name
    : match?.player2_name;

  const s1 = Number(match?.submitted_score_p1 || 0);
  const s2 = Number(match?.submitted_score_p2 || 0);
  const submittedWinnerEmail = s1 > s2 ? match?.player1_email : match?.player2_email;
  const submittedWinnerTeam = s1 > s2 ? 'team_a' : 'team_b';
  const actorName = currentUserName || currentUserEmail;

  const handleConfirm = async () => {
    setLoading(true);

    await base44.entities.CompetitionMatch.update(match.id, {
      score_player1: match.submitted_score_p1,
      score_player2: match.submitted_score_p2,
      winner_email: isDoubles ? null : submittedWinnerEmail,
      winner_team: isDoubles ? submittedWinnerTeam : undefined,
      confirmed_by: currentUserEmail,
      status: "confirmed",
    });

    // Audit log
    await base44.entities.ScoreAuditLog.create({
      competition_match_id: match.id,
      competition_id: match.competition_id,
      action: "confirmed",
      actor_email: currentUserEmail,
      actor_name: actorName,
      score_p1: match.submitted_score_p1,
      score_p2: match.submitted_score_p2,
      player1_name: match.player1_name,
      player2_name: match.player2_name,
      timestamp: new Date().toISOString(),
    });

    // Now safe to update player stats (only after confirmation)
    if (isDoubles) {
      const winnerEmails = submittedWinnerTeam === 'team_a' ? match.team_a_emails : match.team_b_emails;
      const loserEmails = submittedWinnerTeam === 'team_a' ? match.team_b_emails : match.team_a_emails;
      await base44.functions.invoke("updatePlayerStats", {
        match_id: match.id,
        match_title: match.title || "Competition Match",
        match_date: match.scheduled_date,
        score: `${match.submitted_score_p1},${match.submitted_score_p2}`,
        winner_emails: winnerEmails,
        loser_emails: loserEmails,
      });
    } else {
      const loserEmail = submittedWinnerEmail === match?.player1_email ? match?.player2_email : match?.player1_email;
      await base44.functions.invoke("updatePlayerStats", {
        match_id: match.id,
        match_title: match.title || "Competition Match",
        match_date: match.scheduled_date,
        score: `${match.submitted_score_p1},${match.submitted_score_p2}`,
        winner_email: submittedWinnerEmail,
        loser_email: loserEmail,
      });
    }

    // Advance bracket after confirmation
    await base44.functions.invoke("advanceBracket", {
      competition_id: match.competition_id,
      confirmed_match_id: match.id,
    });

    onValidated?.();
    onClose();
    setLoading(false);
  };

  const handleReject = async () => {
    setLoading(true);

    await base44.entities.CompetitionMatch.update(match.id, {
      rejected_by: currentUserEmail,
      rejection_reason: reason,
      status: "disputed",
    });

    // Audit log
    await base44.entities.ScoreAuditLog.create({
      competition_match_id: match.id,
      competition_id: match.competition_id,
      action: "rejected",
      actor_email: currentUserEmail,
      actor_name: actorName,
      score_p1: match.submitted_score_p1,
      score_p2: match.submitted_score_p2,
      player1_name: match.player1_name,
      player2_name: match.player2_name,
      reason,
      timestamp: new Date().toISOString(),
    });

    onValidated?.();
    onClose();
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm mx-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading">Validate Match Result</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-muted-foreground text-sm">
            <span className="font-medium text-foreground">{submitterName}</span> submitted this result. Please confirm or dispute it.
          </p>

          <div className="bg-muted/50 rounded-xl p-4">
            <p className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide">Submitted Score</p>
            <div className="flex items-center justify-center gap-4">
              <div className="text-center">
                <p className="font-heading font-bold text-2xl">{match?.submitted_score_p1}</p>
                <p className="text-xs text-muted-foreground">{match?.player1_name}</p>
              </div>
              <span className="text-muted-foreground font-bold">–</span>
              <div className="text-center">
                <p className="font-heading font-bold text-2xl">{match?.submitted_score_p2}</p>
                <p className="text-xs text-muted-foreground">{match?.player2_name}</p>
              </div>
            </div>
          </div>

          {match?.evidence_url && (
            <a
              href={match.evidence_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <ExternalLink className="w-4 h-4" /> View submitted evidence
            </a>
          )}

          {rejecting && (
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Reason for dispute</Label>
              <Textarea
                placeholder="Describe the disagreement..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="rounded-xl resize-none"
                rows={3}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {!rejecting ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setRejecting(true)}
                  className="rounded-xl h-11 border-destructive/30 text-destructive hover:bg-destructive/5 gap-1.5"
                >
                  <XCircle className="w-4 h-4" /> Dispute
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={loading}
                  className="rounded-xl h-11 font-heading font-semibold gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle className="w-4 h-4" /> Confirm
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setRejecting(false)} className="rounded-xl h-11">
                  Cancel
                </Button>
                <Button
                  onClick={handleReject}
                  disabled={loading || !reason.trim()}
                  className="rounded-xl h-11 font-heading font-semibold bg-destructive hover:bg-destructive/90 text-white"
                >
                  {loading ? "..." : "Send to Admin"}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}