/**
 * MatchResultPanel — redesigned scoreboard-first layout.
 * Hierarchy: Result → Score (hero) → Teams → ELO → Players
 */
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

function parseSetScores(scoreA, scoreB) {
  if (!scoreA && !scoreB) return [];
  const setsA = (scoreA || "").toString().split(",").map(s => s.trim());
  const setsB = (scoreB || "").toString().split(",").map(s => s.trim());
  const count = Math.max(setsA.length, setsB.length);
  return Array.from({ length: count }, (_, i) => ({
    a: setsA[i] ?? "—",
    b: setsB[i] ?? "—",
  }));
}

export default function MatchResultPanel({ match, currentUserEmail, allUsers = [], recentFormEntry }) {
  const userMap = Object.fromEntries(allUsers.map(u => [u.email, u]));
  const getName = (email) => userMap[email]?.name || userMap[email]?.full_name || email?.split("@")[0] || "?";
  const getFirstName = (email) => getName(email).split(" ")[0];

  const isDoubles = match.match_type !== "singles";
  const myTeam = match.team_a?.includes(currentUserEmail) ? "team_a"
    : match.team_b?.includes(currentUserEmail) ? "team_b" : null;

  let result = "played";
  if (match.winner_team && myTeam) result = match.winner_team === myTeam ? "win" : "loss";
  else if (match.winner_email) result = match.winner_email === currentUserEmail ? "win" : (match.players?.includes(currentUserEmail) ? "loss" : "played");

  const scoreA = match.score_team_a || match.submitted_score_a;
  const scoreB = match.score_team_b || match.submitted_score_b;
  const sets = parseSetScores(scoreA, scoreB);

  const eloChange = recentFormEntry?.elo_change ?? null;
  const eloAfter = recentFormEntry?.elo_after ?? null;
  const eloBefore = eloAfter !== null && eloChange !== null ? eloAfter - eloChange : null;

  // Teams
  const teamAEmails = isDoubles ? (match.team_a || []) : [match.players?.[0]].filter(Boolean);
  const teamBEmails = isDoubles ? (match.team_b || []) : [match.players?.[1]].filter(Boolean);
  const teamAName = teamAEmails.map(getFirstName).join(" & ") || "Team A";
  const teamBName = teamBEmails.map(getFirstName).join(" & ") || "Team B";

  const teamAWon = match.winner_team === "team_a" || (!isDoubles && match.winner_email === teamAEmails[0]);
  const teamBWon = match.winner_team === "team_b" || (!isDoubles && match.winner_email === teamBEmails[0]);

  const resultConfig = {
    win:    { label: "WIN",       banner: "bg-green-500",  badge: "bg-green-100 text-green-700 border-green-200" },
    loss:   { label: "LOSS",      banner: "bg-red-500",    badge: "bg-red-100 text-red-700 border-red-200" },
    played: { label: "COMPLETED", banner: "bg-slate-400",  badge: "bg-secondary text-secondary-foreground border-border" },
  };
  const cfg = resultConfig[result];

  const eloIsPos = eloChange > 0;
  const eloIsNeg = eloChange < 0;

  return (
    <div className="rounded-2xl overflow-hidden border border-border shadow-md">

      {/* ── RESULT BANNER ── */}
      <div className={`${cfg.banner} px-5 py-3 flex items-center justify-between`}>
        <span className="font-heading font-black text-white text-xl tracking-wide">{cfg.label}</span>
        {eloChange !== null && (
          <span className={`font-heading font-bold text-white text-sm`}>
            {eloIsPos ? "+" : eloIsNeg ? "" : "±"}{eloChange} ELO
          </span>
        )}
      </div>

      {/* ── SCOREBOARD BODY ── */}
      <div className="bg-card px-5 pt-5 pb-4 space-y-4">

        {/* Teams + Sets — hero section */}
        {sets.length > 0 ? (
          <div className="flex items-start justify-between gap-3">

            {/* Team A */}
            <div className={`flex-1 text-left ${teamAWon ? "opacity-100" : teamBWon ? "opacity-50" : "opacity-100"}`}>
              <p className={`font-heading font-bold text-base leading-tight ${teamAWon ? "text-green-600" : "text-foreground"}`}>
                {teamAName}
              </p>
              {teamAWon && <span className="text-[10px] font-bold text-green-600 uppercase tracking-wide">Winner</span>}
            </div>

            {/* Sets — centred hero */}
            <div className="flex flex-col items-center gap-1 px-2">
              {sets.map((set, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className={`font-heading font-black text-3xl leading-none w-8 text-right ${teamAWon ? "text-green-600" : "text-foreground"}`}>
                    {set.a}
                  </span>
                  <span className="font-heading font-bold text-lg text-muted-foreground/60 w-4 text-center">—</span>
                  <span className={`font-heading font-black text-3xl leading-none w-8 text-left ${teamBWon ? "text-green-600" : "text-foreground"}`}>
                    {set.b}
                  </span>
                </div>
              ))}
              {sets.length > 1 && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  {sets.length} {sets.length === 1 ? "set" : "sets"}
                </p>
              )}
            </div>

            {/* Team B */}
            <div className={`flex-1 text-right ${teamBWon ? "opacity-100" : teamAWon ? "opacity-50" : "opacity-100"}`}>
              <p className={`font-heading font-bold text-base leading-tight ${teamBWon ? "text-green-600" : "text-foreground"}`}>
                {teamBName}
              </p>
              {teamBWon && <span className="text-[10px] font-bold text-green-600 uppercase tracking-wide block">Winner</span>}
            </div>
          </div>
        ) : (
          /* No score submitted */
          <div className="text-center py-2">
            <div className="flex items-center justify-between">
              <p className={`font-heading font-bold text-base ${teamAWon ? "text-green-600" : "text-muted-foreground"}`}>{teamAName}</p>
              <span className="text-muted-foreground text-sm">vs</span>
              <p className={`font-heading font-bold text-base ${teamBWon ? "text-green-600" : "text-muted-foreground"}`}>{teamBName}</p>
            </div>
            <p className="text-xs text-muted-foreground mt-2 italic">Score not recorded</p>
          </div>
        )}

        {/* ── ELO ROW (secondary) ── */}
        {eloChange !== null && eloBefore !== null && eloAfter !== null && (
          <div className="flex items-center justify-center gap-2 pt-1 pb-1">
            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border ${
              eloIsPos ? "bg-green-50 border-green-200 text-green-700"
              : eloIsNeg ? "bg-red-50 border-red-200 text-red-600"
              : "bg-secondary border-border text-muted-foreground"
            }`}>
              {eloIsPos ? <TrendingUp className="w-3.5 h-3.5" /> : eloIsNeg ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
              {eloIsPos ? "+" : ""}{eloChange} ELO
              <span className="text-xs opacity-70 font-normal">
                ({Math.round(eloBefore)} → {Math.round(eloAfter)})
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}