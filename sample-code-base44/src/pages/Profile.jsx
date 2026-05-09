import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  MapPin, Star, Edit3, LogOut, ShieldCheck, CheckCircle,
  Zap, Trophy, ChevronRight, UserPlus
} from "lucide-react";
import StatusFeed from "../components/StatusFeed";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PlayerAvatar from "../components/PlayerAvatar";
import SkillBadge from "../components/SkillBadge";
import FriendButton from "../components/FriendButton";
import PerformanceTab from "../components/profile/PerformanceTab";
import { useHistoryData } from "@/hooks/useHistoryData";
import HistoryItemCard from "@/components/history/HistoryItemCard";
import { motion } from "framer-motion";

const TAG_EMOJI = {
  "Competitive": "🎯",
  "Casual": "😎",
  "Beginner-friendly": "🌱",
  "Social": "🤝",
  "Training partner": "💪",
};

const ACHIEVEMENTS = [
  { key: "matches_10", icon: "🔥", label: "10 Matches", desc: "Played 10 matches", check: (u, elo, stats) => (stats?.matches_played || u.total_matches || 0) >= 10 },
  { key: "wins_5", icon: "🏆", label: "5 Wins", desc: "Won 5 matches", check: (u, elo, stats) => (stats?.matches_won || u.total_wins || 0) >= 5 },
  { key: "top_rated", icon: "⭐", label: "Top Rated", desc: "4.5+ rating", check: (u) => (u.average_rating || 0) >= 4.5 },
  { key: "verified", icon: "🛡️", label: "Verified", desc: "Identity verified", check: (u) => u.id_verified },
  { key: "high_elo", icon: "📈", label: "Rising Star", desc: "Reach 1100+ Elo rating", check: (u, elo) => (elo || 0) >= 1100 },
];

function getStatusLine(user) {
  if (!user?.availability_days?.length) return null;
  const days = user.availability_days;
  const today = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getDay()];
  if (days.includes(today)) return "🟢 Available to play today";
  return "🎾 Looking for games";
}

export default function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => { base44.auth.me().then(setUser); }, []);

  const { data: allUsers = [] } = useQuery({
    queryKey: ["all-users"],
    queryFn: () => base44.entities.User.list(),
    enabled: !!user,
  });

  const { data: myMatches = [] } = useQuery({
    queryKey: ["my-matches", user?.email],
    queryFn: () => base44.entities.Match.list("-created_date", 100),
    enabled: !!user?.email,
  });

  const { data: playerStats } = useQuery({
    queryKey: ["player-stats-profile", user?.email],
    queryFn: () => base44.entities.PlayerStats.filter({ user_email: user.email }, "-created_date", 1).then(r => r[0]),
    enabled: !!user?.email,
  });

  const { allHistory, recentForm, myRatings: historyRatings, allUsers: historyUsers } = useHistoryData(user?.email);

  const { data: friendRequests = [] } = useQuery({
    queryKey: ["friend-requests"],
    queryFn: () => base44.entities.FriendRequest.list("-created_date", 200),
    enabled: !!user,
  });

  if (!user) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const completedMatches = myMatches.filter((m) => m.players?.includes(user.email) && m.status === "completed");
  const upcomingMatches = myMatches.filter((m) => m.players?.includes(user.email) && (m.status === "open" || m.status === "full"));

  // Use PlayerStats as single source of truth for ELO + stats
  const totalPlayed = playerStats?.matches_played || completedMatches.length || 0;
  const totalWins = playerStats?.matches_won || 0;
  const totalLosses = playerStats?.matches_lost || 0;
  const winRate = totalPlayed > 0 ? Math.round((totalWins / totalPlayed) * 100) : 0;
  const eloRating = playerStats?.elo_rating || 1000;

  // Recent form dots: last 5 (from PlayerRecentForm, matches only)
  const sortedForm = [...recentForm].sort((a, b) => new Date(b.match_date) - new Date(a.match_date));
  const recentFormDots = sortedForm.slice(0, 5).map(r => r.result).filter(Boolean).reverse();

  // Friends
  const friendEmails = new Set(
    friendRequests
      .filter((r) => r.status === "accepted" && (r.requester_email === user.email || r.recipient_email === user.email))
      .map((r) => r.requester_email === user.email ? r.recipient_email : r.requester_email)
  );
  const friends = allUsers.filter((u) => friendEmails.has(u.email)).slice(0, 6);

  // Played with (from completed matches)
  const playedWithEmails = new Set(
    completedMatches.flatMap((m) => m.players || []).filter((e) => e !== user.email)
  );
  const playedWith = allUsers.filter((u) => playedWithEmails.has(u.email)).slice(0, 5);

  const statusLine = getStatusLine(user);
  const earnedAchievements = ACHIEVEMENTS.filter((a) => a.check(user, eloRating, playerStats));
  const lockedAchievements = ACHIEVEMENTS.filter((a) => !a.check(user, eloRating, playerStats)).slice(0, 3);

  return (
    <div className="max-w-lg mx-auto pb-10">
      {/* Top bar */}
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <h1 className="font-heading font-bold text-xl">My Profile</h1>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => navigate("/edit-profile")}>
            <Edit3 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="rounded-xl text-muted-foreground" onClick={() => base44.auth.logout()}>
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="px-5 space-y-4">

        {/* ── HERO CARD ── */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/15 via-card to-accent/10 border border-border shadow-lg shadow-black/5 p-5">
          <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full -translate-y-16 translate-x-16" />
          <div className="flex items-start gap-4 relative">
            <div className="relative flex-shrink-0">
              {user.photo_url ? (
                <img src={user.photo_url} alt={user.full_name} className="w-20 h-20 rounded-2xl object-cover shadow-md" />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center shadow-md">
                  <span className="font-heading font-bold text-2xl text-primary">
                    {(user.name || user.full_name)?.charAt(0) || "?"}
                  </span>
                </div>
              )}
              {user.id_verified && (
                <span className="absolute -bottom-1 -right-1 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center shadow">
                  <ShieldCheck className="w-3.5 h-3.5 text-white" />
                </span>
              )}
              {user.photo_verified && !user.id_verified && (
                <span className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shadow">
                  <CheckCircle className="w-3.5 h-3.5 text-white" />
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="font-heading font-bold text-xl leading-tight">{user.name || user.full_name}</h2>
              {user.location && (
                <p className="text-muted-foreground text-xs flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3" /> {user.location}
                </p>
              )}
              {statusLine && (
                <p className="text-xs font-medium mt-1.5 text-foreground/80">{statusLine}</p>
              )}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {user.skill_label && <SkillBadge level={user.skill_label} />}
                {user.average_rating > 0 && (
                  <span className="flex items-center gap-0.5 bg-accent/10 text-accent text-xs px-2 py-0.5 rounded-full font-semibold">
                    <Star className="w-3 h-3 fill-accent" /> {user.average_rating.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {user.bio && (
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{user.bio}</p>
          )}

          {user.tags?.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {user.tags.map((tag) => (
                <span key={tag} className="flex items-center gap-1 px-3 py-1.5 bg-primary/8 text-primary rounded-full text-xs font-semibold border border-primary/15">
                  {TAG_EMOJI[tag] || "🎾"} {tag}
                </span>
              ))}
            </div>
          )}

          {/* Primary CTAs */}
          <div className="flex gap-2 mt-4">
            <Button className="flex-1 h-10 rounded-2xl font-heading font-semibold text-sm gap-1.5"
              onClick={() => navigate("/instant-play")}>
              <Zap className="w-4 h-4" /> Play Now
            </Button>
            <Button variant="outline" className="flex-1 h-10 rounded-2xl font-heading font-semibold text-sm"
              onClick={() => navigate("/invite")}>
              Invite to Match
            </Button>
          </div>
        </div>

        {/* ── TABS ── */}
        <div className="flex gap-1 bg-secondary rounded-2xl p-1">
          {[{ id: "overview", label: "Overview" }, { id: "performance", label: "📊 Performance" }].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === t.id ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── PERFORMANCE TAB ── */}
        {activeTab === "performance" && (
          <PerformanceTab playerStats={playerStats} recentForm={recentForm} allHistory={allHistory} />
        )}

        {/* ── OVERVIEW TAB ── */}
        {activeTab === "overview" && <>

        {/* ── STATS ── */}
        <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="font-heading font-semibold text-sm">Performance</p>
            {recentFormDots.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground mr-1">Recent</span>
                {recentFormDots.map((r, i) => (
                  <span key={i} className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${r === "W" ? "bg-green-100 text-green-700" : r === "L" ? "bg-red-100 text-red-600" : "bg-secondary text-secondary-foreground"}`}>
                    {r}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <StatPill label="Matches" value={totalPlayed} />
            <StatPill label="Win Rate" value={`${winRate}%`} highlight />
            <StatPill label="Wins" value={totalWins} />
            <StatPill label="Losses" value={totalLosses} />
          </div>
          {/* Elo rating bar */}
          <div className="mt-3 pt-3 border-t border-border">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-muted-foreground font-medium">Skill Rating (Elo)</span>
              <span className="font-heading font-bold text-sm text-primary">{eloRating}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all"
                style={{ width: `${Math.min(100, Math.max(5, ((eloRating - 600) / 800) * 100))}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>Beginner</span>
              <span>Intermediate</span>
              <span>Advanced</span>
            </div>
          </div>
        </div>

        {/* ── VERIFICATION BADGES ── */}
        <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
          <p className="font-heading font-semibold text-sm mb-3">Trust & Badges</p>
          <div className="flex flex-wrap gap-2">
            <VerifBadge icon="🛡️" label="ID Verified" active={user.id_verified} onClick={() => !user.id_verified && navigate("/verification")} color="blue" />
            <VerifBadge icon="📸" label="Photo Verified" active={user.photo_verified} onClick={() => !user.photo_verified && navigate("/verification")} color="green" />
            <VerifBadge icon="⭐" label="Top Rated" active={(user.average_rating || 0) >= 4.5} color="amber" />
            <VerifBadge icon="🏆" label="Reliable" active={totalWins >= 5} color="purple" />
          </div>
        </div>

        {/* ── FRIENDS & PLAYED WITH ── */}
        {(friends.length > 0 || playedWith.length > 0) && (
          <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="font-heading font-semibold text-sm">Social</p>
              <Button variant="ghost" size="sm" className="text-xs h-7 rounded-lg gap-1" onClick={() => navigate("/players")}>
                <UserPlus className="w-3 h-3" /> Find Players
              </Button>
            </div>
            {friends.length > 0 && (
              <div className="mb-3">
                <p className="text-[11px] text-muted-foreground mb-2">Friends · {friends.length}</p>
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  {friends.map((f) => (
                    <button key={f.id} onClick={() => navigate(`/player/${f.id}`)} className="flex flex-col items-center gap-1 flex-shrink-0">
                      <PlayerAvatar name={f.name || f.full_name} avatarUrl={f.photo_url} size="md" />
                      <span className="text-[10px] text-muted-foreground w-12 text-center truncate">{(f.name || f.full_name)?.split(" ")[0]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {playedWith.length > 0 && (
              <div>
                <p className="text-[11px] text-muted-foreground mb-2">Played with</p>
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  {playedWith.map((p) => (
                    <button key={p.id} onClick={() => navigate(`/player/${p.id}`)} className="flex flex-col items-center gap-1 flex-shrink-0">
                      <PlayerAvatar name={p.name || p.full_name} avatarUrl={p.photo_url} size="sm" />
                      <span className="text-[10px] text-muted-foreground w-10 text-center truncate">{(p.name || p.full_name)?.split(" ")[0]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ACHIEVEMENTS ── */}
        <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
          <p className="font-heading font-semibold text-sm mb-3">Achievements</p>
          <div className="space-y-2">
            {earnedAchievements.map((a) => (
              <div key={a.key} className="flex items-center gap-3 p-2.5 bg-primary/5 border border-primary/15 rounded-xl">
                <span className="text-xl">{a.icon}</span>
                <div>
                  <p className="font-semibold text-xs">{a.label}</p>
                  <p className="text-[10px] text-muted-foreground">{a.desc}</p>
                </div>
                <span className="ml-auto text-[10px] text-primary font-bold">EARNED</span>
              </div>
            ))}
            {lockedAchievements.map((a) => (
              <div key={a.key} className="flex items-center gap-3 p-2.5 bg-muted/40 rounded-xl opacity-50">
                <span className="text-xl grayscale">{a.icon}</span>
                <div>
                  <p className="font-semibold text-xs">{a.label}</p>
                  <p className="text-[10px] text-muted-foreground">{a.desc}</p>
                </div>
                <span className="ml-auto text-[10px] text-muted-foreground">LOCKED</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── UPCOMING ── */}
        {upcomingMatches.length > 0 && (
          <div>
            <p className="font-heading font-semibold text-sm mb-2 px-1">Upcoming</p>
            <div className="space-y-2">
              {upcomingMatches.slice(0, 3).map((match) => (
                <button key={match.id} onClick={() => navigate(`/match/${match.id}`)}
                  className="w-full flex items-center justify-between p-3.5 bg-card rounded-2xl border border-border hover:border-primary/30 transition-all">
                  <div className="text-left">
                    <p className="font-medium text-sm">{match.title}</p>
                    <p className="text-muted-foreground text-xs">{match.date} · {match.time}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── EVENT HISTORY ── */}
        {allHistory.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <p className="font-heading font-semibold text-sm">Recent History</p>
              <button onClick={() => navigate("/past-events")} className="text-xs text-primary font-medium">See all →</button>
            </div>
            {allHistory.slice(0, 5).map(item => (
              <HistoryItemCard
                key={`${item._type}-${item.id}`}
                item={item}
                currentUser={user}
                allUsers={historyUsers}
                myRatings={historyRatings}
              />
            ))}
          </div>
        )}

        {/* ── STATUS FEED ── */}
        <StatusFeed currentUser={user} friendEmails={friendEmails} />

        {/* End overview tab */}
        </>}

        {/* Admin */}
        {user.role === "admin" && (
          <Button variant="ghost" size="sm" className="w-full rounded-xl text-muted-foreground gap-2"
            onClick={() => navigate("/admin/id-review")}>
            <ShieldCheck className="w-3.5 h-3.5" /> Admin: Review ID Submissions
          </Button>
        )}

        {!user.profile_complete && (
          <Button variant="outline" className="w-full rounded-2xl h-11" onClick={() => navigate("/edit-profile")}>
            Complete Your Profile →
          </Button>
        )}

      </motion.div>
    </div>
  );
}

function StatPill({ label, value, highlight }) {
  return (
    <div className={`rounded-xl p-2.5 ${highlight ? "bg-primary/8 border border-primary/15" : "bg-muted/40"}`}>
      <p className={`font-heading font-bold text-lg ${highlight ? "text-primary" : ""}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
    </div>
  );
}

function VerifBadge({ icon, label, active, onClick, color }) {
  const colors = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    green: "border-green-200 bg-green-50 text-green-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    purple: "border-purple-200 bg-purple-50 text-purple-700",
  };
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
        active
          ? `${colors[color]} opacity-100`
          : "border-border bg-muted/40 text-muted-foreground opacity-60"
      } ${!active && onClick ? "hover:opacity-80 cursor-pointer" : "cursor-default"}`}
    >
      {icon} {label} {active && "✓"}
    </button>
  );
}