import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Zap, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import AvailabilityPostCard from "./AvailabilityPostCard";
import SetAvailabilitySheet from "./SetAvailabilitySheet";
import { notifyMatchInvite } from "@/lib/notifications";

/**
 * AvailabilityFeed
 * Props:
 *   currentUser — authenticated user
 *   allUsers    — full user list for avatar lookups
 *   blockedEmails — Set of emails to hide
 *   maxItems    — optional cap (default: all)
 */
export default function AvailabilityFeed({ currentUser, allUsers = [], blockedEmails = new Set(), maxItems }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showSheet, setShowSheet] = useState(false);
  const [invitePost, setInvitePost] = useState(null);

  const { data: posts = [] } = useQuery({
    queryKey: ["availability-posts"],
    queryFn: () => base44.entities.AvailabilityPost.filter({ status: "active" }, "-created_date", 50),
    refetchInterval: 30000,
    enabled: !!currentUser,
  });

  // Filter expired client-side and blocked users
  const now = new Date();
  const visiblePosts = posts
    .filter(p => new Date(p.expires_at) > now)
    .filter(p => !blockedEmails.has(p.user_email))
    .slice(0, maxItems);

  const myActivePost = posts.find(p => p.user_email === currentUser?.email && new Date(p.expires_at) > now);

  const handleInvite = (post) => {
    // Navigate to create match with invite email pre-filled
    navigate(`/create-match?invite_email=${post.user_email}`);
  };

  const handleCancelMyPost = async () => {
    if (!myActivePost) return;
    await base44.entities.AvailabilityPost.update(myActivePost.id, { status: "cancelled" });
    queryClient.invalidateQueries(["availability-posts"]);
  };

  return (
    <div>
      {/* My availability CTA */}
      {myActivePost ? (
        <div className="flex items-center gap-3 p-3.5 bg-primary/8 border border-primary/20 rounded-2xl mb-4">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-primary">You're live in the feed!</p>
            <p className="text-xs text-muted-foreground">
              {myActivePost.time_window === "now" ? "Available now" : `Next ${myActivePost.time_window}`}
              {myActivePost.location_name ? ` · ${myActivePost.location_name}` : ""}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={handleCancelMyPost} className="rounded-xl gap-1 text-xs flex-shrink-0">
            <X className="w-3 h-3" /> Cancel
          </Button>
        </div>
      ) : (
        <button
          onClick={() => setShowSheet(true)}
          className="w-full flex items-center gap-3 p-3.5 bg-primary/8 border border-primary/20 rounded-2xl mb-4 text-left hover:bg-primary/12 transition-colors active:scale-[0.99]"
        >
          <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
            <Zap className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <p className="font-heading font-semibold text-sm text-primary">I'm Available to Play</p>
            <p className="text-xs text-muted-foreground">Tap to appear in the live feed</p>
          </div>
        </button>
      )}

      {/* Feed */}
      {visiblePosts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <p className="text-2xl mb-2">🎾</p>
          <p>No one nearby is available right now.</p>
          <p className="text-xs mt-1">Be the first to post!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visiblePosts.map(post => (
            <AvailabilityPostCard
              key={post.id}
              post={post}
              currentUser={currentUser}
              allUsers={allUsers}
              onInvite={handleInvite}
            />
          ))}
        </div>
      )}

      {showSheet && (
        <SetAvailabilitySheet
          user={currentUser}
          existingPost={myActivePost}
          onClose={() => setShowSheet(false)}
        />
      )}
    </div>
  );
}