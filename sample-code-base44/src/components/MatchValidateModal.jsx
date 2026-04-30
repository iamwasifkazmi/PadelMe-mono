import { useState } from "react";
import { CheckCircle, XCircle, TrendingUp, TrendingDown, Trophy } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";
import { notifyScoreConfirmed, notifyScoreDisputed } from "@/lib/notifications";

function formatScore(scoreA, scoreB) {
  if (!scoreA || !scoreB) return null;
  const setsA = scoreA.split(",");
  const setsB = scoreB.split(",");
  if (setsA.length > 1) {
    return setsA.map((a, i) => `${a}–${setsB[i] || 0}`).join(", ");
  }
  return `${scoreA} – ${scoreB}`;
}

export default function MatchValidateModal({ open, onClose, match, currentUserEmail, onValidated }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // post-confirmation summary

  const isDoubles = match?.match_type === "doubles" || match?.match_type === "mixed_doubles";
  const isCaptainA = match?.team_a_captain_email === currentUserEmail;
  const isCaptainB = match?.team_b_captain_email === currentUserEmail;
  const isAuthorizedValidator = isCaptainA || isCaptainB || match?.created_by === currentUserEmail;
  const scoreDisplay = formatScore(match?.submitted_score_a, match?.submitted_score_b);

  const getWinner = () => {
    const a = (match?.submitted_score_a || "").split(",");
    const b = (match?.submitted_score_b || "").split(",");
    if (a.length > 1) {
      const winsA = a.filter((s, i) => Number(s) > Number(b[i] || 0)).length;
      return winsA > a.length / 2 ? "team_a" : "team_b";
    }
    return Number(match?.submitted_score_a) > Number(match?.submitted_score_b) ? "team_a" : "team_b";
  };

  const handleConfirm = async () => {
    setLoading(true);
    const winnerTeam = getWinner();
    const teamA = match?.team_a || [];
    const teamB = match?.team_b || [];
    const winnerEmail = !isDoubles
      ? (winnerTeam === "team_a" ? (teamA[0] || match?.players?.[0]) : (teamB[0] || match?.players?.[1]))
      : null;

    await base44.entities.Match.update(match.id, {
      score_team_a: match.submitted_score_a,
      score_team_b: match.submitted_score_b,
      winner_team: winnerTeam,
      winner_email: winnerEmail,
      confirmed_by: currentUserEmail,
      status: "completed",
    });

    // Raw comma-separated format for stats parsing
    const score = [match.submitted_score_a, match.submitted_score_b].join(",");
    // Display format for result screen
    const scoreDisplay = formatScore(match.submitted_score_a, match.submitted_score_b);

    let eloResult = null;
    if (isDoubles) {
      const winnerEmails = winnerTeam === "team_a" ? teamA : teamB;
      const loserEmails = winnerTeam === "team_a" ? teamB : teamA;
      const res = await base44.functions.invoke("updatePlayerStats", {
        match_id: match.id,
        match_title: match.title,
        match_date: match.date,
        score,
        winner_emails: winnerEmails,
        loser_emails: loserEmails,
      });
      eloResult = res.data?.elo_changes;
    } else {
      const loserEmail = winnerEmail === (teamA[0] || match?.players?.[0])
        ? (teamB[0] || match?.players?.[1])
        : (teamA[0] || match?.players?.[0]);
      const res = await base44.functions.invoke("updatePlayerStats", {
        match_id: match.id,
        match_title: match.title,
        match_date: match.date,
        score,
        winner_email: winnerEmail,
        loser_email: loserEmail,
      });
      eloResult = res.data?.elo_changes;
    }

    const isCurrentUserWinner = isDoubles
      ? (winnerTeam === "team_a" ? teamA.includes(currentUserEmail) : teamB.includes(currentUserEmail))
      : winnerEmail === currentUserEmail;

    setResult({
      winnerTeam,
      winnerEmail,
      isCurrentUserWinner,
      score: scoreDisplay,
      eloChange: isCurrentUserWinner ? eloResult?.winners : eloResult?.losers,
    });

    // Notify all match participants
    const allPlayers = match?.players || [...(match?.team_a || []), ...(match?.team_b || [])];
    notifyScoreConfirmed(allPlayers, match).catch(() => {});

    // Notify all players to rate their opponents
    const otherPlayers = allPlayers.filter((e) => e !== currentUserEmail);
    otherPlayers.forEach((email) => {
      base44.entities.Notification.create({
        user_email: email,
        type: "rating_received",
        title: "Rate your recent match ⭐",
        body: `Your match "${match?.title}" is confirmed! Rate the other players now.`,
        related_entity_type: "match",
        related_entity_id: match?.id,
        action_url: `/match/${match?.id}`,
        is_read: false,
        priority: "normal",
      }).catch(() => {});
    });

    setLoading(false);
    onValidated?.();
  };

  const handleReject = async () => {
    setLoading(true);
    await base44.entities.Match.update(match.id, {
      rejection_reason: reason,
      status: "disputed",
    });
    // Notify all players of the dispute
    const allPlayers = match?.players || [...(match?.team_a || []), ...(match?.team_b || [])];
    notifyScoreDisputed(allPlayers, match).catch(() => {});
    onValidated?.();
    onClose();
    setLoading(false);
  };

  const handleClose = () => {
    setResult(null);
    setRejecting(false);
    setReason("");
    onClose();
  };

  // Post-confirmation result screen
  if (result) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-sm mx-auto rounded-2xl">
          <div className="py-4 flex flex-col items-center gap-4 text-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${result.isCurrentUserWinner ? "bg-green-100" : "bg-muted"}`}>
              {result.isCurrentUserWinner
                ? <Trophy className="w-8 h-8 text-green-600" />
                : <span className="text-3xl">💪</span>}
            </div>

            <div>
              <h2 className="font-heading font-bold text-xl mb-1">
                {result.isCurrentUserWinner ? "You Won! 🏆" : "Match Complete"}
              </h2>
              <p className="text-muted-foreground text-sm">
                {result.isCurrentUserWinner ? "Great game — keep it up!" : "Good effort — better luck next time!"}
              </p>
            </div>

            <div className="bg-muted/50 rounded-2xl px-8 py-4 w-full">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Final Score</p>
              <p className="font-heading font-bold text-2xl">{result.score}</p>
            </div>

            {result.eloChange !== undefined && result.eloChange !== null && (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${
                result.eloChange > 0
                  ? "bg-green-100 text-green-700"
                  : "bg-red-50 text-red-600"
              }`}>
                {result.eloChange > 0
                  ? <TrendingUp className="w-4 h-4" />
                  : <TrendingDown className="w-4 h-4" />}
                {result.eloChange > 0 ? "+" : ""}{result.eloChange} rating points
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Your skill rating has been updated. Rate your opponent to help improve match quality.
            </p>

            <Button onClick={handleClose} className="w-full h-11 rounded-xl font-heading font-semibold">
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm mx-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading">Confirm Match Result</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!isAuthorizedValidator && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive">
              ⚠️ Only team representatives can validate scores.
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            {isCaptainA && "As Team A representative, confirm or dispute this result."}
            {isCaptainB && "As Team B representative, confirm or dispute this result."}
            {!isDoubles && !isCaptainA && !isCaptainB && match?.created_by === currentUserEmail && "As match organiser, confirm or dispute this result."}
            {!isAuthorizedValidator && "Your opponent submitted this result."}
          </p>

          <div className="bg-muted/50 rounded-xl p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">Submitted Score</p>
            <p className="font-heading font-bold text-xl">{scoreDisplay || "—"}</p>
            <div className="flex justify-center gap-8 mt-2 text-xs text-muted-foreground">
              <span>{isDoubles ? "Team A" : "Player 1"}</span>
              <span>{isDoubles ? "Team B" : "Player 2"}</span>
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 bg-primary/5 border border-primary/20 rounded-xl text-xs text-foreground/70">
            <TrendingUp className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
            Confirming will update both players' skill ratings automatically.
          </div>

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

          {isAuthorizedValidator ? (
            <div className="grid grid-cols-2 gap-2">
              {!rejecting ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setRejecting(true)}
                    className="rounded-xl h-11 border-destructive/30 text-destructive hover:bg-destructive/5 gap-1"
                  >
                    <XCircle className="w-4 h-4" /> Dispute
                  </Button>
                  <Button
                    onClick={handleConfirm}
                    disabled={loading}
                    className="rounded-xl h-11 font-heading font-semibold gap-1 bg-green-600 hover:bg-green-700 text-white"
                  >
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <><CheckCircle className="w-4 h-4" /> Confirm</>
                    )}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => setRejecting(false)} className="rounded-xl h-11">Cancel</Button>
                  <Button
                    onClick={handleReject}
                    disabled={loading || !reason.trim()}
                    className="rounded-xl h-11 bg-destructive hover:bg-destructive/90 text-white"
                  >
                    {loading ? "..." : "Send Dispute"}
                  </Button>
                </>
              )}
            </div>
          ) : (
            <Button onClick={handleClose} variant="outline" className="w-full rounded-xl h-11">Close</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}