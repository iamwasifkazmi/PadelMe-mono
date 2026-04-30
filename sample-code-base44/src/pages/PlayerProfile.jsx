import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, MapPin, Star, Trophy, Activity, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PlayerAvatar from "../components/PlayerAvatar";
import SkillBadge from "../components/SkillBadge";
import VerificationBadge from "../components/VerificationBadge";
import { getELOTier } from "../lib/elo";
import SocialButton from "../components/SocialButton";
import StatusFeed from "../components/StatusFeed";
import { motion } from "framer-motion";
import { getOrCreateDirectConversation } from "../lib/chat";

export default function PlayerProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => { base44.auth.me().then(setCurrentUser); }, []);

  const { data: allUsers = [] } = useQuery({
    queryKey: ["all-users"],
    queryFn: () => base44.entities.User.list(),
    enabled: !!currentUser,
  });

  const player = allUsers.find((u) => u.id === id);



  const { data: ratings = [] } = useQuery({
    queryKey: ["player-ratings", player?.email],
    queryFn: () => base44.entities.Rating.filter({ rated_email: player.email, is_revealed: true }, "-created_date", 20),
    enabled: !!player?.email,
  });

  const { data: blockedList = [] } = useQuery({
    queryKey: ["blocked-users", currentUser?.email],
    queryFn: () => base44.entities.BlockedUser.filter({ blocker_email: currentUser.email }),
    enabled: !!currentUser?.email,
  });

  const { data: blockedMeList = [] } = useQuery({
    queryKey: ["blocked-me", currentUser?.email],
    queryFn: () => base44.entities.BlockedUser.filter({ blocked_email: currentUser.email }),
    enabled: !!currentUser?.email,
  });

  const { data: friendRequests = [] } = useQuery({
    queryKey: ["friend-requests"],
    queryFn: async () => {
      if (!currentUser?.email) return [];
      const [sent, received] = await Promise.all([
        base44.entities.FriendRequest.filter({ requester_email: currentUser.email }, "-created_date", 300),
        base44.entities.FriendRequest.filter({ recipient_email: currentUser.email }, "-created_date", 300),
      ]);
      const map = new Map();
      [...sent, ...received].forEach(r => map.set(r.id, r));
      return Array.from(map.values());
    },
    enabled: !!currentUser?.email,
  });

  const { data: playerStats } = useQuery({
    queryKey: ["player-stats", player?.email],
    queryFn: () => base44.entities.PlayerStats.filter({ user_email: player.email }, "-created_date", 1).then(r => r[0]),
    enabled: !!player?.email,
  });

  const { data: ratingSummary } = useQuery({
    queryKey: ["rating-summary", player?.email],
    queryFn: () => base44.entities.PlayerRatingSummary.filter({ user_email: player.email }, "-created_date", 1).then(r => r[0]),
    enabled: !!player?.email,
  });

  const isBlocked = blockedList.some((b) => b.blocked_email === player?.email);

  const handleMessage = useCallback(async () => {
    if (!currentUser || !player) return;
    const conv = await getOrCreateDirectConversation(currentUser, player);
    navigate(`/conversation/${conv.id}`);
  }, [currentUser, player, navigate]);

  if (!player) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-16 text-center">
        <div className="w-12 h-12 bg-card rounded-full animate-pulse mx-auto mb-4" />
        <p className="text-muted-foreground text-sm">Loading profile…</p>
      </div>
    );
  }

  const isOwn = currentUser?.email === player.email;

  // Check if this is a private profile the viewer can't fully access
  const isFriend = friendRequests.some(
    (r) => r.status === "accepted" &&
      ((r.requester_email === currentUser?.email && r.recipient_email === player.email) ||
       (r.recipient_email === currentUser?.email && r.requester_email === player.email))
  );
  const isPrivateAndNotConnected = player.profile_visibility === "private" && !isOwn && !isFriend && currentUser?.role !== "admin";

  if (isPrivateAndNotConnected) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="px-5 pt-6 pb-3">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-muted-foreground mb-4">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </div>
        <div className="px-5 space-y-4">
          <div className="bg-card rounded-2xl border border-border p-6 text-center space-y-4">
            <PlayerAvatar name={player.name || player.full_name} avatarUrl={player.photo_url} size="xl" />
            <div>
              <h1 className="font-heading font-bold text-xl">{player.name || player.full_name}</h1>
              {player.location && <p className="text-sm text-muted-foreground">📍 {player.location}</p>}
            </div>
            <div className="flex items-center justify-center gap-2 py-3 px-4 bg-muted/50 rounded-xl">
              <span className="text-2xl">🔒</span>
              <div className="text-left">
                <p className="font-semibold text-sm">This profile is private</p>
                <p className="text-xs text-muted-foreground">Connect to see their full profile</p>
              </div>
            </div>
            <SocialButton currentUser={currentUser} targetUser={player} friendRequests={friendRequests} blockedList={blockedList} blockedMeList={blockedMeList} />
          </div>
        </div>
      </div>
    );
  }
  const winRate = player.matches_played > 0
    ? Math.round(((player.wins || 0) / player.matches_played) * 100)
    : null;

  const tagCounts = ratings.reduce((acc, r) => {
    r.tags?.forEach((t) => { acc[t] = (acc[t] || 0) + 1; });
    return acc;
  }, {});
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);

  return (
    <div className="max-w-lg mx-auto">
      <div className="px-5 pt-6 pb-3">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-muted-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="px-5 pb-10 space-y-5">
        {/* Header */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <div className="flex items-start gap-4">
            <PlayerAvatar name={player.name || player.full_name} avatarUrl={player.photo_url} size="xl" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h1 className="font-heading font-bold text-xl">{player.name || player.full_name}</h1>
                <VerificationBadge photoVerified={player.photo_verified} idVerified={player.id_verified} />
              </div>
              {player.location && (
                <p className="text-sm text-muted-foreground flex items-center gap-1 mb-2">
                  <MapPin className="w-3.5 h-3.5" /> {player.location}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {player.skill_label && <SkillBadge level={player.skill_label} />}
                {player.sports?.map((s) => (
                  <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                ))}
              </div>
              {!isOwn && (
                <div className="flex flex-wrap gap-2 items-center">
                  <SocialButton
                    currentUser={currentUser}
                    targetUser={player}
                    friendRequests={friendRequests}
                    blockedList={blockedList}
                    blockedMeList={blockedMeList}
                    showMessage
                    onMessage={handleMessage}
                  />
                  <Button size="sm" variant="outline" className="gap-1.5 rounded-lg"
                    onClick={() => navigate(`/invite?email=${player.email}`)}>
                    <Mail className="w-3.5 h-3.5" /> Invite
                  </Button>
                </div>
              )}
              {isOwn && (
                <Button size="sm" variant="outline" className="rounded-lg" onClick={() => navigate("/edit-profile")}>
                  Edit Profile
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* ELO + Star Rating Card */}
        {(() => {
          const elo = playerStats?.elo_rating || 1000;
          const tier = getELOTier(elo);
          const tierProgress = Math.min(100, ((elo - tier.min) / (tier.max === Infinity ? 400 : tier.max - tier.min)) * 100);
          const isNew = !playerStats || (playerStats.matches_played || 0) === 0;
          const avgRating = ratingSummary?.average_rating || 0;
          const ratingCount = ratingSummary?.total_ratings || 0;

          return (
            <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
              {/* ELO Section */}
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Skill Rating</p>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-heading font-bold text-lg">{Math.round(elo)}</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: `${tier.color}20`, color: tier.color }}>
                      {tier.icon} {isNew ? "New Player" : tier.label}
                    </span>
                  </div>
                </div>
                <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-2 rounded-full transition-all duration-500"
                    style={{ width: `${tierProgress}%`, backgroundColor: tier.color }}
                  />
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-border" />

              {/* Star Rating Section */}
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Player Rating</p>
                {ratingCount > 0 ? (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`w-4 h-4 ${i < Math.round(avgRating) ? "fill-accent text-accent" : "text-muted-foreground/30"}`} />
                      ))}
                    </div>
                    <span className="font-heading font-bold text-sm">{avgRating.toFixed(1)}</span>
                    <span className="text-xs text-muted-foreground">· {ratingCount} rating{ratingCount !== 1 ? "s" : ""}</span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No ratings yet</p>
                )}
              </div>
            </div>
          );
        })()}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={Activity} label="Matches" value={player.matches_played || 0} />
          <StatCard icon={Trophy} label="Wins" value={player.wins || 0} />
          <StatCard icon={Star} label="Win Rate" value={winRate !== null ? `${winRate}%` : "—"} />
        </div>

        {/* Rating */}
        {player.average_rating > 0 && (
          <div className="bg-card rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="font-heading font-semibold text-sm">Rating</p>
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 fill-accent text-accent" />
                <span className="font-bold">{player.average_rating.toFixed(1)}</span>
                <span className="text-muted-foreground text-xs">/ 5</span>
              </div>
            </div>
            {topTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {topTags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs capitalize">
                    {tag.replaceAll("_", " ")}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Bio */}
        {player.bio && (
          <div className="bg-card rounded-2xl border border-border p-4">
            <p className="font-heading font-semibold text-sm mb-2">About</p>
            <p className="text-sm text-muted-foreground">{player.bio}</p>
          </div>
        )}

        {/* Play Style */}
        {(player.match_type_preference || player.availability_days?.length > 0 || player.tags?.length > 0) && (
          <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
            <p className="font-heading font-semibold text-sm">Play Style</p>
            {player.match_type_preference && (
              <InfoRow label="Prefers" value={player.match_type_preference} />
            )}
            {player.availability_days?.length > 0 && (
              <InfoRow label="Available" value={player.availability_days.map((d) => d.slice(0, 3)).join(", ")} />
            )}
            {player.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {player.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recent Ratings */}
        {ratings.length > 0 && (
          <div className="bg-card rounded-2xl border border-border p-4">
            <p className="font-heading font-semibold text-sm mb-3">Recent Reviews</p>
            <div className="space-y-3">
              {ratings.slice(0, 3).map((r) => (
                <div key={r.id} className="border-b border-border last:border-0 pb-3 last:pb-0">
                  <div className="flex items-center gap-1 mb-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`w-3 h-3 ${i < r.overall ? "fill-accent text-accent" : "text-muted"}`} />
                    ))}
                  </div>
                  {r.comment && <p className="text-xs text-muted-foreground">"{r.comment}"</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Status feed */}
        {!isBlocked && (
          <StatusFeed currentUser={currentUser} authorEmail={player.email} />
        )}

        {isBlocked && (
          <div className="bg-muted/40 rounded-2xl p-5 text-center">
            <p className="text-sm text-muted-foreground">You have blocked this user. Use the ⋯ menu above to unblock.</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4 text-center">
      <Icon className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
      <p className="font-heading font-bold text-xl">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium capitalize">{value}</span>
    </div>
  );
}