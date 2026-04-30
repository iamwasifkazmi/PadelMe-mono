/**
 * HistoryItemCard — unified card for matches, tournaments, leagues, and competitions
 * in all history views (Past Events, Profile Match History, Performance Tab).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { MapPin, Star, RefreshCw, MessageCircle, ChevronDown, ChevronUp, Trophy, X, Minus, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { base44 } from "@/api/base44Client";
import { getOrCreateMatchConversation } from "@/lib/chat";

function ResultBadge({ result }) {
  if (result === "win") return (
    <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700">
      <Trophy className="w-3 h-3" /> WIN
    </span>
  );
  if (result === "loss") return (
    <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700">
      <X className="w-3 h-3" /> LOSS
    </span>
  );
  if (result === "cancelled") return (
    <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
      CANCELLED
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground">
      <Minus className="w-3 h-3" /> PLAYED
    </span>
  );
}

function ELOChange({ change }) {
  if (change === null || change === undefined) return null;
  const isPos = change > 0;
  const isNeg = change < 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-bold ${isPos ? "text-green-600" : isNeg ? "text-red-500" : "text-muted-foreground"}`}>
      {isPos ? <TrendingUp className="w-3 h-3" /> : isNeg ? <TrendingDown className="w-3 h-3" /> : null}
      {isPos ? `+${change}` : isNeg ? change : "±0"} ELO
    </span>
  );
}

const TYPE_ICON = {
  "Singles Match": "🎾",
  "Doubles Match": "🎾",
  "Tournament": "🏆",
  "League": "📊",
  "Competition": "🏅",
};

export default function HistoryItemCard({ item, currentUser, allUsers = [], myRatings = [] }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [messaging, setMessaging] = useState(false);

  const userMap = Object.fromEntries(allUsers.map(u => [u.email, u]));
  const myEmail = currentUser?.email;

  const isMatch = item._type === "match";
  const hasScore = item.scoreA || item.scoreB;

  // Team / player names
  const teamANames = item.teamA.map(e => userMap[e]?.name || userMap[e]?.full_name || e.split("@")[0]);
  const teamBNames = item.teamB.map(e => userMap[e]?.name || userMap[e]?.full_name || e.split("@")[0]);
  const otherPlayers = item.players.filter(e => e !== myEmail);
  const otherPlayerNames = otherPlayers.map(e => userMap[e]?.name || userMap[e]?.full_name || e.split("@")[0]);

  const isDoubles = item.teamA.length > 0 && item.teamB.length > 0;

  // Rating status (matches only)
  const ratedEmails = new Set(myRatings.filter(r => r.match_id === item.id).map(r => r.rated_email));
  const allRated = isMatch && otherPlayers.length > 0 && otherPlayers.every(e => ratedEmails.has(e));
  const needsRating = isMatch && otherPlayers.length > 0 && !allRated && item.result !== "cancelled";

  // Date display
  let dateStr = "";
  try { dateStr = item.date ? format(parseISO(item.date), "EEE d MMM") : ""; } catch { dateStr = item.date || ""; }

  const resultBorderColor = item.result === "win" ? "border-green-200" : item.result === "loss" ? "border-red-200" : item.result === "cancelled" ? "border-gray-200" : "border-border";

  const handleRematch = () => {
    if (!isMatch) return;
    const m = item._raw;
    const params = new URLSearchParams();
    if (m.location_name) params.set("location_name", m.location_name);
    if (m.skill_level) params.set("skill_level", m.skill_level);
    if (m.match_type) params.set("match_type", m.match_type);
    const invites = (m.players || []).filter(e => e !== myEmail);
    if (invites.length) params.set("invite_emails", invites.join(","));
    navigate(`/create-match?${params.toString()}`);
  };

  const handleMessage = async () => {
    if (!isMatch) return;
    setMessaging(true);
    const conv = await getOrCreateMatchConversation(item._raw, currentUser);
    setMessaging(false);
    navigate(`/conversation/${conv.id}`);
  };

  const handleViewDetail = () => navigate(item.detailUrl);

  return (
    <div className={`bg-card rounded-2xl border ${resultBorderColor} overflow-hidden transition-all`}>
      {/* Header — always visible */}
      <div className="p-4 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        {/* Top row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <ResultBadge result={item.result} />
            {item.eloChange !== null && <ELOChange change={item.eloChange} />}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-muted-foreground">{dateStr}</span>
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>

        {/* Event type badge + name */}
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-sm">{TYPE_ICON[item.eventType] || "📌"}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-medium">{item.eventType}</Badge>
        </div>
        <p className="font-heading font-semibold text-sm mb-0.5">{item.name}</p>
        {item.location && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
            <MapPin className="w-3 h-3" /> {item.location}
          </p>
        )}

        {/* Score / teams */}
        {isMatch && isDoubles && teamANames.length > 0 && teamBNames.length > 0 ? (
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className={`font-medium ${item.myTeam === "team_a" ? "text-foreground" : "text-muted-foreground"}`}>
              {teamANames.join(" & ")}
            </span>
            {hasScore && <span className="font-bold text-foreground px-1">{item.scoreA} – {item.scoreB}</span>}
            <span className={`font-medium ${item.myTeam === "team_b" ? "text-foreground" : "text-muted-foreground"}`}>
              {teamBNames.join(" & ")}
            </span>
          </div>
        ) : isMatch && otherPlayerNames.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            With: {otherPlayerNames.slice(0, 3).join(", ")}
            {hasScore && <span className="ml-2 font-semibold text-foreground">{item.scoreA} – {item.scoreB}</span>}
          </p>
        ) : !isMatch ? (
          <p className="text-xs text-muted-foreground">{item.playerCount} participants</p>
        ) : null}

        {isMatch && !hasScore && item.status === "completed" && (
          <p className="text-xs text-muted-foreground italic mt-1">Score not submitted</p>
        )}
      </div>

      {/* Actions row */}
      <div className="px-4 pb-4 flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="outline" className="h-8 rounded-xl text-xs gap-1" onClick={handleViewDetail}>
          View Details →
        </Button>

        {isMatch && needsRating && (
          <Button size="sm" className="h-8 rounded-xl text-xs gap-1.5 bg-accent/90 hover:bg-accent text-accent-foreground" onClick={handleViewDetail}>
            <Star className="w-3.5 h-3.5" /> Rate Players
          </Button>
        )}
        {isMatch && allRated && (
          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
            <Star className="w-3.5 h-3.5 fill-green-500 text-green-500" /> Rated ✓
          </span>
        )}
        {isMatch && item.result !== "cancelled" && (
          <Button size="sm" variant="ghost" className="h-8 rounded-xl text-xs gap-1.5 text-muted-foreground" onClick={handleRematch}>
            <RefreshCw className="w-3 h-3" /> Rematch
          </Button>
        )}
        {isMatch && (
          <Button size="sm" variant="ghost" className="h-8 rounded-xl text-xs gap-1.5 text-muted-foreground" onClick={handleMessage} disabled={messaging}>
            <MessageCircle className="w-3 h-3" /> Chat
          </Button>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3 bg-muted/30">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground mb-0.5">Type</p>
              <p className="font-medium">{item.eventType}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-0.5">Status</p>
              <p className="font-medium capitalize">{item.status?.replace(/_/g, " ")}</p>
            </div>
            {isMatch && item._raw.match_type && (
              <div>
                <p className="text-muted-foreground mb-0.5">Format</p>
                <p className="font-medium capitalize">{item._raw.match_type.replace(/_/g, " ")}</p>
              </div>
            )}
            {isMatch && item._raw.skill_level && (
              <div>
                <p className="text-muted-foreground mb-0.5">Level</p>
                <p className="font-medium capitalize">{item._raw.skill_level}</p>
              </div>
            )}
            {isMatch && item._raw.duration_minutes && (
              <div>
                <p className="text-muted-foreground mb-0.5">Duration</p>
                <p className="font-medium">{item._raw.duration_minutes} min</p>
              </div>
            )}
            {!isMatch && item._raw.format && (
              <div>
                <p className="text-muted-foreground mb-0.5">Format</p>
                <p className="font-medium capitalize">{item._raw.format.replace(/_/g, " ")}</p>
              </div>
            )}
            {item.eloChange !== null && (
              <div>
                <p className="text-muted-foreground mb-0.5">ELO Change</p>
                <p className={`font-bold ${item.eloChange > 0 ? "text-green-600" : item.eloChange < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                  {item.eloChange > 0 ? "+" : ""}{item.eloChange}
                </p>
              </div>
            )}
            {item.eloAfter !== null && item.eloAfter !== undefined && (
              <div>
                <p className="text-muted-foreground mb-0.5">ELO After</p>
                <p className="font-bold">{Math.round(item.eloAfter)}</p>
              </div>
            )}
          </div>

          <Button size="sm" variant="outline" className="w-full h-8 rounded-xl text-xs" onClick={handleViewDetail}>
            Open Full Details →
          </Button>
        </div>
      )}
    </div>
  );
}