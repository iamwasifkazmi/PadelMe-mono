import { Link } from "react-router-dom";
import { MapPin, Clock, Users, ChevronRight, Send, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import PlayerAvatar from "./PlayerAvatar";

const statusConfig = {
  in_progress: { label: "In Progress", className: "bg-green-100 text-green-700" },
  awaiting_score: { label: "Awaiting Score", className: "bg-amber-100 text-amber-700" },
  pending_validation: { label: "Pending Validation", className: "bg-blue-100 text-blue-700" },
};

export default function InProgressMatchCard({ match, currentUserEmail, users = [] }) {
  const isDoubles = match.match_type === "doubles" || match.match_type === "mixed_doubles";
  const matchDate = match.date ? format(new Date(match.date), "EEE, MMM d") : "";
  const status = statusConfig[match.status] || { label: match.status, className: "bg-gray-100 text-gray-700" };

  const isSubmitter = match.submitted_by === currentUserEmail;
  const isParticipant = match.players?.includes(currentUserEmail);
  const isOpponent = isParticipant && !isSubmitter && match.status === "pending_validation";

  const getUserName = (email) => {
    const u = users.find((u) => u.email === email);
    return u?.full_name || email?.split("@")[0] || "Player";
  };

  // Determine quick action
  let action = null;
  if (match.status === "awaiting_score" && isParticipant) {
    action = { label: "Submit Score", icon: Send, variant: "default" };
  } else if (match.status === "pending_validation" && isOpponent) {
    action = { label: "Confirm Score", icon: CheckCircle, variant: "default" };
  }

  const teamA = match.team_a || [];
  const teamB = match.team_b || [];

  return (
    <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge className={`text-[11px] px-2 py-0 border-0 ${status.className}`}>
              {status.label}
            </Badge>
          </div>
          <h3 className="font-heading font-semibold text-foreground truncate">{match.title}</h3>
          <div className="mt-1 space-y-0.5">
            {match.location_name && (
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{match.location_name}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <Clock className="w-3 h-3 flex-shrink-0" />
              <span>{matchDate} · {match.time}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Teams display for doubles */}
      {isDoubles && teamA.length > 0 && teamB.length > 0 ? (
        <div className="flex items-center gap-2">
          <TeamPill emails={teamA} getUserName={getUserName} currentUserEmail={currentUserEmail} />
          <span className="text-xs font-bold text-muted-foreground shrink-0">vs</span>
          <TeamPill emails={teamB} getUserName={getUserName} currentUserEmail={currentUserEmail} />
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="w-3.5 h-3.5" />
          <span>{match.players?.length || 0}/{match.max_players} players</span>
        </div>
      )}

      {/* Score if available */}
      {(match.score_team_a || match.submitted_score_p1) && (
        <div className="flex items-center gap-2 text-sm font-heading font-bold text-center">
          <span className="flex-1 text-right">{match.score_team_a || match.submitted_score_p1}</span>
          <span className="text-muted-foreground">–</span>
          <span className="flex-1 text-left">{match.score_team_b || match.submitted_score_p2}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Link to={`/match/${match.id}`} className="flex-1">
          <Button variant="outline" size="sm" className="w-full rounded-xl text-xs h-8 gap-1">
            View Match <ChevronRight className="w-3 h-3" />
          </Button>
        </Link>
        {action && (
          <Link to={`/match/${match.id}`} className="flex-1">
            <Button size="sm" className="w-full rounded-xl text-xs h-8 gap-1">
              <action.icon className="w-3 h-3" /> {action.label}
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

function TeamPill({ emails, getUserName, currentUserEmail }) {
  return (
    <div className="flex-1 bg-muted/50 rounded-xl p-2 space-y-1">
      {emails.map((email) => (
        <div key={email} className="flex items-center gap-1.5">
          <PlayerAvatar name={getUserName(email)} size="sm" />
          <span className={`text-xs truncate ${email === currentUserEmail ? "font-semibold text-primary" : "text-foreground"}`}>
            {getUserName(email)}
          </span>
        </div>
      ))}
    </div>
  );
}