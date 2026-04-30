import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Search, Users, Star, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PlayerAvatar from "../components/PlayerAvatar";
import SkillBadge from "../components/SkillBadge";
import VerificationBadge from "../components/VerificationBadge";
import FriendButton from "../components/FriendButton";
import { motion } from "framer-motion";

const SPORTS = ["Padel", "Tennis", "Pickleball"];
const SKILL_LABELS = ["beginner", "intermediate", "advanced"];

export default function Players() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ sport: "", skill_label: "", verified_only: false });

  useEffect(() => { base44.auth.me().then(setUser); }, []);

  const { data: allUsers = [] } = useQuery({
    queryKey: ["all-users"],
    queryFn: () => base44.entities.User.list(),
    enabled: !!user,
  });

  const { data: friendRequests = [] } = useQuery({
    queryKey: ["friend-requests"],
    queryFn: () => base44.entities.FriendRequest.list("-created_date", 200),
    enabled: !!user,
  });

  const friendEmails = new Set(
    friendRequests
      .filter((r) => r.status === "accepted" && (r.requester_email === user?.email || r.recipient_email === user?.email))
      .map((r) => r.requester_email === user?.email ? r.recipient_email : r.requester_email)
  );

  const filtered = allUsers.filter((u) => {
    if (u.email === user?.email) return false;
    // Hide private profiles unless they're a friend
    if (u.profile_visibility === "private" && !friendEmails.has(u.email)) return false;
    const q = query.toLowerCase();
    if (q && !u.full_name?.toLowerCase().includes(q) && !u.location?.toLowerCase().includes(q)) return false;
    if (filters.sport && !u.sports?.includes(filters.sport)) return false;
    if (filters.skill_label && u.skill_label !== filters.skill_label) return false;
    if (filters.verified_only && !u.photo_verified && !u.id_verified) return false;
    return true;
  });

  const friends = filtered.filter((u) => friendEmails.has(u.email));
  const others = filtered.filter((u) => !friendEmails.has(u.email));
  const sorted = [...friends, ...others];

  return (
    <div className="max-w-lg mx-auto">
      <div className="px-5 pt-6 pb-3">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="font-heading font-bold text-2xl">Players</h1>
            <p className="text-muted-foreground text-sm">Find and connect with players</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/friends")} className="gap-1.5 rounded-xl">
            <Users className="w-4 h-4" /> Friends
          </Button>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or location..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 rounded-xl h-11 bg-card"
            />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
          <Button
            variant={showFilters ? "default" : "outline"}
            size="icon"
            className="h-11 w-11 rounded-xl flex-shrink-0"
            onClick={() => setShowFilters((p) => !p)}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </Button>
        </div>

        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-3 p-3 bg-card rounded-2xl border border-border space-y-3"
          >
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Sport</p>
              <div className="flex gap-2 flex-wrap">
                {SPORTS.map((s) => (
                  <button key={s} onClick={() => setFilters((f) => ({ ...f, sport: f.sport === s ? "" : s }))}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${filters.sport === s ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Skill</p>
              <div className="flex gap-2 flex-wrap">
                {SKILL_LABELS.map((s) => (
                  <button key={s} onClick={() => setFilters((f) => ({ ...f, skill_label: f.skill_label === s ? "" : s }))}
                    className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-all ${filters.skill_label === s ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">Verified only</p>
              <button
                onClick={() => setFilters((f) => ({ ...f, verified_only: !f.verified_only }))}
                className={`w-10 h-5 rounded-full transition-all relative ${filters.verified_only ? "bg-primary" : "bg-secondary"}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${filters.verified_only ? "left-5" : "left-0.5"}`} />
              </button>
            </div>
            <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setFilters({ sport: "", skill_label: "", verified_only: false })}>
              Clear filters
            </Button>
          </motion.div>
        )}
      </div>

      <div className="px-5 pb-8 space-y-3">
        {sorted.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">No players found</div>
        ) : (
          sorted.map((player, idx) => (
            <motion.div key={player.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}>
              <PlayerCard
                player={player}
                currentUser={user}
                friendRequests={friendRequests}
                isFriend={friendEmails.has(player.email)}
                onView={() => navigate(`/player/${player.id}`)}
                onInvite={() => navigate(`/invite?email=${player.email}`)}
              />
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}

function PlayerCard({ player, currentUser, friendRequests, isFriend, onView, onInvite }) {
  return (
    <div className="p-4 bg-card rounded-2xl border border-border hover:border-primary/30 transition-all">
      <div className="flex items-start gap-3">
        <button onClick={onView}>
          <PlayerAvatar name={player.name || player.full_name} avatarUrl={player.photo_url} size="md" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <button onClick={onView} className="font-heading font-semibold text-sm hover:text-primary transition-colors">
              {player.name || player.full_name}
            </button>
            {isFriend && <Badge variant="outline" className="text-[10px] text-primary border-primary/40 py-0 px-1.5">Friend</Badge>}
            <VerificationBadge photoVerified={player.photo_verified} idVerified={player.id_verified} size="sm" />
          </div>
          {player.location && <p className="text-xs text-muted-foreground mb-1.5">📍 {player.location}</p>}
          <div className="flex flex-wrap items-center gap-1.5">
            {player.skill_label && <SkillBadge level={player.skill_label} />}
            {player.average_rating > 0 && (
              <span className="flex items-center gap-0.5 text-xs">
                <Star className="w-3 h-3 fill-accent text-accent" />
                {player.average_rating?.toFixed(1)}
              </span>
            )}
            {player.sports?.slice(0, 2).map((s) => (
              <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 items-end">
          <FriendButton currentUser={currentUser} targetUser={player} friendRequests={friendRequests} />
          {isFriend && (
            <Button size="sm" variant="ghost" className="text-xs h-7 rounded-lg" onClick={onInvite}>
              Invite
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}