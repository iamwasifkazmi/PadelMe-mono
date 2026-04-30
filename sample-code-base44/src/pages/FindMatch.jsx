import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Search, MapPin, Zap, Plus, X, Star,
  MessageCircle, Trophy, Clock, Users, UserCheck,
  Calendar, SlidersHorizontal, ChevronDown, Navigation,
  UserPlus, Mail
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PlayerAvatar from "../components/PlayerAvatar";
import SkillBadge from "../components/SkillBadge";
import VerificationBadge from "../components/VerificationBadge";
import ELODisplay, { RatingDisplay } from "../components/ELODisplay";
import SocialButton from "../components/SocialButton";
import { getELOTier } from "../lib/elo";
import { getOrCreateDirectConversation } from "../lib/chat";
import { motion, AnimatePresence } from "framer-motion";
import { notifyFriendRequestAccepted } from "@/lib/notifications";
import { getFriendEmails, getHiddenEmails, getPendingReceived } from "@/lib/relationships";
import { rankPlayers, rankMatches } from "@/lib/recommendationEngine";
import { rateSkillMatch } from "@/lib/elo";
import AvailabilityFeed from "@/components/availability/AvailabilityFeed";

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeLabel(match) {
  if (!match.date) return "";
  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  if (match.date === today) return `Today ${match.time || ""}`.trim();
  if (match.date === tomorrow) return `Tomorrow ${match.time || ""}`.trim();
  return `${match.date} ${match.time || ""}`.trim();
}

function spotsLeft(match) {
  return (match.max_players || 2) - (match.players?.length || 0);
}

function isToday(match) {
  return match.date === new Date().toISOString().split("T")[0];
}
function isTomorrow(match) {
  return match.date === new Date(Date.now() + 86400000).toISOString().split("T")[0];
}


function activityLabel(user) {
  if (!user?.updated_date) return null;
  const diff = Date.now() - new Date(user.updated_date).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "Active now";
  if (hours < 24) return `Active ${hours}h ago`;
  return null;
}

function availabilityLabel(user) {
  const times = user?.availability_times || [];
  const days = user?.availability_days || [];
  if (times.length === 0) return null;
  const timeStr = times.length === 1 ? `${times[0].toLowerCase()}s` : times.map(t => t.toLowerCase()).join(" & ");
  const hasWeekend = days.some(d => ["Saturday", "Sunday"].includes(d));
  const hasWeekday = days.some(d => !["Saturday", "Sunday"].includes(d));
  const dayStr = hasWeekend && hasWeekday ? " & weekends" : hasWeekend ? " & weekends" : "";
  return `Usually plays ${timeStr}${dayStr}`;
}

const DISTANCE_OPTIONS = [
  { value: 5,   label: "Within 5 km" },
  { value: 10,  label: "Within 10 km" },
  { value: 25,  label: "Within 25 km" },
  { value: 50,  label: "Within 50 km" },
  { value: 999, label: "Any distance" },
];

const SKILL_OPTIONS = [
  { value: "",             label: "Beginner – Advanced" },
  { value: "beginner",     label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced",     label: "Advanced" },
];

const FORMAT_CHIPS = [
  { value: "singles",       label: "1v1" },
  { value: "doubles",       label: "2v2" },
  { value: "mixed_doubles", label: "Mixed" },
];

// ── Main Component ────────────────────────────────────────────────────────────

export default function FindMatch() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const urlParams = new URLSearchParams(window.location.search);
  const defaultTab = urlParams.get("tab") || "players";

  const [tab, setTab] = useState(defaultTab);
  const [query, setQuery] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const [formatFilter, setFormatFilter] = useState("");
  const [dayFilter, setDayFilter] = useState("");
  const [distanceFilter, setDistanceFilter] = useState(25);
  const [showDistanceDrop, setShowDistanceDrop] = useState(false);
  const [showSkillDrop, setShowSkillDrop] = useState(false);
  const [user, setUser] = useState(null);
  const [userLat, setUserLat] = useState(null);
  const [userLng, setUserLng] = useState(null);
  const [locationLabel, setLocationLabel] = useState("");

  useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      if (u?.location) setLocationLabel(u.location);
      if (u?.location_lat) setUserLat(u.location_lat);
      if (u?.location_lng) setUserLng(u.location_lng);
    });
  }, []);

  const detectLocation = () => {
    navigator.geolocation.getCurrentPosition((pos) => {
      setUserLat(pos.coords.latitude);
      setUserLng(pos.coords.longitude);
      // Reverse geocode with nominatim
      fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`)
        .then(r => r.json())
        .then(data => {
          const city = data.address?.city || data.address?.town || data.address?.village || "";
          const country = data.address?.country_code?.toUpperCase() || "";
          if (city) setLocationLabel(`${city}${country ? ", " + country : ""}`);
        });
    });
  };

  // ── Data Fetching ───────────────────────────────────────────────────────────

  const { data: matches = [], isLoading: matchesLoading } = useQuery({
    queryKey: ["matches-discover"],
    queryFn: () => base44.entities.Match.filter({ status: "open" }, "date", 100),
    refetchInterval: 30000,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ["all-users"],
    queryFn: () => base44.entities.User.list(),
    enabled: !!user,
  });

  const { data: friendRequests = [] } = useQuery({
    queryKey: ["friend-requests"],
    queryFn: async () => {
      if (!user?.email) return [];
      const [sent, received] = await Promise.all([
        base44.entities.FriendRequest.filter({ requester_email: user.email }, "-created_date", 300),
        base44.entities.FriendRequest.filter({ recipient_email: user.email }, "-created_date", 300),
      ]);
      const map = new Map();
      [...sent, ...received].forEach(r => map.set(r.id, r));
      return Array.from(map.values());
    },
    enabled: !!user?.email,
    refetchInterval: 15000,
  });

  const { data: blockedList = [] } = useQuery({
    queryKey: ["blocked-users", user?.email],
    queryFn: () => base44.entities.BlockedUser.filter({ blocker_email: user.email }),
    enabled: !!user?.email,
  });

  const { data: blockedMeList = [] } = useQuery({
    queryKey: ["blocked-me", user?.email],
    queryFn: () => base44.entities.BlockedUser.filter({ blocked_email: user.email }),
    enabled: !!user?.email,
  });

  const { data: playerStats = [] } = useQuery({
    queryKey: ["player-stats"],
    queryFn: () => base44.entities.PlayerStats.list(),
    enabled: !!user,
  });

  const { data: ratingSummaries = [] } = useQuery({
    queryKey: ["rating-summaries"],
    queryFn: () => base44.entities.PlayerRatingSummary.list(),
    enabled: !!user,
  });

  // ── Derived data ────────────────────────────────────────────────────────────

  const userMap = useMemo(() =>
    Object.fromEntries(allUsers.map((u) => [u.email, u])), [allUsers]);

  const statsMap = useMemo(() => {
    const map = {};
    playerStats.forEach(s => { map[s.user_email] = { ...s }; });
    ratingSummaries.forEach(r => {
      if (map[r.user_email]) {
        map[r.user_email].average_rating = r.average_rating;
        map[r.user_email].total_ratings = r.total_ratings;
      } else {
        map[r.user_email] = { user_email: r.user_email, average_rating: r.average_rating, total_ratings: r.total_ratings };
      }
    });
    return map;
  }, [playerStats, ratingSummaries]);

  const friendEmails = useMemo(() => getFriendEmails(user?.email, friendRequests), [friendRequests, user]);
  const hiddenEmails = useMemo(() => getHiddenEmails(blockedList, blockedMeList), [blockedList, blockedMeList]);
  const pendingReceived = useMemo(() =>
    getPendingReceived(user?.email, friendRequests).filter(r => !hiddenEmails.has(r.requester_email)),
  [friendRequests, user, hiddenEmails]);

  // ── Filtered & Ranked Matches (via recommendation engine) ───────────────────

  const filteredMatches = useMemo(() => {
    let result = matches.filter((m) => {
      if (m.visibility === "invite_only" && user) {
        return m.created_by === user.email || m.players?.includes(user.email) || m.invited_emails?.includes(user.email);
      }
      return true;
    });
    if (query) {
      const q = query.toLowerCase();
      result = result.filter((m) =>
        m.title?.toLowerCase().includes(q) ||
        m.location_name?.toLowerCase().includes(q) ||
        m.location_address?.toLowerCase().includes(q)
      );
    }
    if (skillFilter) result = result.filter((m) => m.skill_level === skillFilter || m.skill_level === "any");
    if (formatFilter) result = result.filter((m) => m.match_type === formatFilter);
    if (dayFilter === "today") result = result.filter(isToday);
    else if (dayFilter === "tomorrow") result = result.filter(isTomorrow);
    else if (dayFilter === "week") {
      const weekOut = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
      result = result.filter((m) => m.date <= weekOut);
    }
    // Rank with engine
    return rankMatches({ matches: result, viewer: user, friendEmails, userLat, userLng });
  }, [matches, query, skillFilter, formatFilter, dayFilter, user, friendEmails, userLat, userLng]);

  const instantMatches = filteredMatches.filter((m) => m.is_instant);
  const soonMatches = filteredMatches.filter((m) => isToday(m) && !m.is_instant);
  const upcomingMatches = filteredMatches.filter((m) => !isToday(m));

  // ── Filtered & Ranked Players (via recommendation engine) ───────────────────

  const filteredPlayers = useMemo(() => {
    if (!user) return [];
    return rankPlayers({
      candidates: allUsers,
      viewer: user,
      friendRequests,
      hiddenEmails,
      friendEmails,
      userLat,
      userLng,
      distanceFilterKm: distanceFilter,
      skillFilter,
      query,
    });
  }, [allUsers, user, friendRequests, query, skillFilter, friendEmails, hiddenEmails, userLat, userLng, distanceFilter]);

  // ── Filtered Friends ────────────────────────────────────────────────────────

  const filteredFriends = useMemo(() => {
    const emails = getFriendEmails(user?.email, friendRequests);
    let friends = [...emails]
      .filter(email => !hiddenEmails.has(email))
      .map(email => userMap[email])
      .filter(Boolean);
    if (!query) return friends;
    const q = query.toLowerCase();
    return friends.filter((f) => f.full_name?.toLowerCase().includes(q) || f.location?.toLowerCase().includes(q));
  }, [friendRequests, user, userMap, query, hiddenEmails]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleMessage = useCallback(async (friend) => {
    const conv = await getOrCreateDirectConversation(user, friend);
    navigate(`/conversation/${conv.id}`);
  }, [user, navigate]);

  const handleAccept = async (req) => {
    await base44.entities.FriendRequest.update(req.id, { status: "accepted" });
    notifyFriendRequestAccepted(req.requester_email, user).catch(() => {});
    // Pre-create DM so messaging is immediately available
    const sender = userMap[req.requester_email] || { email: req.requester_email, full_name: req.requester_name };
    if (user) getOrCreateDirectConversation(user, sender).catch(() => {});
    queryClient.invalidateQueries(["friend-requests"]);
    queryClient.refetchQueries(["friend-requests"]);
  };
  const handleDecline = async (req) => {
    await base44.entities.FriendRequest.update(req.id, { status: "declined" });
    queryClient.invalidateQueries(["friend-requests"]);
  };

  // Active filter chips for players tab
  const activeFilterChips = [];
  if (distanceFilter < 999 && userLat) activeFilterChips.push({ key: "dist", label: DISTANCE_OPTIONS.find(d => d.value === distanceFilter)?.label });
  if (skillFilter) activeFilterChips.push({ key: "skill", label: SKILL_OPTIONS.find(s => s.value === skillFilter)?.label });

  const clearAllFilters = () => { setDistanceFilter(25); setSkillFilter(""); };

  const tabs = [
    { id: "games",   label: "🎾 Games",   count: filteredMatches.length },
    { id: "players", label: "👥 Players",  count: filteredPlayers.length },
    { id: "friends", label: "🤝 Friends",  count: pendingReceived.length || null },
  ];

  return (
    <div className="max-w-lg mx-auto min-h-screen bg-background" onClick={() => { setShowDistanceDrop(false); setShowSkillDrop(false); }}>

      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-20 bg-background/97 backdrop-blur-sm border-b border-border">
        <div className="px-4 pt-5 pb-3">

          {/* Title row + location */}
          <div className="flex items-start justify-between mb-1">
            <div>
              <h1 className="font-heading font-bold text-2xl leading-tight">Discover</h1>
              <p className="text-xs text-muted-foreground">Find players, games and friends near you</p>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={(e) => { e.stopPropagation(); detectLocation(); }}
                className="flex items-center gap-1.5 bg-primary/8 border border-primary/20 text-primary text-xs font-medium px-3 py-1.5 rounded-full"
              >
                <MapPin className="w-3 h-3 fill-primary text-primary" />
                <span className="max-w-[110px] truncate">{locationLabel || "Set location"}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); detectLocation(); }}
                className="w-8 h-8 rounded-full border border-border bg-card flex items-center justify-center"
              >
                <Navigation className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative mt-3 mb-3">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              placeholder="Search by name, town or venue..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-11 pl-10 pr-10 rounded-2xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
            />
            {query ? (
              <button onClick={() => setQuery("")} className="absolute right-3.5 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            ) : (
              <SlidersHorizontal className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  tab === t.id
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {t.label}
                {t.count > 0 && (
                  <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-bold leading-none ${
                    tab === t.id ? "bg-white/30 text-white" : "bg-primary/15 text-primary"
                  }`}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >

          {/* ════════════════════════════════════════
              TAB: GAMES
          ════════════════════════════════════════ */}
          {tab === "games" && (
            <div className="pb-8">
              {/* Filter chips */}
              <div className="px-4 pt-3 pb-2">
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  {[
                    { value: "today",    label: "Today" },
                    { value: "tomorrow", label: "Tomorrow" },
                    { value: "week",     label: "This Week" },
                  ].map((d) => (
                    <FilterChip key={d.value} label={d.label} active={dayFilter === d.value}
                      onClick={() => setDayFilter(dayFilter === d.value ? "" : d.value)} />
                  ))}
                  <div className="w-px bg-border flex-shrink-0 mx-1" />
                  {[
                    { value: "beginner", label: "🌱 Beginner" },
                    { value: "intermediate", label: "⚡ Mid" },
                    { value: "advanced", label: "🏆 Advanced" },
                  ].map((s) => (
                    <FilterChip key={s.value} label={s.label} active={skillFilter === s.value}
                      onClick={() => setSkillFilter(skillFilter === s.value ? "" : s.value)} />
                  ))}
                  <div className="w-px bg-border flex-shrink-0 mx-1" />
                  {FORMAT_CHIPS.map((f) => (
                    <FilterChip key={f.value} label={f.label} active={formatFilter === f.value}
                      onClick={() => setFormatFilter(formatFilter === f.value ? "" : f.value)} />
                  ))}
                  {(skillFilter || formatFilter || dayFilter) && (
                    <button
                      onClick={() => { setSkillFilter(""); setFormatFilter(""); setDayFilter(""); }}
                      className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full bg-destructive/10 text-destructive text-xs font-medium"
                    >
                      <X className="w-3 h-3" /> Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Live Availability Feed */}
              <div className="px-4 pt-3 pb-1">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <p className="font-heading font-semibold text-sm">Live Availability</p>
                </div>
                <AvailabilityFeed
                  currentUser={user}
                  allUsers={allUsers}
                  blockedEmails={hiddenEmails}
                  maxItems={3}
                />
              </div>

              {matchesLoading ? (
                <div className="px-4 space-y-3 pt-2">
                  {[1,2,3].map(i => <div key={i} className="h-28 rounded-2xl bg-card animate-pulse border border-border" />)}
                </div>
              ) : filteredMatches.length === 0 ? (
                <GamesEmptyState onInstant={() => navigate("/instant-play")} onCreate={() => navigate("/create-match")} />
              ) : (
                <div className="px-4 space-y-5 pt-2">
                  {instantMatches.length > 0 && (
                    <Section icon={<Zap className="w-4 h-4 text-accent" />} title="⚡ Play Now">
                      {instantMatches.map((m) => <GameCard key={m.id} match={m} currentUser={user} onView={() => navigate(`/match/${m.id}`)} />)}
                    </Section>
                  )}
                  {soonMatches.length > 0 && (
                    <Section icon={<Clock className="w-4 h-4 text-primary" />} title="🔥 Today">
                      {soonMatches.map((m) => <GameCard key={m.id} match={m} currentUser={user} onView={() => navigate(`/match/${m.id}`)} />)}
                    </Section>
                  )}
                  {upcomingMatches.length > 0 && (
                    <Section icon={<Calendar className="w-4 h-4 text-muted-foreground" />} title="📅 Upcoming">
                      {upcomingMatches.map((m) => <GameCard key={m.id} match={m} currentUser={user} onView={() => navigate(`/match/${m.id}`)} />)}
                    </Section>
                  )}
                </div>
              )}

              <div className="px-4 mt-5 grid grid-cols-2 gap-3">
                <button onClick={() => navigate("/instant-play")} className="flex items-center gap-2 p-3.5 rounded-2xl bg-accent/10 border border-accent/20 text-left">
                  <Zap className="w-5 h-5 text-accent flex-shrink-0" />
                  <div>
                    <p className="font-heading font-semibold text-sm text-accent">Play Now</p>
                    <p className="text-[11px] text-muted-foreground">Find a game instantly</p>
                  </div>
                </button>
                <button onClick={() => navigate("/create-match")} className="flex items-center gap-2 p-3.5 rounded-2xl bg-primary/10 border border-primary/20 text-left">
                  <Plus className="w-5 h-5 text-primary flex-shrink-0" />
                  <div>
                    <p className="font-heading font-semibold text-sm text-primary">Create Match</p>
                    <p className="text-[11px] text-muted-foreground">Organise your own game</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════
              TAB: PLAYERS
          ════════════════════════════════════════ */}
          {tab === "players" && (
            <div className="pb-8">
              {/* Filter bar */}
              <div className="px-4 pt-3 pb-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                <div className="grid grid-cols-3 gap-2">
                  {/* Distance dropdown */}
                  <div className="relative col-span-1">
                    <button
                      onClick={() => { setShowDistanceDrop(!showDistanceDrop); setShowSkillDrop(false); }}
                      className="w-full flex items-center justify-between gap-1 h-9 px-2.5 rounded-xl border border-border bg-card text-xs font-medium"
                    >
                      <div className="flex items-center gap-1 min-w-0">
                        <MapPin className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <span className="truncate">{DISTANCE_OPTIONS.find(d => d.value === distanceFilter)?.label.replace("Within ", "≤") || "Distance"}</span>
                      </div>
                      <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    </button>
                    {showDistanceDrop && (
                      <div className="absolute top-10 left-0 z-30 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[140px]">
                        {DISTANCE_OPTIONS.map(opt => (
                          <button key={opt.value} onClick={() => { setDistanceFilter(opt.value); setShowDistanceDrop(false); }}
                            className={`w-full text-left px-3 py-2 text-xs hover:bg-secondary transition-colors ${distanceFilter === opt.value ? "text-primary font-semibold" : ""}`}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Skill dropdown */}
                  <div className="relative col-span-1">
                    <button
                      onClick={() => { setShowSkillDrop(!showSkillDrop); setShowDistanceDrop(false); }}
                      className="w-full flex items-center justify-between gap-1 h-9 px-2.5 rounded-xl border border-border bg-card text-xs font-medium"
                    >
                      <div className="flex items-center gap-1 min-w-0">
                        <Star className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <span className="truncate">{skillFilter ? SKILL_OPTIONS.find(s => s.value === skillFilter)?.label : "Skill Level"}</span>
                      </div>
                      <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    </button>
                    {showSkillDrop && (
                      <div className="absolute top-10 left-0 z-30 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[160px]">
                        {SKILL_OPTIONS.map(opt => (
                          <button key={opt.value} onClick={() => { setSkillFilter(opt.value); setShowSkillDrop(false); }}
                            className={`w-full text-left px-3 py-2 text-xs hover:bg-secondary transition-colors ${skillFilter === opt.value ? "text-primary font-semibold" : ""}`}>
                            {opt.label || "Beginner – Advanced"}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Clear filters */}
                  {activeFilterChips.length > 0 ? (
                    <button onClick={clearAllFilters} className="h-9 px-2.5 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-xs font-medium flex items-center justify-center gap-1">
                      <X className="w-3 h-3" /> Clear
                    </button>
                  ) : (
                    <div className="h-9 rounded-xl border border-border bg-card/50 flex items-center justify-center">
                      <span className="text-[10px] text-muted-foreground">All players</span>
                    </div>
                  )}
                </div>

                {/* Active filter chips */}
                {activeFilterChips.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] text-muted-foreground">Active filters:</span>
                    {activeFilterChips.map(chip => (
                      <span key={chip.key} className="flex items-center gap-1 text-[11px] bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full font-medium">
                        {chip.label}
                        <button onClick={() => {
                          if (chip.key === "dist") setDistanceFilter(25);
                          if (chip.key === "skill") setSkillFilter("");
                        }}>
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                    <button onClick={clearAllFilters} className="text-[11px] text-destructive font-semibold ml-auto">Clear all</button>
                  </div>
                )}

                {/* Results context */}
                {filteredPlayers.length > 0 && (
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Navigation className="w-3 h-3 text-primary" />
                      {locationLabel ? `Showing players near ${locationLabel.split(",")[0]}` : `${filteredPlayers.length} players found`}
                    </p>
                    <span className="text-[11px] text-muted-foreground">Sort: Recommended</span>
                  </div>
                )}
              </div>

              <div className="px-4 space-y-3 pt-1">
                {filteredPlayers.length === 0 ? (
                  <div className="text-center py-16">
                    <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="font-heading font-semibold mb-1">No players found</p>
                    <p className="text-muted-foreground text-sm">Try adjusting your search or filters</p>
                  </div>
                ) : (
                  filteredPlayers.map((player, idx) => (
                    <motion.div key={player.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.02 }}>
                      <PlayerCard
                        player={player}
                        currentUser={user}
                        friendRequests={friendRequests}
                        blockedList={blockedList}
                        blockedMeList={blockedMeList}
                        isFriend={friendEmails.has(player.email)}
                        onView={() => navigate(`/player/${player.id}`)}
                        onMessage={() => handleMessage(player)}
                        playerStats={statsMap}
                      />
                    </motion.div>
                  ))
                )}
              </div>

              {/* Invite friends CTA */}
              <div className="mx-4 mt-6 flex items-center justify-between gap-3 p-4 bg-card border border-border rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-heading font-semibold text-sm">Invite your friends</p>
                    <p className="text-[11px] text-muted-foreground">More friends = more games. Play together!</p>
                  </div>
                </div>
                <Button size="sm" className="rounded-xl text-xs gap-1.5 flex-shrink-0" onClick={() => navigate("/invite")}>
                  <Mail className="w-3.5 h-3.5" /> Invite
                </Button>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════
              TAB: FRIENDS
          ════════════════════════════════════════ */}
          {tab === "friends" && (
            <div className="pb-8">
              {pendingReceived.length > 0 && (
                <div className="px-4 pt-3">
                  <div className="bg-primary/8 border border-primary/20 rounded-2xl p-3 space-y-2">
                    <p className="text-xs font-semibold text-primary uppercase tracking-wide">
                      {pendingReceived.length} Pending Request{pendingReceived.length !== 1 ? "s" : ""}
                    </p>
                    {pendingReceived.map((req) => {
                      const sender = userMap[req.requester_email];
                      if (!sender) return null;
                      return (
                        <div key={req.id} className="flex items-center gap-2">
                          <PlayerAvatar name={sender.full_name} avatarUrl={sender.photo_url} size="sm" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{sender.full_name}</p>
                          </div>
                          <Button size="sm" className="h-7 rounded-lg text-xs px-3" onClick={() => handleAccept(req)}>Accept</Button>
                          <Button size="sm" variant="ghost" className="h-7 rounded-lg text-xs px-2" onClick={() => handleDecline(req)}>✕</Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="px-4 pt-3 space-y-3">
                {filteredFriends.length === 0 ? (
                  <div className="text-center py-16">
                    <UserCheck className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="font-heading font-semibold mb-1">
                      {query ? "No friends match your search" : "No friends yet"}
                    </p>
                    <p className="text-muted-foreground text-sm mb-4">
                      {query ? "Try a different name" : "Find players and connect with them"}
                    </p>
                    {!query && (
                      <Button variant="outline" onClick={() => setTab("players")} className="rounded-xl gap-1.5">
                        <Users className="w-4 h-4" /> Find Players
                      </Button>
                    )}
                  </div>
                ) : (
                  filteredFriends.map((friend, idx) => (
                    <motion.div key={friend.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.02 }}>
                      <FriendCard
                        friend={friend}
                        onView={() => navigate(`/player/${friend.id}`)}
                        onMessage={() => handleMessage(friend)}
                        onInvite={() => navigate(`/invite?email=${friend.email}`)}
                      />
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          )}

        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function FilterChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
        active ? "bg-primary text-primary-foreground shadow-sm" : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
      }`}
    >
      {label}
    </button>
  );
}

function Section({ icon, title, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        {icon}
        <p className="font-heading font-semibold text-sm">{title}</p>
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function GameCard({ match, currentUser, onView }) {
  const spots = spotsLeft(match);
  const joined = match.players?.includes(currentUser?.email);
  const reasons = match._reasons || [];

  return (
    <div onClick={onView} className="bg-card rounded-2xl border border-border p-4 cursor-pointer hover:border-primary/30 hover:shadow-sm transition-all active:scale-[0.99]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            {match.is_instant && (
              <span className="flex items-center gap-0.5 text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                <Zap className="w-2.5 h-2.5" /> NOW
              </span>
            )}
            <span className="text-xs text-muted-foreground font-medium">{timeLabel(match)}</span>
          </div>
          <p className="font-heading font-semibold text-sm leading-tight mb-1 truncate">{match.title}</p>
          {match.location_name && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
              <MapPin className="w-3 h-3" /> {match.location_name}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            {match.skill_level && match.skill_level !== "any" && <SkillBadge level={match.skill_level} />}
            {match.match_type && (
              <Badge variant="outline" className="text-[10px] py-0">
                {match.match_type === "singles" ? "1v1" : match.match_type === "mixed_doubles" ? "Mixed" : "2v2"}
              </Badge>
            )}
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              spots === 0 ? "bg-red-100 text-red-600" : spots === 1 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
            }`}>
              {spots === 0 ? "Full" : `${spots} spot${spots !== 1 ? "s" : ""} left`}
            </span>
          </div>
          {/* Why Recommended labels */}
          {reasons.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              {reasons.map((r, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[10px] font-medium bg-primary/8 text-primary px-2 py-0.5 rounded-full border border-primary/15">
                  {r.icon} {r.label}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <Button size="sm" variant={joined ? "secondary" : "default"} className="h-8 rounded-xl text-xs px-3 font-semibold"
            onClick={(e) => { e.stopPropagation(); onView(); }}>
            {joined ? "Joined ✓" : spots === 0 ? "View" : "Join →"}
          </Button>
          <p className="text-[10px] text-muted-foreground">{match.players?.length || 0}/{match.max_players || 2}</p>
        </div>
      </div>
    </div>
  );
}

function PlayerCard({ player, currentUser, friendRequests, blockedList, blockedMeList, isFriend, onView, onMessage, playerStats = {} }) {
  const activity = activityLabel(player);
  const dist = player._distance;
  const reasons = player._reasons || [];
  const stats = playerStats[player.email];

  const elo = stats?.elo_rating || 1000;
  const eloTier = getELOTier(elo);
  const tierProgress = Math.min(100, ((elo - eloTier.min) / (eloTier.max === Infinity ? 400 : eloTier.max - eloTier.min)) * 100);

  const matchesPlayed = stats?.matches_played || 0;
  const matchesWon = stats?.matches_won || 0;
  const winPct = matchesPlayed > 0 ? Math.round((matchesWon / matchesPlayed) * 100) : null;

  const avgRating = stats?.average_rating || 0;
  const ratingCount = stats?.total_ratings || 0;

  const isNewPlayer = matchesPlayed === 0;

  return (
    <div className="bg-card rounded-2xl border border-border hover:border-primary/20 hover:shadow-sm transition-all overflow-hidden">
      {/* Top row: avatar + name + actions */}
      <div className="flex items-start gap-3 p-4 pb-3">
        <div className="relative flex-shrink-0 cursor-pointer" onClick={onView}>
          <PlayerAvatar name={player.name || player.full_name} avatarUrl={player.photo_url} size="lg" />
          {activity === "Active now" && (
            <span className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-card" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <button onClick={onView} className="font-heading font-bold text-sm hover:text-primary transition-colors leading-tight">
              {player.name || player.full_name}
            </button>
            <VerificationBadge photoVerified={player.photo_verified} idVerified={player.id_verified} size="sm" />
            {isFriend && (
              <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full font-medium">Friend</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="w-3 h-3 text-primary flex-shrink-0" />
            <span className="truncate">{player.location || "Unknown"}</span>
            {dist !== null && dist !== undefined && (
              <span className="font-semibold text-foreground/70 flex-shrink-0">· {dist < 1 ? "<1" : Math.round(dist)} km</span>
            )}
          </p>
        </div>

        <div className="flex-shrink-0">
          <SocialButton
            currentUser={currentUser}
            targetUser={player}
            friendRequests={friendRequests}
            blockedList={blockedList || []}
            blockedMeList={blockedMeList || []}
            showMessage
            onMessage={onMessage}
          />
        </div>
      </div>

      {/* Stats section */}
      <div className="px-4 pb-3 space-y-2.5">
        {/* ELO + progress bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <span className="font-heading font-bold text-sm">{Math.round(elo)}</span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${eloTier.color}20`, color: eloTier.color }}>
                {eloTier.icon} {isNewPlayer ? "New Player" : eloTier.label}
              </span>
            </div>
          </div>
          <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${tierProgress}%`, backgroundColor: eloTier.color }}
            />
          </div>
        </div>

        {/* Win % + Matches + Star Rating in one row */}
        <div className="flex items-center gap-3 text-xs">
          {/* Win % */}
          <div className="flex items-center gap-1">
            <Trophy className="w-3 h-3 text-muted-foreground" />
            <span className="font-semibold text-foreground">
              {winPct !== null ? `${winPct}%` : "N/A"}
            </span>
            <span className="text-muted-foreground">win</span>
          </div>

          <span className="text-border">·</span>

          {/* Matches played */}
          <div className="flex items-center gap-1">
            <Users className="w-3 h-3 text-muted-foreground" />
            <span className="font-semibold text-foreground">{matchesPlayed}</span>
            <span className="text-muted-foreground">played</span>
          </div>

          <span className="text-border">·</span>

          {/* Star rating */}
          <div className="flex items-center gap-1">
            <Star className="w-3 h-3 fill-accent text-accent" />
            {ratingCount > 0 ? (
              <>
                <span className="font-semibold text-foreground">{avgRating.toFixed(1)}</span>
                <span className="text-muted-foreground">({ratingCount})</span>
              </>
            ) : (
              <span className="text-muted-foreground">No ratings</span>
            )}
          </div>
        </div>
      </div>

      {/* Why Recommended labels */}
      {reasons.length > 0 && (
        <div className="px-4 pb-3 flex items-center gap-1.5 flex-wrap">
          {reasons.map((r, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[10px] font-medium bg-primary/8 text-primary px-2 py-0.5 rounded-full border border-primary/15">
              {r.icon} {r.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function FriendCard({ friend, onView, onMessage, onInvite }) {
  return (
    <div className="p-4 bg-card rounded-2xl border border-border flex items-center gap-3 hover:border-primary/20 transition-all">
      <button onClick={onView} className="flex-shrink-0">
        <PlayerAvatar name={friend.name || friend.full_name} avatarUrl={friend.photo_url} size="md" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <button onClick={onView} className="font-heading font-semibold text-sm hover:text-primary truncate max-w-[120px]">
            {friend.name || friend.full_name}
          </button>
          <VerificationBadge photoVerified={friend.photo_verified} idVerified={friend.id_verified} size="sm" />
        </div>
        {friend.location && <p className="text-xs text-muted-foreground">📍 {friend.location}</p>}
        {friend.skill_label && <SkillBadge level={friend.skill_label} />}
      </div>
      <div className="flex gap-1.5 flex-shrink-0">
        <Button size="sm" className="h-8 rounded-xl text-xs px-3 gap-1" onClick={onMessage}>
          <MessageCircle className="w-3 h-3" /> Chat
        </Button>
        <Button size="sm" variant="outline" className="h-8 rounded-xl text-xs px-3" onClick={onInvite}>
          Invite
        </Button>
      </div>
    </div>
  );
}

function GamesEmptyState({ onInstant, onCreate }) {
  return (
    <div className="px-4 py-12 text-center">
      <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
      <p className="font-heading font-semibold text-base mb-1">No games found nearby</p>
      <p className="text-muted-foreground text-sm mb-6">Be the first to organise a Padel game!</p>
      <div className="flex gap-3 justify-center">
        <Button onClick={onInstant} className="rounded-xl gap-1.5 bg-accent hover:bg-accent/90 text-accent-foreground">
          <Zap className="w-4 h-4" /> Play Now
        </Button>
        <Button onClick={onCreate} variant="outline" className="rounded-xl gap-1.5">
          <Plus className="w-4 h-4" /> Create Match
        </Button>
      </div>
    </div>
  );
}