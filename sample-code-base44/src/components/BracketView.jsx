import { Trophy, Send, CheckCircle, Edit2, Lock, AlertCircle, Shield } from "lucide-react";
import { getScoreEntryStatus } from "../utils/scoreEntryRules";
import { Button } from "@/components/ui/button";
import ResultStatusBadge from "./ResultStatusBadge";

function getRoundName(round, totalRounds) {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semi Finals";
  if (fromEnd === 2) return "Quarter Finals";
  return `Round ${round}`;
}

export default function BracketView({ matches, currentUserEmail, onSubmitScore, onValidateScore, onHostScore, isHost = false, competitionType = "tournament", hasEntryFee = false, isDoubles = false }) {
  if (!matches || matches.length === 0) {
    return (
      <div className="text-center py-8">
        <Trophy className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-muted-foreground text-sm">Bracket will appear once the tournament starts</p>
      </div>
    );
  }

  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  const totalRounds = rounds.length;

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-4 pb-4 min-w-max">
        {rounds.map((round) => {
          const roundMatches = matches
            .filter((m) => m.round === round)
            .sort((a, b) => (a.match_order || 0) - (b.match_order || 0));

          return (
            <div key={round} className="flex flex-col gap-4 w-60">
              <h4 className="font-heading font-semibold text-xs text-muted-foreground uppercase tracking-wide text-center">
                {getRoundName(round, totalRounds)}
              </h4>
              {roundMatches.map((match) => (
                <BracketMatch
                  key={match.id}
                  match={match}
                  currentUserEmail={currentUserEmail}
                  onSubmitScore={onSubmitScore}
                  onValidateScore={onValidateScore}
                  onHostScore={onHostScore}
                  isHost={isHost}
                  competitionType={competitionType}
                  hasEntryFee={hasEntryFee}
                  isDoubles={isDoubles}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BracketMatch({ match, currentUserEmail, onSubmitScore, onValidateScore, onHostScore, isHost, competitionType, hasEntryFee, isDoubles }) {
  const matchIsDoubles = isDoubles || (match.team_a_emails?.length > 0);
  const teamAEmails = match.team_a_emails || [];
  const teamBEmails = match.team_b_emails || [];

  const p1Won = matchIsDoubles ? match.winner_team === "team_a" : match.winner_email === match.player1_email;
  const p2Won = matchIsDoubles ? match.winner_team === "team_b" : match.winner_email === match.player2_email;
  const isConfirmed = match.status === "confirmed";

  const allMatchEmails = matchIsDoubles ? [...teamAEmails, ...teamBEmails] : [match.player1_email, match.player2_email];
  const isParticipant = allMatchEmails.includes(currentUserEmail);
  const isOpponent = currentUserEmail !== match.submitted_by && isParticipant;
  const isSubmitter = currentUserEmail === match.submitted_by;

  const canEdit = isSubmitter && match.status === "pending_validation";

  const canValidate =
    isOpponent &&
    match.status === "pending_validation";

  const { allowed: canSubmit, reason: blockedReason, lateSubmission } = getScoreEntryStatus(match, currentUserEmail, hasEntryFee);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <PlayerSlot
        name={match.player1_name || "TBD"}
        score={isConfirmed ? match.score_player1 : match.submitted_score_p1}
        isWinner={p1Won}
        isConfirmed={isConfirmed}
        isEmpty={!match.player1_email}
        extraNames={matchIsDoubles && teamAEmails.length > 1 ? teamAEmails.slice(1).join(", ") : null}
      />
      <div className="h-px bg-border" />
      <PlayerSlot
        name={match.player2_name || "TBD"}
        score={isConfirmed ? match.score_player2 : match.submitted_score_p2}
        isWinner={p2Won}
        isConfirmed={isConfirmed}
        isEmpty={!match.player2_email}
        extraNames={matchIsDoubles && teamBEmails.length > 1 ? teamBEmails.slice(1).join(", ") : null}
      />

      {/* Status + action row */}
      <div className="px-3 py-2 bg-muted/30 border-t border-border flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <ResultStatusBadge status={match.status} />
          {canSubmit && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px] px-2 gap-1 rounded-lg"
              onClick={() => onSubmitScore?.(match)}
            >
              <Send className="w-3 h-3" /> Submit
            </Button>
          )}
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px] px-2 gap-1 rounded-lg text-accent border-accent/30"
              onClick={() => onSubmitScore?.(match)}
            >
              <Edit2 className="w-3 h-3" /> Edit
            </Button>
          )}
          {canValidate && (
            <Button
              size="sm"
              className="h-6 text-[11px] px-2 gap-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white"
              onClick={() => onValidateScore?.(match)}
            >
              <CheckCircle className="w-3 h-3" /> Validate
            </Button>
          )}
          {lateSubmission && isParticipant && (
            <span className="flex items-center gap-1 text-[11px] text-destructive font-medium">
              <Lock className="w-3 h-3" /> Expired
            </span>
          )}
          {isHost && !isConfirmed && match.player1_email && match.player2_email && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px] px-2 gap-1 rounded-lg text-primary border-primary/30"
              onClick={() => onHostScore?.(match)}
            >
              <Shield className="w-3 h-3" /> Score
            </Button>
          )}
        </div>
        {isParticipant && blockedReason && !canEdit && !canValidate && !isConfirmed && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <AlertCircle className="w-3 h-3 flex-shrink-0" /> {blockedReason}
          </p>
        )}
      </div>
    </div>
  );
}

function PlayerSlot({ name, score, isWinner, isConfirmed, isEmpty, extraNames }) {
  return (
    <div
      className={`flex items-center justify-between px-3 py-2.5 ${isWinner ? "bg-primary/10" : ""} ${isEmpty ? "opacity-40" : ""}`}
    >
      <div className="min-w-0 flex-1">
        <span className={`block truncate text-sm ${isWinner ? "font-semibold text-primary" : "text-foreground"}`}>
          {name}
        </span>
        {extraNames && (
          <span className="block truncate text-xs text-muted-foreground">{extraNames}</span>
        )}
      </div>
      <div className="flex items-center gap-1 ml-2">
        {score != null && score !== "" && (
          <span className={`font-heading font-bold text-sm ${isConfirmed && isWinner ? "text-primary" : "text-muted-foreground"}`}>
            {score}
          </span>
        )}
        {isWinner && isConfirmed && <Trophy className="w-3 h-3 text-accent flex-shrink-0" />}
      </div>
    </div>
  );
}