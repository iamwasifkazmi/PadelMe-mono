import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import PlayerAvatar from "./PlayerAvatar";

export default function StatusFeed({ currentUser, friendEmails = new Set(), authorEmail = null }) {
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const queryClient = useQueryClient();

  const isOwnFeed = !authorEmail;

  const { data: statuses = [] } = useQuery({
    queryKey: ["statuses", authorEmail || "feed"],
    queryFn: () =>
      authorEmail
        ? base44.entities.UserStatus.filter({ author_email: authorEmail }, "-created_date", 10)
        : base44.entities.UserStatus.list("-created_date", 30),
    enabled: !!currentUser,
  });

  const visibleStatuses = statuses.filter((s) => {
    if (authorEmail) return true; // viewing someone's profile — show all their posts
    // feed: show own posts + friends
    return s.author_email === currentUser?.email || friendEmails.has(s.author_email);
  });

  const handlePost = async () => {
    if (!text.trim()) return;
    setPosting(true);
    await base44.entities.UserStatus.create({
      author_email: currentUser.email,
      author_name: currentUser.name || currentUser.full_name,
      content: text.trim(),
      visibility: "everyone",
    });
    setText("");
    queryClient.invalidateQueries(["statuses"]);
    setPosting(false);
  };

  const handleDelete = async (id) => {
    await base44.entities.UserStatus.delete(id);
    queryClient.invalidateQueries(["statuses"]);
  };

  const formatTime = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
      <p className="font-heading font-semibold text-sm mb-3">
        {isOwnFeed ? "📣 My Feed" : "📣 Updates"}
      </p>

      {/* Compose — only on own feed */}
      {isOwnFeed && (
        <div className="flex gap-2 mb-4">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handlePost()}
            placeholder="Share an update with your connections…"
            className="flex-1 h-10 px-3 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            maxLength={280}
          />
          <Button
            size="icon"
            className="h-10 w-10 rounded-xl flex-shrink-0"
            disabled={!text.trim() || posting}
            onClick={handlePost}
          >
            {posting ? (
              <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      )}

      {/* Posts */}
      {visibleStatuses.length === 0 ? (
        <p className="text-muted-foreground text-xs text-center py-4">
          {isOwnFeed ? "Post your first update above!" : "No updates yet."}
        </p>
      ) : (
        <div className="space-y-3">
          {visibleStatuses.map((s) => (
            <div key={s.id} className="flex gap-3">
              <PlayerAvatar name={s.author_name} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-xs">{s.author_name}</p>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-[10px] text-muted-foreground">{formatTime(s.created_date)}</span>
                    {s.author_email === currentUser?.email && (
                      <button onClick={() => handleDelete(s.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-sm mt-0.5 break-words">{s.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}