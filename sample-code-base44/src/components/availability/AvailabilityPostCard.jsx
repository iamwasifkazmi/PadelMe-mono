import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, MessageCircle, UserPlus, Send, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import PlayerAvatar from "@/components/PlayerAvatar";
import { formatDistanceToNow } from "date-fns";
import { createNotification } from "@/lib/notifications";

const TIME_LABEL = { now: "Available Now", "1h": "Next 1 hour", "2h": "Next 2 hours" };
const SKILL_COLOR = {
  beginner: "bg-green-100 text-green-700",
  intermediate: "bg-blue-100 text-blue-700",
  advanced: "bg-purple-100 text-purple-700",
  any: "bg-secondary text-secondary-foreground",
};

export default function AvailabilityPostCard({ post, currentUser, allUsers = [], onInvite }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);

  const isOwn = currentUser?.email === post.user_email;

  const { data: comments = [] } = useQuery({
    queryKey: ["availability-comments", post.id],
    queryFn: () => base44.entities.AvailabilityComment.filter({ post_id: post.id }, "created_date", 50),
    enabled: showComments,
  });

  const postOwner = allUsers.find(u => u.email === post.user_email);

  const handleComment = async () => {
    if (!commentText.trim() || posting) return;
    setPosting(true);
    await base44.entities.AvailabilityComment.create({
      post_id: post.id,
      user_email: currentUser.email,
      user_name: currentUser.full_name || currentUser.name,
      user_avatar: currentUser.photo_url || "",
      message: commentText.trim(),
    });
    // Notify post owner
    if (post.user_email !== currentUser.email) {
      createNotification({
        userEmail: post.user_email,
        type: "join",
        title: "Comment on your availability post",
        body: `${currentUser.full_name || currentUser.name}: "${commentText.trim().slice(0, 60)}"`,
        relatedUserEmail: currentUser.email,
        relatedUserName: currentUser.full_name || currentUser.name,
      }).catch(() => {});
    }
    setCommentText("");
    queryClient.invalidateQueries(["availability-comments", post.id]);
    setPosting(false);
  };

  const handleCancel = async () => {
    await base44.entities.AvailabilityPost.update(post.id, { status: "cancelled" });
    queryClient.invalidateQueries(["availability-posts"]);
  };

  const timeAgo = post.created_date
    ? formatDistanceToNow(new Date(post.created_date), { addSuffix: true })
    : "";

  const expiresIn = post.expires_at
    ? formatDistanceToNow(new Date(post.expires_at), { addSuffix: false })
    : null;

  const isExpired = post.expires_at && new Date(post.expires_at) < new Date();

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <button onClick={() => postOwner && navigate(`/player/${postOwner.id}`)}>
            <PlayerAvatar name={post.user_name} avatarUrl={post.user_avatar} size="md" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => postOwner && navigate(`/player/${postOwner.id}`)}
                className="font-heading font-semibold text-sm hover:text-primary transition-colors"
              >
                {post.user_name}
              </button>
              {isOwn && (
                <button onClick={handleCancel} className="text-muted-foreground hover:text-destructive transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{timeAgo}</p>
          </div>
        </div>

        {/* Status banner */}
        <div className="mt-3 flex items-center gap-2 p-3 bg-primary/8 border border-primary/20 rounded-xl">
          <span className="text-xl">🎾</span>
          <div className="flex-1 min-w-0">
            <p className="font-heading font-semibold text-sm text-primary">
              {post.user_name.split(" ")[0]} is available for a game!
            </p>
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                <Clock className="w-3 h-3" /> {TIME_LABEL[post.time_window] || post.time_window}
              </span>
              {post.skill_level && post.skill_level !== "any" && (
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${SKILL_COLOR[post.skill_level]}`}>
                  {post.skill_level.charAt(0).toUpperCase() + post.skill_level.slice(1)}
                </span>
              )}
              {post.match_type && post.match_type !== "any" && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                  {post.match_type === "singles" ? "Singles" : "Doubles"}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Location */}
        {post.location_name && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
            <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            {post.location_name}
            {expiresIn && !isExpired && (
              <span className="ml-auto text-[11px] text-muted-foreground">Expires in {expiresIn}</span>
            )}
          </p>
        )}

        {/* Note */}
        {post.note && (
          <p className="text-sm text-foreground mt-2 pl-1">{post.note}</p>
        )}
      </div>

      {/* Actions */}
      {!isOwn && (
        <div className="px-4 pb-3 flex items-center gap-2">
          <Button
            size="sm"
            className="gap-1.5 rounded-xl flex-1"
            onClick={() => onInvite && onInvite(post)}
          >
            <UserPlus className="w-3.5 h-3.5" /> Invite to Match
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 rounded-xl"
            onClick={() => setShowComments(s => !s)}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            {comments.length > 0 ? comments.length : ""}
            Comment
          </Button>
        </div>
      )}

      {isOwn && (
        <div className="px-4 pb-3 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 rounded-xl"
            onClick={() => setShowComments(s => !s)}
          >
            <MessageCircle className="w-3.5 h-3.5" /> Comments
          </Button>
        </div>
      )}

      {/* Comments section */}
      {showComments && (
        <div className="border-t border-border bg-muted/30 px-4 py-3 space-y-3">
          {comments.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">No comments yet. Say something!</p>
          )}
          {comments.map(c => (
            <div key={c.id} className="flex gap-2.5">
              <PlayerAvatar name={c.user_name} avatarUrl={c.user_avatar} size="sm" />
              <div className="bg-card rounded-xl px-3 py-2 flex-1">
                <p className="font-semibold text-xs mb-0.5">{c.user_name}</p>
                <p className="text-sm">{c.message}</p>
              </div>
            </div>
          ))}
          {/* Comment input */}
          <div className="flex gap-2 pt-1">
            <PlayerAvatar name={currentUser?.full_name} avatarUrl={currentUser?.photo_url} size="sm" />
            <div className="flex-1 flex gap-2">
              <input
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleComment()}
                placeholder="Say &quot;I'm in!&quot; or suggest a time..."
                className="flex-1 h-9 px-3 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                disabled={!commentText.trim() || posting}
                onClick={handleComment}
                className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}