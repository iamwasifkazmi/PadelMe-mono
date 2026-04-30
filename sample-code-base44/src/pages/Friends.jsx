import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getOrCreateDirectConversation } from "../lib/chat";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Users, UserCheck, Clock, MessageCircle, Ban, Mail,
  Search, X, UserX, UserPlus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import PlayerAvatar from "../components/PlayerAvatar";
import SkillBadge from "../components/SkillBadge";
import VerificationBadge from "../components/VerificationBadge";
import ELODisplay, { RatingDisplay } from "../components/ELODisplay";
import SocialButton from "../components/SocialButton";
import { motion } from "framer-motion";
import { notifyFriendRequestAccepted } from "@/lib/notifications";
import { getFriendEmails, getPendingReceived, getPendingSent, getHiddenEmails } from "@/lib/relationships";

export default function Friends() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("friends");
  const [query, setQuery] = useState("");

  useEffect(() => { base44.auth.me().then(setUser); }, []);

  const { data: allUsers = [] } = useQuery({
    queryKey: ["all-users"],
    queryFn: () => base44.entities.User.list(),
    enabled: !!user,
  });

  const { data: friendRequests = [], refetch: refetchFriendRequests } = useQuery({
    queryKey: ["friend-requests"],
    queryFn: async () => {
      // Fetch both directions to ensure bidirectional friendship visibility
      const [sent, received] = await Promise.all([
        base44.entities.FriendRequest.filter({ requester_email: user.email }, "-created_date", 300),
        base44.entities.FriendRequest.filter({ recipient_email: user.email }, "-created_date", 300),
      ]);
      // Merge and deduplicate by id
      const map = new Map();
      [...sent, ...received].forEach(r => map.set(r.id, r));
      return Array.from(map.values());
    },
    enabled: !!user?.email,
    refetchInterval: 5000,
  });

  // Real-time subscription — instantly refresh when any FriendRequest changes
  useEffect(() => {
    if (!user) return;
    const unsub = base44.entities.FriendRequest.subscribe(() => {
      refetchFriendRequests();
    });
    return unsub;
  }, [user, refetchFriendRequests]);

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

  const userMap = useMemo(() =>
    Object.fromEntries(allUsers.map((u) => [u.email, u])), [allUsers]);

  const statsMap = useMemo(() =>
    Object.fromEntries(playerStats.map((s) => [s.user_email, s])), [playerStats]);

  const hiddenEmails = useMemo(() => getHiddenEmails(blockedList, blockedMeList), [blockedList, blockedMeList]);

  const friends = useMemo(() => {
    const emails = getFriendEmails(user?.email, friendRequests);
    return [...emails]
      .filter(email => !hiddenEmails.has(email))
      .map(email => userMap[email])
      .filter(Boolean);
  }, [friendRequests, user, userMap, hiddenEmails]);

  const pendingReceived = useMemo(() =>
    getPendingReceived(user?.email, friendRequests)
      .filter(r => !hiddenEmails.has(r.requester_email)),
  [friendRequests, user, hiddenEmails]);

  const pendingSent = useMemo(() =>
    getPendingSent(user?.email, friendRequests),
  [friendRequests, user]);

  const blockedUsers = useMemo(() =>
    blockedList.map((b) => userMap[b.blocked_email]).filter(Boolean),
  [blockedList, userMap]);

  const handleMessage = async (friend) => {
    const conv = await getOrCreateDirectConversation(user, friend);
    navigate(`/conversation/${conv.id}`);
  };

  const handleAccept = async (req) => {
    await base44.entities.FriendRequest.update(req.id, { status: "accepted" });
    notifyFriendRequestAccepted(req.requester_email, user).catch(() => {});

    // Pre-create the DM conversation so messaging is immediately available
    const sender = userMap[req.requester_email] || { email: req.requester_email, full_name: req.requester_name };
    getOrCreateDirectConversation(user, sender).catch(() => {});

    await queryClient.invalidateQueries(["friend-requests"]);
    await queryClient.refetchQueries(["friend-requests"]);
    setTab("friends");
  };

  const handleDecline = async (req) => {
    await base44.entities.FriendRequest.update(req.id, { status: "declined" });
    queryClient.invalidateQueries(["friend-requests"]);
  };

  const handleCancelRequest = async (req) => {
    await base44.entities.FriendRequest.delete(req.id);
    queryClient.invalidateQueries(["friend-requests"]);
  };

  const handleUnblock = async (blockedEmail) => {
    const entry = blockedList.find((b) => b.blocked_email === blockedEmail);
    if (entry) await base44.entities.BlockedUser.delete(entry.id);
    queryClient.invalidateQueries(["blocked-users", user?.email]);
  };

  const filterByQuery = (list) => {
    if (!query) return list;
    const q = query.toLowerCase();
    return list.filter((u) =>
      u?.full_name?.toLowerCase().includes(q) ||
      u?.location?.toLowerCase().includes(q)
    );
  };

  const filteredFriends = filterByQuery(friends);

  const tabs = [
    { id: "friends",  label: "Friends",  count: friends.length },
    { id: "requests", label: "Requests", count: pendingReceived.length },
    { id: "sent",     label: "Sent",     count: pendingSent.length },
    { id: "blocked",  label: "Blocked",  count: blockedUsers.length },
  ];

  return (
    <div className="max-w-lg mx-auto min-h-screen bg-background">

      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-4 pt-5 pb-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="font-heading font-bold text-xl">Friends</h1>
          <button
            onClick={() => navigate("/messages")}
            className="flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-full"
          >
            <MessageCircle className="w-3.5 h-3.5" /> Messages
          </button>
        </div>

        {/* Search (friends tab only) */}
        {tab === "friends" && (
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              placeholder="Search friends..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-10 pl-9 pr-8 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setQuery(""); }}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                tab === t.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground"
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-bold ${
                  tab === t.id ? "bg-white/25" : "bg-primary/15 text-primary"
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pb-10 pt-3 space-y-3">

        {/* ── FRIENDS TAB ── */}
        {tab === "friends" && (
          <>
            {filteredFriends.length === 0 ? (
              <SocialEmpty
                icon={Users}
                title={query ? "No friends match your search" : "No friends yet"}
                description={query ? "Try a different name" : "Find players and add them as friends"}
                action={!query && { label: "Find Players", onClick: () => navigate("/find-match?tab=players") }}
              />
            ) : (
              filteredFriends.map((friend, idx) => (
                <motion.div key={friend.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}>
                  <div className="p-4 bg-card rounded-2xl border border-border flex items-center gap-3">
                    <button onClick={() => navigate(`/player/${friend.id}`)} className="flex-shrink-0">
                      <PlayerAvatar name={friend.name || friend.full_name} avatarUrl={friend.photo_url} size="md" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <button onClick={() => navigate(`/player/${friend.id}`)} className="font-heading font-semibold text-sm hover:text-primary truncate">
                          {friend.name || friend.full_name}
                        </button>
                        <VerificationBadge photoVerified={friend.photo_verified} idVerified={friend.id_verified} size="sm" />
                      </div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <ELODisplay elo={statsMap[friend.email]?.elo_rating || 1000} size="sm" showBar={false} />
                        {statsMap[friend.email]?.average_rating > 0 && (
                          <RatingDisplay rating={statsMap[friend.email].average_rating} count={statsMap[friend.email].total_ratings} size="sm" />
                        )}
                      </div>
                      {friend.location && <p className="text-xs text-muted-foreground">📍 {friend.location}</p>}
                    </div>
                    <div className="flex flex-col gap-1.5 items-end flex-shrink-0">
                      <Button size="sm" className="h-8 rounded-xl text-xs gap-1 px-3" onClick={() => handleMessage(friend)}>
                        <MessageCircle className="w-3 h-3" /> Chat
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 rounded-xl text-xs gap-1 px-3" onClick={() => navigate(`/invite?email=${friend.email}`)}>
                        <Mail className="w-3 h-3" /> Invite
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </>
        )}

        {/* ── REQUESTS TAB ── */}
        {tab === "requests" && (
          <>
            {pendingReceived.length === 0 ? (
              <SocialEmpty icon={UserCheck} title="No pending requests" description="Friend requests from other players will appear here" />
            ) : (
              pendingReceived.map((req, idx) => {
                const sender = userMap[req.requester_email] || {
                  id: req.requester_email,
                  email: req.requester_email,
                  full_name: req.requester_name || req.requester_email,
                };
                if (!sender) return null;
                return (
                  <motion.div key={req.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}>
                    <div className="p-4 bg-card rounded-2xl border border-border flex items-center gap-3">
                      <button onClick={() => navigate(`/player/${sender.id}`)} className="flex-shrink-0">
                        <PlayerAvatar name={sender.name || sender.full_name} avatarUrl={sender.photo_url} size="md" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <button onClick={() => navigate(`/player/${sender.id}`)} className="font-heading font-semibold text-sm hover:text-primary">
                          {sender.name || sender.full_name}
                        </button>
                        {sender.location && <p className="text-xs text-muted-foreground">📍 {sender.location}</p>}
                        {sender.skill_label && <SkillBadge level={sender.skill_label} />}
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <Button size="sm" className="rounded-xl h-8 px-3" onClick={() => handleAccept(req)}>Accept</Button>
                        <Button size="sm" variant="outline" className="rounded-xl h-8 px-2" onClick={() => handleDecline(req)}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </>
        )}

        {/* ── SENT TAB ── */}
        {tab === "sent" && (
          <>
            {pendingSent.length === 0 ? (
              <SocialEmpty icon={Clock} title="No sent requests" description="Requests you've sent will appear here" />
            ) : (
              pendingSent.map((req, idx) => {
                const recipient = userMap[req.recipient_email];
                if (!recipient) return null;
                return (
                  <motion.div key={req.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}>
                    <div className="p-4 bg-card rounded-2xl border border-border flex items-center gap-3">
                      <PlayerAvatar name={recipient.name || recipient.full_name} avatarUrl={recipient.photo_url} size="md" />
                      <div className="flex-1 min-w-0">
                        <p className="font-heading font-semibold text-sm">{recipient.name || recipient.full_name}</p>
                        {recipient.location && <p className="text-xs text-muted-foreground">📍 {recipient.location}</p>}
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                          <Clock className="w-3 h-3" /> Pending
                        </span>
                      </div>
                      <Button size="sm" variant="outline" className="rounded-xl h-8 px-3 text-xs" onClick={() => handleCancelRequest(req)}>
                        Cancel
                      </Button>
                    </div>
                  </motion.div>
                );
              })
            )}
          </>
        )}

        {/* ── BLOCKED TAB ── */}
        {tab === "blocked" && (
          <>
            {blockedUsers.length === 0 ? (
              <SocialEmpty icon={Ban} title="No blocked users" description="Users you block will appear here" />
            ) : (
              blockedUsers.map((blocked, idx) => (
                <motion.div key={blocked.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}>
                  <div className="p-4 bg-card rounded-2xl border border-border flex items-center gap-3">
                    <PlayerAvatar name={blocked.name || blocked.full_name} avatarUrl={blocked.photo_url} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="font-heading font-semibold text-sm">{blocked.name || blocked.full_name}</p>
                      {blocked.location && <p className="text-xs text-muted-foreground">📍 {blocked.location}</p>}
                    </div>
                    <Button
                      size="sm" variant="outline"
                      className="rounded-xl h-8 px-3 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/5 flex-shrink-0"
                      onClick={() => handleUnblock(blocked.email)}
                    >
                      <Ban className="w-3 h-3" /> Unblock
                    </Button>
                  </div>
                </motion.div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SocialEmpty({ icon: Icon, title, description, action }) {
  const navigate = useNavigate();
  return (
    <div className="text-center py-14">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
        <Icon className="w-5 h-5 text-muted-foreground" />
      </div>
      <p className="font-heading font-semibold mb-1">{title}</p>
      <p className="text-muted-foreground text-sm mb-4">{description}</p>
      {action && (
        <Button variant="outline" onClick={action.onClick || (() => navigate("/find-match?tab=players"))} className="rounded-xl gap-1.5">
          <UserPlus className="w-4 h-4" /> {action.label}
        </Button>
      )}
    </div>
  );
}