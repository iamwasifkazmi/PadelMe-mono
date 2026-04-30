import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { MapPin, Star, RefreshCw, MessageCircle, ChevronDown, ChevronUp, Trophy, X, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <span className={`text-xs font-bold ${isPos ? "text-green-600" : isNeg ? "text-red-500" : "text-muted-foreground"}`}>
      {isPos ? `+${change}` : isNeg ? change : "±0"} ELO
    </span>
  );
}

export default function PastEventCard({ match, currentUser, allUsers = [], myRatings = [] }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [messaging, setMessaging] = useState(false);

  const userMap = Object.fromEntries(allUsers.map(u => [u.email, u]));

  // Determine result
  const myEmail = currentUser?.email;
  let result = "played";
  let eloChange = null;

  const isDoubles = match.match_type !== "singles";
  const myTeam = match.team_a?.includes(myEmail) ? "team_a" : match.team_b?.includes(myEmail) ? "team_b" : null;

  if (match.winner_team && myTeam) {
    result = match.winner_team === myTeam ? "win" : "loss";
  } else if (match.winner_email) {
    result = match.winner_email === myEmail ? "win" : (match.players?.includes(myEmail) ? "loss" : "played");
  }

  // ELO change — look at recent form logs if available (fallback: none)
  // We'll accept eloChange from parent if passed
  if (match._eloChange !== undefined) eloChange = match._eloChange;

  // Score display
  const scoreA = match.score_team_a || match.submitted_score_a;
  const scoreB = match.score_team_b || match.submitted_score_b;
  const hasScore = scoreA || scoreB;

  // Teams
  const teamA = (match.team_a || []).map(e => userMap[e]?.name || userMap[e]?.full_name || e.split("@")[0]);
  const teamB = (match.team_b || []).map(e => userMap[e]?.name || userMap[e]?.full_name || e.split("@")[0]);
  const players = (match.players || []).filter(e => e !== myEmail).map(e => userMap[e]?.name || userMap[e]?.full_name || e.split("@")[0]);

  // Check if already rated all players
  const otherPlayers = (match.players || []).filter(e => e !== myEmail);
  const ratedEmails = new Set(myRatings.filter(r => r.match_id === match.id).map(r => r.rated_email));
  const allRated = otherPlayers.length > 0 && otherPlayers.every(e => ratedEmails.has(e));
  const needsRating = otherPlayers.length > 0 && !allRated;

  // Date
  let dateStr = "";
  try { dateStr = match.date ? format(parseISO(match.date), "EEE d MMM") : ""; } catch { dateStr = match.date || ""; }

  const handleRematch = () => {
    const params = new URLSearchParams();
    if (match.location_name) params.set("location_name", match.location_name);
    if (match.skill_level) params.set("skill_level", match.skill_level);
    if (match.match_type) params.set("match_type", match.match_type);
    const invites = (match.players || []).filter(e => e !== myEmail);
    if (invites.length) params.set("invite_emails", invites.join(","));
    navigate(`/create-match?${params.toString()}`);
  };

  const handleMessage = async () => {
    const others = (match.players || []).filter(e => e !== myEmail);
    if (!others.length) return;
    setMessaging(true);
    const conv = await getOrCreateMatchConversation(match, currentUser);
    setMessaging(false);
    navigate(`/conversation/${conv.id}`);
  };

  const resultBorderColor = result === "win" ? "border-green-200" : result === "loss" ? "border-red-200" : "border-border";

  return (
    <div className={`bg-card rounded-2xl border ${resultBorderColor} overflow-hidden transition-all`}>
      {/* Card header — always visible */}
      <div
        className="p-4 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Top row: result + ELO + date */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ResultBadge result={result} />
            <ELOChange change={eloChange} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{dateStr}</span>
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>

        {/* Match title + location */}
        <p className="font-heading font-semibold text-sm mb-0.5">{match.title}</p>
        {match.location_name && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
            <MapPin className="w-3 h-3" /> {match.location_name}
          </p>
        )}

        {/* Teams / score */}
        {isDoubles && teamA.length > 0 && teamB.length > 0 ? (
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className={`font-medium ${myTeam === "team_a" ? "text-foreground" : "text-muted-foreground"}`}>
              {teamA.join(" & ")}
            </span>
            {hasScore && (
              <span className="font-bold text-foreground px-1">{scoreA} – {scoreB}</span>
            )}
            <span className={`font-medium ${myTeam === "team_b" ? "text-foreground" : "text-muted-foreground"}`}>
              {teamB.join(" & ")}
            </span>
          </div>
        ) : players.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            With: {players.slice(0, 3).join(", ")}
            {hasScore && <span className="ml-2 font-semibold text-foreground">{scoreA} – {scoreB}</span>}
          </p>
        ) : null}

        {!hasScore && match.status === "completed" && (
          <p className="text-xs text-muted-foreground italic mt-1">Score not submitted</p>
        )}
      </div>

      {/* Actions row */}
      <div className="px-4 pb-4 flex items-center gap-2 flex-wrap">
        {needsRating ? (
          <Button
            size="sm"
            className="h-8 rounded-xl text-xs gap-1.5 bg-accent/90 hover:bg-accent text-accent-foreground"
            onClick={() => navigate(`/match/${match.id}`)}
          >
            <Star className="w-3.5 h-3.5" /> Rate Players
          </Button>
        ) : allRated ? (
          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
            <Star className="w-3.5 h-3.5 fill-green-500 text-green-500" /> Rated ✓
          </span>
        ) : null}

        <Button size="sm" variant="outline" className="h-8 rounded-xl text-xs gap-1.5" onClick={handleRematch}>
          <RefreshCw className="w-3 h-3" /> Rematch
        </Button>

        <Button size="sm" variant="ghost" className="h-8 rounded-xl text-xs gap-1.5 text-muted-foreground" onClick={handleMessage} disabled={messaging}>
          <MessageCircle className="w-3 h-3" /> Chat
        </Button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3 bg-muted/30">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground mb-0.5">Format</p>
              <p className="font-medium capitalize">{(match.match_type || "singles").replace("_", " ")}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-0.5">Players</p>
              <p className="font-medium">{match.players?.length || 0}</p>
            </div>
            {match.skill_level && (
              <div>
                <p className="text-muted-foreground mb-0.5">Level</p>
                <p className="font-medium capitalize">{match.skill_level}</p>
              </div>
            )}
            {match.duration_minutes && (
              <div>
                <p className="text-muted-foreground mb-0.5">Duration</p>
                <p className="font-medium">{match.duration_minutes} min</p>
              </div>
            )}
          </div>

          <Button
            size="sm"
            variant="outline"
            className="w-full h-8 rounded-xl text-xs"
            onClick={() => navigate(`/match/${match.id}`)}
          >
            View Full Match Details →
          </Button>
        </div>
      )}
    </div>
  );
}