import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Trophy, Plus, Crown, BarChart2, Search, Zap, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import CompetitionCard from "../components/CompetitionCard";
import SubscriptionGate from "../components/SubscriptionGate";
import { motion } from "framer-motion";

export default function Competitions() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [showGate, setShowGate] = useState(false);
  const [activeTab, setActiveTab] = useState("tournaments");

  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  const { data: competitions = [], isLoading, refetch } = useQuery({
    queryKey: ["competitions"],
    queryFn: () => base44.entities.Competition.list("-created_date", 50),
  });

  const { data: recentMatches = [] } = useQuery({
    queryKey: ["recent-matches-compete"],
    queryFn: () => base44.entities.Match.filter({ status: "open" }, "-created_date", 4),
  });

  // Filter by visibility: show public, or invite_only if user is invited/host
  const visibleCompetitions = competitions.filter((c) => {
    if (!c.visibility || c.visibility === "public") return true;
    if (!user) return false;
    return (
      c.host_email === user.email ||
      c.participants?.includes(user.email) ||
      c.invited_emails?.includes(user.email)
    );
  });

  const tournaments = visibleCompetitions.filter((c) => c.type === "tournament");
  const leagues = visibleCompetitions.filter((c) => c.type === "league");
  const listed = activeTab === "tournaments" ? tournaments : leagues;

  const handleCreate = () => {
    if (!user?.is_subscribed) {
      setShowGate(true);
    } else {
      navigate("/create-competition");
    }
  };

  if (showGate) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="px-5 pt-6 pb-2 flex items-center gap-3">
          <button onClick={() => setShowGate(false)} className="text-muted-foreground text-sm">← Back</button>
        </div>
        <SubscriptionGate onSubscribed={() => { setShowGate(false); refetch(); navigate("/create-competition"); }} />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto pb-10">

      {/* ── HERO ── */}
      <div className="px-5 pt-6 pb-5">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-accent via-accent/80 to-primary p-5 shadow-xl shadow-accent/30"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
          <div className="absolute bottom-0 left-0 w-20 h-20 bg-white/5 rounded-full translate-y-8 -translate-x-4" />
          <div className="relative">
            <p className="text-white/80 text-sm font-medium mb-0.5">Ready to compete?</p>
            <h2 className="font-heading font-bold text-2xl text-white mb-1">Compete & Win 🏆</h2>
            <p className="text-white/70 text-sm mb-4">Join tournaments or create your own</p>
            <div className="flex gap-2">
              <Button
                onClick={handleCreate}
                className="flex-1 h-11 rounded-2xl font-heading font-bold text-sm bg-white text-accent hover:bg-white/90 shadow-lg gap-1.5"
              >
                <Plus className="w-4 h-4" /> Host Tournament
              </Button>
              <Button
                onClick={() => navigate("/find-match")}
                variant="ghost"
                className="h-11 rounded-2xl font-heading font-bold text-sm text-white hover:bg-white/10 gap-1.5"
              >
                <Search className="w-4 h-4" /> Browse
              </Button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── PREMIUM BADGE ── */}
      {user?.is_subscribed && (
        <div className="px-5 mb-4">
          <div className="rounded-2xl bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400 flex items-center justify-center flex-shrink-0">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-heading font-bold text-sm text-amber-800">👑 Premium Active</p>
              <p className="text-xs text-amber-600 mt-0.5">Unlimited tournaments · Earn from entry fees</p>
            </div>
            <span className="text-xs font-bold text-amber-500 bg-amber-100 px-2 py-1 rounded-full">FLEX</span>
          </div>
        </div>
      )}

      {/* ── QUICK ACTIONS ── */}
      <div className="px-5 mb-5">
        <div className="grid grid-cols-3 gap-3">
          <QuickTile icon="➕" label="Host" sub="Tournament" onClick={handleCreate} accent />
          <QuickTile icon="🔍" label="Find" sub="Tournaments" onClick={() => setActiveTab("tournaments")} />
          <QuickTile icon="📊" label="View" sub="Leagues" onClick={() => setActiveTab("leagues")} />
        </div>
      </div>

      {/* ── TABS ── */}
      <div className="px-5 mb-4">
        <div className="flex gap-1 bg-secondary rounded-2xl p-1">
          {[
            { key: "tournaments", label: "Tournaments", icon: Trophy },
            { key: "leagues", label: "Leagues", icon: BarChart2 },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === key
                  ? "bg-card shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {(key === "tournaments" ? tournaments : leagues).length > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  activeTab === key ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
                }`}>
                  {(key === "tournaments" ? tournaments : leagues).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── COMPETITION LIST ── */}
      <div className="px-5 space-y-3">
        {isLoading ? (
          [1, 2].map((i) => <div key={i} className="h-36 bg-card rounded-2xl animate-pulse" />)
        ) : listed.length > 0 ? (
          listed.map((c, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <CompetitionCard competition={c} />
            </motion.div>
          ))
        ) : (
          <EnhancedEmpty type={activeTab} onHost={handleCreate} />
        )}
      </div>

      {/* ── NEARBY ACTIVITY (when no competitions) ── */}
      {!isLoading && listed.length === 0 && recentMatches.length > 0 && (
        <div className="px-5 mt-6">
          <p className="font-heading font-semibold text-sm mb-3">🔥 Active Matches Nearby</p>
          <div className="space-y-2">
            {recentMatches.map((m) => (
              <button
                key={m.id}
                onClick={() => navigate(`/match/${m.id}`)}
                className="w-full flex items-center gap-3 p-3 bg-card rounded-2xl border border-border hover:border-primary/30 transition-all text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{m.title}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3" />{m.location_name || "Nearby"} · <Users className="w-3 h-3" />{m.players?.length || 0}/{m.max_players}
                  </p>
                </div>
                <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full">Open</span>
              </button>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

function QuickTile({ icon, label, sub, onClick, accent }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl p-3.5 text-center transition-all active:scale-95 shadow-sm ${
        accent ? "bg-primary text-primary-foreground shadow-primary/25" : "bg-card border border-border text-foreground"
      }`}
    >
      <div className="text-2xl mb-1">{icon}</div>
      <p className="font-heading font-bold text-xs">{label}</p>
      <p className={`text-[10px] ${accent ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{sub}</p>
    </button>
  );
}

function EnhancedEmpty({ type, onHost }) {
  const isTournament = type === "tournaments";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border-2 border-dashed border-border bg-card p-8 text-center"
    >
      <div className="text-5xl mb-3">{isTournament ? "🏆" : "📊"}</div>
      <h3 className="font-heading font-bold text-lg mb-1">No games yet…</h3>
      <p className="text-muted-foreground text-sm mb-5">
        Be the first to run a {isTournament ? "tournament" : "league"} in your area
      </p>
      <div className="flex flex-col gap-2 items-center">
        <Button onClick={onHost} className="rounded-2xl w-full max-w-xs font-heading font-semibold gap-2">
          🎾 {isTournament ? "Host Tournament" : "Create League"}
        </Button>
        <Button variant="outline" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="rounded-2xl w-full max-w-xs font-heading text-sm gap-2">
          🔍 Explore Nearby Areas
        </Button>
      </div>
    </motion.div>
  );
}