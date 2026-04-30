import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useHistoryData } from "@/hooks/useHistoryData";
import HistoryItemCard from "@/components/history/HistoryItemCard";

const FILTERS = [
  { id: "all",          label: "All" },
  { id: "matches",      label: "🎾 Matches" },
  { id: "competitions", label: "🏆 Competitions" },
  { id: "wins",         label: "✅ Wins" },
  { id: "losses",       label: "❌ Losses" },
  { id: "unrated",      label: "⭐ Rate" },
];

export default function PastEvents() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => { base44.auth.me().then(setCurrentUser); }, []);

  const myEmail = currentUser?.email;
  const { allHistory, myRatings, allUsers, isLoading } = useHistoryData(myEmail);

  // Summary stats (last 10 items)
  const last10 = allHistory.slice(0, 10);
  const wins = last10.filter(i => i.result === "win").length;
  const losses = last10.filter(i => i.result === "loss").length;
  const eloSum = last10.reduce((acc, i) => acc + (i.eloChange || 0), 0);

  const needsRatingCount = useMemo(() => allHistory.filter(item => {
    if (item._type !== "match") return false;
    const others = item.players.filter(e => e !== myEmail);
    return others.length > 0 && !others.every(e => myRatings.some(r => r.match_id === item.id && r.rated_email === e));
  }).length, [allHistory, myRatings, myEmail]);

  const filteredHistory = useMemo(() => {
    return allHistory.filter(item => {
      if (filter === "matches") return item._type === "match";
      if (filter === "competitions") return item._type === "competition";
      if (filter === "wins") return item.result === "win";
      if (filter === "losses") return item.result === "loss";
      if (filter === "unrated") {
        if (item._type !== "match") return false;
        const others = item.players.filter(e => e !== myEmail);
        const rated = others.filter(e => myRatings.some(r => r.match_id === item.id && r.rated_email === e));
        return others.length > 0 && rated.length < others.length;
      }
      return true;
    });
  }, [allHistory, filter, myRatings, myEmail]);

  return (
    <div className="max-w-lg mx-auto min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="px-4 pt-5 pb-3">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="font-heading font-bold text-xl leading-tight">Past Events</h1>
              <p className="text-xs text-muted-foreground">Matches, tournaments &amp; leagues</p>
            </div>
          </div>

          {/* Summary strip */}
          {last10.length > 0 && (
            <div className="flex items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3 mb-3">
              <div className="flex-1 text-center">
                <p className="font-heading font-bold text-lg text-green-600">{wins}</p>
                <p className="text-[10px] text-muted-foreground">Wins</p>
              </div>
              <div className="w-px h-8 bg-border" />
              <div className="flex-1 text-center">
                <p className="font-heading font-bold text-lg text-red-500">{losses}</p>
                <p className="text-[10px] text-muted-foreground">Losses</p>
              </div>
              <div className="w-px h-8 bg-border" />
              <div className="flex-1 text-center">
                <p className={`font-heading font-bold text-lg flex items-center justify-center gap-0.5 ${eloSum > 0 ? "text-green-600" : eloSum < 0 ? "text-red-500" : "text-foreground"}`}>
                  {eloSum > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : eloSum < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : null}
                  {eloSum > 0 ? `+${eloSum}` : eloSum}
                </p>
                <p className="text-[10px] text-muted-foreground">ELO (last 10)</p>
              </div>
              <div className="w-px h-8 bg-border" />
              <div className="flex-1 text-center">
                <p className="font-heading font-bold text-lg">{last10.length}</p>
                <p className="text-[10px] text-muted-foreground">Events</p>
              </div>
            </div>
          )}

          {/* Filter chips */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  filter === f.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
                }`}
              >
                {f.label}
                {f.id === "unrated" && needsRatingCount > 0 && (
                  <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-bold leading-none ${filter === "unrated" ? "bg-white/30 text-white" : "bg-accent/20 text-accent"}`}>
                    {needsRatingCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4 pb-10 space-y-3">
        {isLoading ? (
          [1, 2, 3].map(i => (
            <div key={i} className="h-36 rounded-2xl bg-card border border-border animate-pulse" />
          ))
        ) : filteredHistory.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="text-5xl mb-4">🎾</div>
            <p className="font-heading font-bold text-lg mb-1">
              {filter === "all" ? "No events yet" : `No ${filter} found`}
            </p>
            <p className="text-muted-foreground text-sm mb-6">
              {filter === "all"
                ? "Play your first match to start tracking your history"
                : "Try a different filter"}
            </p>
            {filter === "all" && (
              <Button onClick={() => navigate("/find-match")} className="rounded-xl gap-2">
                Find a Game →
              </Button>
            )}
          </motion.div>
        ) : (
          <AnimatePresence>
            {filteredHistory.map((item, idx) => (
              <motion.div
                key={`${item._type}-${item.id}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
              >
                <HistoryItemCard
                  item={item}
                  currentUser={currentUser}
                  allUsers={allUsers}
                  myRatings={myRatings}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}