import { Trophy, TrendingUp } from "lucide-react";
import PlayerAvatar from "./PlayerAvatar";
import { calculateGroupStandings } from "../utils/standingsCalculator";

const RANK_STYLES = [
  { bg: "bg-amber-50 border-l-2 border-l-amber-400", rank: <Trophy className="w-4 h-4 text-amber-500" /> },
  { bg: "bg-slate-50 border-l-2 border-l-slate-400", rank: <span className="font-heading font-bold text-slate-500 text-sm">2</span> },
  { bg: "bg-orange-50 border-l-2 border-l-orange-400", rank: <span className="font-heading font-bold text-orange-500 text-sm">3</span> },
];

export default function StandingsTable({ entries, matches, competition }) {
  const pointsRules = {
    points_win: competition?.points_win || 3,
    points_loss: competition?.points_loss || 0,
    points_draw: competition?.points_draw || 1,
  };
  const teamStructure = competition?.team_structure || "singles";

  // Filter for confirmed matches only
  const confirmedMatches = matches.filter((m) => m.status === "confirmed");

  // Calculate standings using the utility
  const standings = calculateGroupStandings(entries, confirmedMatches, pointsRules, teamStructure);

  if (standings.length === 0) {
    return (
      <div className="text-center py-10">
        <TrendingUp className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-muted-foreground text-sm">Standings will appear as matches are confirmed</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Points Rules Display */}
      {competition && (
        <div className="p-3 bg-muted/50 rounded-lg border border-border text-xs space-y-1">
          <p className="font-medium text-foreground">Scoring Rules</p>
          <div className="flex justify-between text-muted-foreground">
            <span>Win = {pointsRules.points_win} pts</span>
            <span>Loss = {pointsRules.points_loss} pts</span>
            <span>Draw = {pointsRules.points_draw} pts</span>
          </div>
        </div>
      )}

      {/* Standings Table */}
      <div className="space-y-2">
        {/* Header */}
        <div className="grid grid-cols-[auto_1fr_repeat(7,_auto)] gap-x-2 px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          <span>#</span>
          <span>Player</span>
          <span className="text-center w-6">MP</span>
          <span className="text-center w-6">W</span>
          <span className="text-center w-6">L</span>
          <span className="text-center w-7">SW</span>
          <span className="text-center w-7">SL</span>
          <span className="text-center w-7">SD</span>
          <span className="text-center w-8 font-bold">Pts</span>
        </div>

        {/* Rows */}
        {standings.map((stat, i) => {
          const style = RANK_STYLES[i] || { bg: "bg-card", rank: <span className="text-muted-foreground text-xs w-4 text-center">{i + 1}</span> };
          const setDiff = stat.sets_won - stat.sets_lost;
          return (
            <div
              key={stat.entry_id}
              className={`grid grid-cols-[auto_1fr_repeat(7,_auto)] gap-x-2 items-center px-3 py-2.5 rounded-xl border border-border ${style.bg} transition-colors`}
            >
              <div className="w-5 flex items-center justify-center">{style.rank}</div>
              <div className="flex items-center gap-2 min-w-0">
                <PlayerAvatar name={stat.player_name} size="sm" />
                <span className={`font-medium text-sm truncate ${i === 0 ? "text-primary" : "text-foreground"}`}>{stat.player_name}</span>
              </div>
              <span className="text-center text-xs text-muted-foreground w-6">{stat.matches_played}</span>
              <span className="text-center text-xs font-semibold text-green-600 w-6">{stat.wins}</span>
              <span className="text-center text-xs font-semibold text-destructive w-6">{stat.losses}</span>
              <span className="text-center text-xs text-muted-foreground w-7">{stat.sets_won}</span>
              <span className="text-center text-xs text-muted-foreground w-7">{stat.sets_lost}</span>
              <span className={`text-center text-xs font-medium w-7 ${setDiff > 0 ? "text-green-600" : setDiff < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                {setDiff > 0 ? `+${setDiff}` : setDiff}
              </span>
              <span className="text-center font-heading font-bold text-sm w-8 text-foreground">{stat.points}</span>
            </div>
          );
        })}

        <p className="text-[10px] text-muted-foreground text-center pt-2">
          MP=Matches Played · W=Wins · L=Losses · SW=Sets Won · SL=Sets Lost · SD=Set Difference
        </p>
      </div>
    </div>
  );
}