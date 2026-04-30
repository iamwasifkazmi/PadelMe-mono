import { useNavigate } from "react-router-dom";
import { TrendingUp, TrendingDown, Minus, ChevronRight } from "lucide-react";
import { getELOTier } from "@/lib/elo";

function ELOBadge({ change }) {
  if (change === null || change === undefined) return null;
  const isPos = change > 0;
  const isNeg = change < 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full ${
      isPos ? "bg-green-100 text-green-700" : isNeg ? "bg-red-100 text-red-600" : "bg-secondary text-secondary-foreground"
    }`}>
      {isPos ? <TrendingUp className="w-3 h-3" /> : isNeg ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
      {isPos ? `+${change}` : isNeg ? change : "±0"}
    </span>
  );
}

const TYPE_ICON = { "Singles Match": "🎾", "Doubles Match": "🎾", "Tournament": "🏆", "League": "📊", "Competition": "🏅" };
const RESULT_COLOR = { W: "bg-green-100 text-green-700", L: "bg-red-100 text-red-600" };

export default function PerformanceTab({ playerStats, recentForm, allHistory = [] }) {
  const navigate = useNavigate();

  const elo = playerStats?.elo_rating || 1000;
  const eloPeak = playerStats?.elo_peak || elo;
  const tier = getELOTier(elo);
  const tierProgress = Math.min(100, ((elo - tier.min) / (tier.max === Infinity ? 400 : tier.max - tier.min)) * 100);

  const totalPlayed = playerStats?.matches_played || 0;
  const totalWins = playerStats?.matches_won || 0;
  const totalLosses = playerStats?.matches_lost || 0;
  const winRate = totalPlayed > 0 ? Math.round((totalWins / totalPlayed) * 100) : 0;
  const streak = playerStats?.current_win_streak || 0;
  const bestStreak = playerStats?.best_win_streak || 0;

  // Recent form from PlayerRecentForm (matches only, for dots)
  const sortedForm = [...recentForm].sort((a, b) => new Date(b.match_date) - new Date(a.match_date));
  const recentFormDots = sortedForm.slice(0, 5).map(r => r.result);

  // Unified history sorted newest-first (passed from parent or from recentForm fallback)
  const history = allHistory.length > 0 ? allHistory : sortedForm.map(r => ({
    id: r.match_id,
    _type: "match",
    name: r.match_title,
    eventType: r.match_format === "singles" ? "Singles Match" : "Doubles Match",
    date: r.match_date,
    result: r.result === "W" ? "win" : r.result === "L" ? "loss" : "played",
    eloChange: r.elo_change,
    eloAfter: r.elo_after,
    scoreA: null, scoreB: null,
    detailUrl: r.match_id ? `/match/${r.match_id}` : null,
    _raw: { score_summary: r.score_summary },
  }));

  return (
    <div className="space-y-4 pb-6">

      {/* ── ELO SUMMARY ── */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <p className="font-heading font-semibold text-sm mb-3">⚡ Skill Rating (ELO)</p>
        <div className="flex items-center justify-between mb-2">
          <div>
            <span className="font-heading font-bold text-3xl">{Math.round(elo)}</span>
            <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${tier.color}20`, color: tier.color }}>
              {tier.icon} {tier.label}
            </span>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">Peak</p>
            <p className="font-bold text-sm">{Math.round(eloPeak)}</p>
          </div>
        </div>
        <div className="w-full h-3 bg-secondary rounded-full overflow-hidden mb-1">
          <div className="h-3 rounded-full transition-all duration-700" style={{ width: `${tierProgress}%`, backgroundColor: tier.color }} />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{tier.min}</span>
          <span>{tier.max === Infinity ? tier.min + 400 + "+" : tier.max}</span>
        </div>
      </div>

      {/* ── STATS GRID ── */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Matches" value={totalPlayed} icon="🎾" />
        <StatCard label="Win Rate" value={`${winRate}%`} icon="📈" accent />
        <StatCard label="Wins" value={totalWins} icon="🏆" />
        <StatCard label="Losses" value={totalLosses} icon="❌" />
      </div>

      {/* Streak + recent form */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Recent Form</p>
            <div className="flex items-center gap-1.5">
              {recentFormDots.length > 0 ? recentFormDots.map((r, i) => (
                <span key={i} className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  r === "W" ? "bg-green-100 text-green-700" : r === "L" ? "bg-red-100 text-red-600" : "bg-secondary text-secondary-foreground"
                }`}>{r}</span>
              )) : <span className="text-muted-foreground text-xs">No matches yet</span>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Win Streak</p>
            <p className="font-heading font-bold text-xl">{streak} <span className="text-xs text-muted-foreground font-normal">/ best {bestStreak}</span></p>
          </div>
        </div>
      </div>

      {/* ── UNIFIED HISTORY ── */}
      {history.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="font-heading font-semibold text-sm mb-3">🎯 Activity History</p>
          <div className="space-y-1">
            {history.slice(0, 20).map((item, i) => {
              const isRecentFormEntry = !item._type;
              const detailUrl = item.detailUrl || (item.match_id ? `/match/${item.match_id}` : null);
              const isClickable = !!detailUrl;
              const resultChar = item.result === "win" ? "W" : item.result === "loss" ? "L" : "D";
              const scoreSummary = item._raw?.score_summary || null;
              const eloBefore = item.eloAfter !== null && item.eloAfter !== undefined && item.eloChange !== null
                ? item.eloAfter - item.eloChange : null;
              const typeIcon = TYPE_ICON[item.eventType] || "📌";

              return (
                <button
                  key={`${item._type || "entry"}-${item.id || i}`}
                  onClick={() => isClickable && navigate(detailUrl)}
                  disabled={!isClickable}
                  className={`w-full flex items-center justify-between py-2.5 px-2 border-b border-border/50 last:border-0 gap-3 rounded-xl transition-colors text-left ${
                    isClickable ? "hover:bg-secondary/60 active:bg-secondary cursor-pointer" : "cursor-default"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-6 h-6 flex-shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      RESULT_COLOR[resultChar] || "bg-secondary text-secondary-foreground"
                    }`}>
                      {resultChar}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-[10px]">{typeIcon}</span>
                        <p className="text-xs font-medium truncate">{item.name || item.match_title}</p>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {item.date || item.match_date}
                        {scoreSummary ? ` · ${scoreSummary}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {eloBefore !== null && (
                      <span className="text-[11px] text-muted-foreground">{Math.round(eloBefore)} →</span>
                    )}
                    {item.eloAfter !== null && item.eloAfter !== undefined && (
                      <span className="font-bold text-xs">{Math.round(item.eloAfter)}</span>
                    )}
                    <ELOBadge change={item.eloChange} />
                    {isClickable && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground ml-0.5" />}
                  </div>
                </button>
              );
            })}
          </div>

          {history.length > 20 && (
            <button onClick={() => navigate("/past-events")} className="w-full mt-3 text-xs text-primary font-semibold text-center py-2">
              View all {history.length} events →
            </button>
          )}
        </div>
      )}

      {history.length === 0 && (
        <div className="bg-card rounded-2xl border border-dashed border-border p-8 text-center">
          <div className="text-3xl mb-2">🎾</div>
          <p className="font-heading font-semibold text-sm mb-1">No activity yet</p>
          <p className="text-xs text-muted-foreground">Play your first match to start tracking your ELO and performance</p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, accent }) {
  return (
    <div className={`rounded-2xl p-4 border ${accent ? "bg-primary/8 border-primary/20" : "bg-card border-border"}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span>{icon}</span>
        <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
      </div>
      <p className={`font-heading font-bold text-2xl ${accent ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}