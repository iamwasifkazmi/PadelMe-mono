/**
 * RecentResultsStrip — compact recent match results for the Home screen.
 * Powered by PlayerRecentForm. Navigates to Past Events for full history.
 */
import { useNavigate } from "react-router-dom";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

function ResultDot({ result, eloChange, title, date }) {
  const isWin = result === "W";
  const isLoss = result === "L";
  return (
    <div className="flex flex-col items-center gap-1 flex-shrink-0 w-14">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
        isWin ? "bg-green-100 text-green-700" : isLoss ? "bg-red-100 text-red-600" : "bg-secondary text-secondary-foreground"
      }`}>
        {result}
      </div>
      {eloChange !== null && eloChange !== undefined && (
        <span className={`text-[10px] font-bold ${eloChange > 0 ? "text-green-600" : eloChange < 0 ? "text-red-500" : "text-muted-foreground"}`}>
          {eloChange > 0 ? `+${eloChange}` : eloChange === 0 ? "±0" : eloChange}
        </span>
      )}
      <p className="text-[9px] text-muted-foreground text-center leading-tight truncate w-full text-center">{date}</p>
    </div>
  );
}

export default function RecentResultsStrip({ recentForm = [], currentUserEmail }) {
  const navigate = useNavigate();

  const recent = [...recentForm]
    .sort((a, b) => new Date(b.match_date) - new Date(a.match_date))
    .slice(0, 5);

  if (recent.length === 0) return null;

  const wins = recent.filter(r => r.result === "W").length;
  const eloSum = recent.reduce((acc, r) => acc + (r.elo_change || 0), 0);

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-heading font-semibold text-sm">Recent Results</p>
          <p className="text-[11px] text-muted-foreground">
            {wins}W {recent.length - wins}L · ELO {eloSum >= 0 ? `+${eloSum}` : eloSum}
          </p>
        </div>
        <button
          onClick={() => navigate("/past-events")}
          className="text-xs text-primary font-semibold"
        >
          All History →
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {recent.map((r, i) => {
          const dateStr = r.match_date ? new Date(r.match_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
          return (
            <ResultDot
              key={r.match_id || i}
              result={r.result}
              eloChange={r.elo_change}
              title={r.match_title}
              date={dateStr}
            />
          );
        })}
      </div>
    </div>
  );
}