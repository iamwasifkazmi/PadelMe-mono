import { Star, Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import PlayerAvatar from "./PlayerAvatar";
import VerificationBadge from "./VerificationBadge";

export default function DoublesTeamsDisplay({
  match,
  allUsers,
  currentUserEmail,
  isCreator,
  isCompleted,
  onRate,  // now called with no args — just opens the rating modal
  onLockTeams,
}) {
  const teamA = match?.team_a || [];
  const teamB = match?.team_b || [];
  const maxPerTeam = (match?.max_players || 4) / 2;

  const getUser = (email) => allUsers?.find((u) => u.email === email) || { email, full_name: email.split("@")[0] };

  const TeamColumn = ({ label, emails, colorClass }) => (
    <div className={`flex-1 rounded-xl border-2 p-4 ${colorClass}`}>
      <p className="font-heading font-bold text-sm mb-3 text-center">{label}</p>
      <div className="space-y-3">
        {emails.map((email) => {
          const u = getUser(email);
          return (
            <div key={email} className="flex items-center gap-2">
              <PlayerAvatar name={u.full_name} avatarUrl={u.avatar_url} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <p className="text-sm font-medium truncate">{u.full_name}</p>
                  <VerificationBadge photoVerified={u.photo_verified} idVerified={u.id_verified} size="sm" />
                </div>
                {u.avg_rating && (
                  <p className="text-xs text-muted-foreground">★ {u.avg_rating.toFixed(1)}</p>
                )}
              </div>
              {isCompleted && currentUserEmail && email !== currentUserEmail && onRate && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 rounded-full text-xs gap-1"
                  onClick={() => onRate()}
                >
                  <Star className="w-3 h-3" />
                </Button>
              )}
            </div>
          );
        })}
        {Array.from({ length: maxPerTeam - emails.length }).map((_, i) => (
          <div key={`empty-${i}`} className="flex items-center gap-2 opacity-40">
            <div className="w-8 h-8 rounded-full border-2 border-dashed border-border" />
            <span className="text-xs text-muted-foreground">Open slot</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-heading font-semibold text-sm">Teams</h2>
        {isCreator && !isCompleted && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1 rounded-lg"
            onClick={onLockTeams}
          >
            {match?.teams_locked ? (
              <><Unlock className="w-3 h-3" /> Unlock Teams</>
            ) : (
              <><Lock className="w-3 h-3" /> Lock Teams</>
            )}
          </Button>
        )}
      </div>

      {match?.teams_locked && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Lock className="w-3 h-3" /> Teams are locked by the organiser
        </p>
      )}

      <div className="flex gap-3">
        <TeamColumn label="Team A" emails={teamA} colorClass="border-blue-200 bg-blue-50/50" />
        <div className="flex items-center justify-center text-muted-foreground font-bold text-sm px-1">vs</div>
        <TeamColumn label="Team B" emails={teamB} colorClass="border-red-200 bg-red-50/50" />
      </div>

      {isCompleted && match?.score_team_a && match?.score_team_b && (
        <div className="flex items-center justify-center gap-3 pt-2 border-t border-border">
          <span className={`font-heading font-bold text-lg ${match.winner_team === "team_a" ? "text-primary" : "text-muted-foreground"}`}>
            {match.score_team_a}
          </span>
          <span className="text-muted-foreground">–</span>
          <span className={`font-heading font-bold text-lg ${match.winner_team === "team_b" ? "text-primary" : "text-muted-foreground"}`}>
            {match.score_team_b}
          </span>
        </div>
      )}
    </div>
  );
}