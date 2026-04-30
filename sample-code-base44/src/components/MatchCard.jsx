import { Link } from "react-router-dom";
import { MapPin, Clock, Users, Zap, ChevronRight, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

const skillColors = {
  beginner: "bg-green-100 text-green-700",
  intermediate: "bg-blue-100 text-blue-700",
  advanced: "bg-purple-100 text-purple-700",
  any: "bg-gray-100 text-gray-700",
};

export default function MatchCard({ match }) {
  const playerCount = match.players?.length || 1;
  const spotsLeft = match.max_players - playerCount;
  const matchDate = match.date ? format(new Date(match.date), "EEE, MMM d") : "";

  return (
    <Link
      to={`/match/${match.id}`}
      className="block bg-card rounded-2xl border border-border p-4 hover:shadow-md transition-all active:scale-[0.98]"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            {match.is_instant && (
              <span className="flex items-center gap-0.5 text-accent text-xs font-semibold">
                <Zap className="w-3.5 h-3.5 fill-accent" />
                Instant
              </span>
            )}
            {match.visibility === "invite_only" && (
              <span className="flex items-center gap-0.5 text-muted-foreground text-xs font-medium">
                <Lock className="w-3 h-3" /> Invite Only
              </span>
            )}
            <Badge variant="secondary" className={`text-[11px] px-2 py-0 ${skillColors[match.skill_level] || ""}`}>
              {match.skill_level}
            </Badge>
          </div>

          <h3 className="font-heading font-semibold text-foreground truncate">{match.title}</h3>

          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{match.location_name}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
              <Clock className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{matchDate} · {match.time}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 ml-3">
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
          <div className="flex items-center gap-1 mt-auto">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <span className={`text-sm font-medium ${spotsLeft === 0 ? "text-destructive" : "text-primary"}`}>
              {playerCount}/{match.max_players}
            </span>
          </div>
        </div>
      </div>

      {spotsLeft > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <span className="text-xs font-medium text-primary">
            {spotsLeft} spot{spotsLeft > 1 ? "s" : ""} left
          </span>
        </div>
      )}
    </Link>
  );
}