import { useNavigate } from "react-router-dom";
import { CalendarDays, MapPin, Users, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";

const STATUS_COLORS = {
  open: "bg-green-100 text-green-700",
  full: "bg-orange-100 text-orange-700",
  in_progress: "bg-blue-100 text-blue-700",
  awaiting_score: "bg-yellow-100 text-yellow-700",
  pending_validation: "bg-purple-100 text-purple-700",
};

export default function UserMatchCard({ match, currentUserEmail }) {
  const navigate = useNavigate();
  const playerCount = match.players?.length || 0;
  const isOrganiser = match.created_by === currentUserEmail;

  let dateStr = "TBC";
  if (match.date) {
    try { dateStr = format(parseISO(match.date), "EEE d MMM"); } catch { dateStr = match.date; }
  }

  const statusLabel = match.status?.replace(/_/g, " ") || "open";

  return (
    <div
      className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3 cursor-pointer hover:border-primary/40 transition-all active:scale-[0.99]"
      onClick={() => navigate(`/match/${match.id}`)}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <p className="font-heading font-semibold text-sm truncate">{match.title}</p>
          {isOrganiser && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/40 text-primary">Organiser</Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-0.5"><CalendarDays className="w-3 h-3" /> {dateStr} {match.time ? `· ${match.time}` : ""}</span>
          {match.location_name && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" /> {match.location_name}</span>}
          <span className="flex items-center gap-0.5"><Users className="w-3 h-3" /> {playerCount}/{match.max_players}</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[match.status] || "bg-secondary text-secondary-foreground"}`}>
          {statusLabel}
        </span>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </div>
    </div>
  );
}