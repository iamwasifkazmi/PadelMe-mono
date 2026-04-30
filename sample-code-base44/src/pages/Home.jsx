import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, MapPin, MessageCircle, Search, Trophy, Users, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";

import MatchCard from "../components/MatchCard";
import RecentResultsStrip from "../components/home/RecentResultsStrip";
import InProgressMatchCard from "../components/InProgressMatchCard";
import PlayerAvatar from "../components/PlayerAvatar";
import InstantPlayCard from "../components/home/InstantPlayCard";
import HomeSection from "../components/home/HomeSection";
import UserMatchCard from "../components/home/UserMatchCard";
import PlayerMiniCard from "../components/home/PlayerMiniCard";
import FriendStrip from "../components/home/FriendStrip";
import CompetitionMiniCard from "../components/home/CompetitionMiniCard";

export default function Home() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [playersTab, setPlayersTab] = useState("nearby");

  useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      if (u && !u.profile_complete) {
        navigate("/onboarding", { replace: true });
        return;
      }
      // After login, check for a pending invite token and redirect
      const pendingToken = localStorage.getItem("invite_token_pending");
      if (pendingToken) {
        localStorage.removeItem("invite_token_pending");
        navigate(`/accept-invite?token=${pendingToken}`, { replace: true });
      }
    });
  }, [navigate]);

  const enabled = !!user;

  // --- Data fetching ---
  const { data: inProgressMatches = [] } = useQuery({
    queryKey: ["in-progress-matches", user?.email],
    queryFn: async () => {
      const results = await Promise.all(
        ["in_progress", "awaiting_score", "pending_validation"].map((s) =>
          base44.entities.Match.filter({ status: s }, "-updated_date", 20)
        )
      );
      return results.flat().filter((m) => m.players?.includes(user.email) || m.created_by === user.email);
    },
    enabled,
    refetchInterval: 30000,
  });

  const { data: myUpcomingMatches = [], isLoading: loadingMyMatches } = useQuery({
    queryKey: ["my-upcoming-matches", user?.email],
    queryFn: async () => {
      const all = await base44.entities.Match.filter({ status: "open" }, "-date", 50);
      return all.filter((m) => m.players?.includes(user.email) || m.created_by === user.email).slice(0, 5);
    },
    enabled,
  });

  const { data: openMatchesRaw = [], isLoading: loadingOpen } = useQuery({
    queryKey: ["open-matches"],
    queryFn: () => base44.entities.Match.filter({ status: "open" }, "-created_date", 20),
    enabled,
  });

  const openMatches = openMatchesRaw.filter((m) => {
    if (!m.visibility || m.visibility === "public") return true;
    return (
      m.created_by === user?.email ||
      m.players?.includes(user?.email) ||
      m.invited_emails?.includes(user?.email)
    );
  }).filter((m) => !m.players?.includes(user?.email) && m.created_by !== user?.email).slice(0, 4);

  const { data: allUsers = [] } = useQuery({
    queryKey: ["all-users"],
    queryFn: () => base44.entities.User.list(),
    enabled,
  });

  const { data: friendRequests = [] } = useQuery({
    queryKey: ["friend-requests"],
    queryFn: () => base44.entities.FriendRequest.list("-created_date", 200),
    enabled,
  });

  const { data: competitionsRaw = [] } = useQuery({
    queryKey: ["competitions-home"],
    queryFn: () => base44.entities.Competition.filter({ status: "registration" }, "-created_date", 10),
    enabled,
  });

  const { data: unreadNotifs = [] } = useQuery({
    queryKey: ["unread-notifications"],
    queryFn: () => base44.entities.Notification.filter({ user_email: user.email, is_read: false }, "-created_date", 50),
    enabled,
    refetchInterval: 30000,
  });

  const { data: recentForm = [] } = useQuery({
    queryKey: ["recent-form-home", user?.email],
    queryFn: () => base44.entities.PlayerRecentForm.filter({ user_email: user.email }, "-match_date", 10),
    enabled,
  });

  const { data: unreadMessages = [] } = useQuery({
    queryKey: ["unread-messages-home", user?.email],
    queryFn: async () => {
      const msgs = await base44.entities.Message.list("-created_date", 100);
      return msgs.filter((m) => m.sender_email !== user.email && !(m.read_by || []).includes(user.email));
    },
    enabled,
    refetchInterval: 15000,
  });

  if (!user) return (
    <div className="flex items-center justify-center h-96">
      <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
  if (user && !user.profile_complete) return null;

  // --- Derived data ---
  const firstName = (user?.name || user?.full_name)?.split(" ")[0] || "Player";

  const friendEmails = new Set(
    friendRequests
      .filter((r) => r.status === "accepted" && (r.requester_email === user?.email || r.recipient_email === user?.email))
      .map((r) => r.requester_email === user?.email ? r.recipient_email : r.requester_email)
  );

  const otherUsers = allUsers.filter((u) => u.email !== user?.email);
  const friends = otherUsers.filter((u) => friendEmails.has(u.email));
  const nearbyUsers = otherUsers.filter((u) =>
    !friendEmails.has(u.email) && u.profile_complete && u.profile_visibility !== "private"
  ).slice(0, 10);
  const displayedPlayers = playersTab === "friends" ? friends : nearbyUsers;

  const competitions = competitionsRaw.filter((c) => {
    if (!c.visibility || c.visibility === "public") return true;
    return c.host_email === user?.email || c.participants?.includes(user?.email) || c.invited_emails?.includes(user?.email);
  }).slice(0, 3);

  const winRate = user?.matches_played > 0
    ? Math.round(((user.wins || 0) / user.matches_played) * 100)
    : null;

  const hasActiveMatches = inProgressMatches.length > 0;

  return (
    <div className="max-w-2xl mx-auto lg:max-w-4xl">

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <Link to="/profile">
            <PlayerAvatar name={user?.name || user?.full_name} avatarUrl={user?.photo_url || user?.avatar_url} size="md" />
          </Link>
          <div>
            <p className="font-heading font-bold text-lg leading-tight">Hi {firstName} 👋</p>
            {user?.location ? (
              <p className="text-[11px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
                <MapPin className="w-3 h-3" /> {user.location}
              </p>
            ) : (
              <button
                onClick={() => navigate("/edit-profile")}
                className="text-[11px] text-primary flex items-center gap-0.5 mt-0.5"
              >
                <MapPin className="w-3 h-3" /> Set your location →
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/messages" className="relative p-2 rounded-xl bg-card border border-border">
            <MessageCircle className="w-5 h-5" />
            {unreadMessages.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-accent text-accent-foreground text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {unreadMessages.length > 9 ? "9+" : unreadMessages.length}
              </span>
            )}
          </Link>
          <Link to="/notifications" className="relative p-2 rounded-xl bg-card border border-border">
            <Bell className="w-5 h-5" />
            {unreadNotifs.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-accent text-accent-foreground text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {unreadNotifs.length > 9 ? "9+" : unreadNotifs.length}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* ── DYNAMIC: In Progress first if active ── */}
      {hasActiveMatches && (
        <HomeSection title="🔴 In Progress" subtitle="Action required">
          <div className="px-5 space-y-3">
            {inProgressMatches.map((match) => (
              <InProgressMatchCard key={match.id} match={match} currentUserEmail={user?.email} users={allUsers} />
            ))}
          </div>
        </HomeSection>
      )}

      {/* ── INSTANT PLAY (moves down if in-progress active) ── */}
      <div className="px-5 mb-6">
        <InstantPlayCard />
      </div>

      {/* ── QUICK ACTIONS ── */}
      <div className="px-5 mb-6">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-4">
          <ActionTile icon="🔍" label="Find Game" onClick={() => navigate("/find-match")} />
          <ActionTile icon="➕" label="Create" onClick={() => navigate("/create-match")} accent />
          <ActionTile icon="🏆" label="Compete" onClick={() => navigate("/competitions")} />
          <ActionTile icon="👥" label="Players" onClick={() => navigate("/players")} />
        </div>
      </div>

      {/* ── MY UPCOMING MATCHES ── */}
      <HomeSection title="📅 Your Matches" subtitle="Matches you're in" link="/find-match">
        <div className="px-5 space-y-2">
          {loadingMyMatches ? (
            [1, 2].map((i) => <div key={i} className="h-20 bg-card rounded-2xl animate-pulse" />)
          ) : myUpcomingMatches.length > 0 ? (
            myUpcomingMatches.map((m) => (
              <UserMatchCard key={m.id} match={m} currentUserEmail={user?.email} />
            ))
          ) : (
            <EmptyState
              icon="📅"
              message="You're not in any upcoming matches"
              action="Find a match to join"
              onAction={() => navigate("/find-match")}
            />
          )}
        </div>
      </HomeSection>

      {/* ── IN PROGRESS (if not at top) ── */}
      {!hasActiveMatches && (
        <HomeSection title="🔴 In Progress" subtitle="Active matches">
          <div className="px-5">
            <EmptyState icon="🟢" message="No active matches right now" />
          </div>
        </HomeSection>
      )}

      {/* ── PLAYERS NEAR YOU + FRIENDS ── */}
      <HomeSection
        title="👥 Players"
        subtitle={playersTab === "friends" ? `${friends.length} friends` : "Suggested for you"}
        extra={
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-secondary rounded-xl p-1">
              {["nearby", "friends"].map((t) => (
                <button
                  key={t}
                  onClick={() => setPlayersTab(t)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                    playersTab === t ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {t === "nearby" ? "Nearby" : `Friends${friends.length > 0 ? ` (${friends.length})` : ""}`}
                </button>
              ))}
            </div>
            <Link to="/players" className="text-primary text-xs font-medium whitespace-nowrap">All →</Link>
          </div>
        }
      >
        <div className="flex gap-3 px-5 overflow-x-auto pb-1 no-scrollbar">
          {displayedPlayers.length === 0 ? (
            <div className="py-4 w-full">
              <p className="text-sm text-muted-foreground">
                {playersTab === "friends"
                  ? "No friends yet — browse players to connect!"
                  : "No nearby players found"}
              </p>
              {playersTab === "friends" && (
                <button onClick={() => navigate("/players")} className="text-xs text-primary mt-1">Browse players →</button>
              )}
            </div>
          ) : (
            displayedPlayers.map((player, idx) => (
              <motion.div key={player.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: idx * 0.04 }}>
                <PlayerMiniCard
                  player={player}
                  currentUser={user}
                  friendRequests={friendRequests}
                  isFriend={friendEmails.has(player.email)}
                  onView={() => navigate(`/player/${player.id}`)}
                />
              </motion.div>
            ))
          )}
        </div>
      </HomeSection>

      {/* ── FRIENDS STRIP ── */}
      {friends.length > 0 && (
        <HomeSection title="🤝 Friends" subtitle="Your network" link="/friends">
          <FriendStrip friends={friends.slice(0, 12)} />
        </HomeSection>
      )}

      {/* ── EXPLORE / OPEN MATCHES ── */}
      <HomeSection title="🔍 Open Matches" subtitle="Find a game to join" link="/find-match">
        <div className="px-5 space-y-3">
          {loadingOpen ? (
            [1, 2].map((i) => <div key={i} className="h-24 bg-card rounded-2xl animate-pulse" />)
          ) : openMatches.length > 0 ? (
            openMatches.map((m) => <MatchCard key={m.id} match={m} />)
          ) : (
            <EmptyState
              icon="🔍"
              message="No open matches nearby"
              action="Create the first one"
              onAction={() => navigate("/create-match")}
            />
          )}
        </div>
      </HomeSection>

      {/* ── COMPETITIONS ── */}
      <HomeSection title="🏆 Competitions" subtitle="Tournaments & leagues" link="/competitions">
        <div className="px-5 space-y-3">
          {competitions.length > 0 ? (
            competitions.map((c) => (
              <CompetitionMiniCard key={c.id} competition={c} onClick={() => navigate(`/competition/${c.id}`)} />
            ))
          ) : (
            <EmptyState
              icon="🏆"
              message="No competitions open right now"
              action="Browse all competitions"
              onAction={() => navigate("/competitions")}
            />
          )}
        </div>
      </HomeSection>

      {/* ── RECENT RESULTS ── */}
      {recentForm.length > 0 && (
        <div className="px-5 mb-4">
          <RecentResultsStrip recentForm={recentForm} currentUserEmail={user?.email} />
        </div>
      )}

      {/* ── MINI STATS + PAST EVENTS LINK ── */}
      {user?.matches_played > 0 && (
        <div className="px-5 mb-10">
          <div className="bg-card rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="font-heading font-semibold text-xs text-muted-foreground uppercase tracking-wide">Your Stats</p>
              <button onClick={() => navigate("/past-events")} className="text-xs text-primary font-medium">
                Past Events →
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <StatItem value={user.matches_played} label="Matches" />
              <StatItem value={user.wins || 0} label="Wins" />
              <StatItem value={winRate !== null ? `${winRate}%` : "—"} label="Win Rate" />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function ActionTile({ icon, label, onClick, accent }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl py-3.5 px-2 text-center transition-all active:scale-95 shadow-sm ${
        accent
          ? "bg-primary text-primary-foreground shadow-primary/25"
          : "bg-card border border-border text-foreground"
      }`}
    >
      <div className="text-xl mb-1">{icon}</div>
      <p className="font-heading font-semibold text-[11px] leading-tight">{label}</p>
    </button>
  );
}

function EmptyState({ icon, message, action, onAction }) {
  return (
    <div className="bg-card rounded-2xl border border-dashed border-border p-5 text-center">
      {icon && <div className="text-2xl mb-1">{icon}</div>}
      <p className="text-muted-foreground text-sm">{message}</p>
      {action && onAction && (
        <button onClick={onAction} className="text-primary text-xs font-medium mt-1.5">
          {action} →
        </button>
      )}
    </div>
  );
}

function StatItem({ value, label }) {
  return (
    <div>
      <p className="font-heading font-bold text-xl">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}