import { Link } from "react-router-dom";
import { Trophy, Users, MapPin, Calendar, DollarSign, ChevronRight, Crown, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

const statusColors = {
  upcoming: "bg-blue-100 text-blue-700",
  registration: "bg-green-100 text-green-700",
  in_progress: "bg-accent/20 text-accent",
  completed: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-600",
};

const formatLabels = {
  knockout: "Knockout",
  round_robin: "Round Robin",
  group_knockout: "Group + KO",
};

export default function CompetitionCard({ competition }) {
  const startDate = competition.start_date ? format(new Date(competition.start_date), "MMM d") : "";
  const endDate = competition.end_date ? format(new Date(competition.end_date), "MMM d") : "";
  const playerCount = competition.participants?.length || 0;
  const spotsLeft = competition.max_players - playerCount;

  const prizePool = competition.entry_fee
    ? (competition.entry_fee * playerCount * 0.975).toFixed(2)
    : 0;

  return (
    <Link
      to={`/competition/${competition.id}`}
      className="block bg-card rounded-2xl border border-border p-4 hover:shadow-md transition-all active:scale-[0.98]"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className={`text-[11px] px-2 py-0 capitalize ${statusColors[competition.status] || ""}`}>
            {competition.status?.replace("_", " ")}
          </Badge>
          <Badge variant="outline" className="text-[11px] px-2 py-0">
            {formatLabels[competition.format] || competition.format}
          </Badge>
          {competition.type === "league" && (
            <Badge variant="outline" className="text-[11px] px-2 py-0 bg-purple-50 text-purple-700 border-purple-200">
              League
            </Badge>
          )}
          {competition.visibility === "invite_only" && (
            <Badge variant="outline" className="text-[11px] px-2 py-0 flex items-center gap-0.5 text-muted-foreground">
              <Lock className="w-2.5 h-2.5" /> Invite Only
            </Badge>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </div>

      <h3 className="font-heading font-semibold text-foreground mb-2">{competition.name}</h3>

      <div className="space-y-1.5">
        {competition.location_name && (
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <MapPin className="w-3.5 h-3.5" /> {competition.location_name}
          </div>
        )}
        {startDate && (
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <Calendar className="w-3.5 h-3.5" />
            {endDate && endDate !== startDate ? `${startDate} – ${endDate}` : startDate}
          </div>
        )}
        <div className="flex items-center gap-3 mt-2">
          <div className="flex items-center gap-1 text-xs">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <span className={spotsLeft > 0 ? "text-primary font-medium" : "text-destructive"}>
              {playerCount}/{competition.max_players}
            </span>
          </div>
          {competition.entry_fee > 0 && (
            <div className="flex items-center gap-1 text-xs">
              <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="font-medium">£{competition.entry_fee} entry</span>
              <span className="text-muted-foreground">· Pool: £{prizePool}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}