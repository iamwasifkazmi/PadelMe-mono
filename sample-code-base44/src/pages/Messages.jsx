import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { MessageCircle, Search, Users, Trophy, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import PlayerAvatar from "../components/PlayerAvatar";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";

const TYPE_ICON = { direct: "👤", match: "🎾", competition: "🏆" };
const TYPE_LABEL = { direct: "DM", match: "Match", competition: "Competition" };

export default function Messages() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => { base44.auth.me().then(setUser); }, []);

  const { data: allUsers = [] } = useQuery({
    queryKey: ["all-users"],
    queryFn: () => base44.entities.User.list(),
    enabled: !!user,
  });

  const userMap = useMemo(() => Object.fromEntries(allUsers.map((u) => [u.email, u])), [allUsers]);

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["conversations", user?.email],
    queryFn: () => base44.entities.Conversation.list("-last_message_at", 100),
    enabled: !!user,
    refetchInterval: 10000,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["all-messages-unread", user?.email],
    queryFn: () => base44.entities.Message.list("-created_date", 500),
    enabled: !!user,
    refetchInterval: 10000,
  });

  // My conversations
  const myConversations = useMemo(() => {
    return conversations.filter((c) => c.participant_emails?.includes(user?.email));
  }, [conversations, user]);

  // Compute unread per conversation
  const unreadByConversation = useMemo(() => {
    const map = {};
    messages.forEach((m) => {
      if (m.sender_email !== user?.email && !(m.read_by || []).includes(user?.email)) {
        map[m.conversation_id] = (map[m.conversation_id] || 0) + 1;
      }
    });
    return map;
  }, [messages, user]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return myConversations.filter((c) => {
      const name = (c.entity_name || "").toLowerCase();
      return !q || name.includes(q);
    });
  }, [myConversations, search]);

  const totalUnread = Object.values(unreadByConversation).reduce((a, b) => a + b, 0);

  if (!user) return <div className="flex items-center justify-center h-96"><div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="px-5 pt-6 pb-3">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="font-heading font-bold text-2xl">Messages</h1>
            {totalUnread > 0 && <p className="text-xs text-muted-foreground">{totalUnread} unread</p>}
          </div>
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-primary" />
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-xl h-10 bg-card"
          />
        </div>
      </div>

      {/* Conversation List */}
      <div className="px-5 pb-24 space-y-2">
        {isLoading ? (
          [1,2,3].map((i) => <div key={i} className="h-20 bg-card rounded-2xl animate-pulse" />)
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          filtered.map((conv, idx) => (
            <ConversationRow
              key={conv.id}
              conv={conv}
              userMap={userMap}
              currentUser={user}
              unread={unreadByConversation[conv.id] || 0}
              idx={idx}
              onClick={() => navigate(`/conversation/${conv.id}`)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ConversationRow({ conv, userMap, currentUser, unread, idx, onClick }) {
  const isOtherUser = conv.type === "direct";
  const otherEmail = isOtherUser
    ? (conv.participant_emails || []).find((e) => e !== currentUser.email)
    : null;
  const otherUser = otherEmail ? userMap[otherEmail] : null;

  const displayName = isOtherUser
    ? (otherUser?.name || otherUser?.full_name || conv.entity_name || "Unknown")
    : conv.entity_name || "Chat";

  const avatar = isOtherUser && otherUser ? otherUser.photo_url : null;

  const lastMsgPreview = conv.last_message_text
    ? (conv.last_message_by === currentUser.email ? `You: ${conv.last_message_text}` : conv.last_message_text)
    : "No messages yet";

  const timeAgo = conv.last_message_at
    ? formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: false })
    : "";

  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.04 }}
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3.5 bg-card rounded-2xl border border-border hover:border-primary/30 hover:shadow-sm transition-all text-left"
    >
      {/* Avatar / Icon */}
      <div className="relative flex-shrink-0">
        {isOtherUser && otherUser ? (
          <PlayerAvatar name={displayName} avatarUrl={avatar} size="md" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-lg">
            {TYPE_ICON[conv.type] || "💬"}
          </div>
        )}
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold min-w-[16px] h-4 rounded-full flex items-center justify-center px-1">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className={`font-heading font-semibold text-sm truncate ${unread > 0 ? "text-foreground" : "text-foreground/80"}`}>
            {displayName}
          </span>
          <span className="text-[10px] text-muted-foreground flex-shrink-0 ml-2">{timeAgo}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-xs px-1.5 py-0.5 rounded-md ${
            conv.type === "direct" ? "bg-secondary text-secondary-foreground" :
            conv.type === "match" ? "bg-blue-100 text-blue-700" :
            "bg-amber-100 text-amber-700"
          }`}>
            {TYPE_LABEL[conv.type]}
          </span>
          <p className={`text-xs truncate ${unread > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
            {lastMsgPreview}
          </p>
        </div>
      </div>
    </motion.button>
  );
}

function EmptyState() {
  const navigate = useNavigate();
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
        <MessageCircle className="w-8 h-8 text-primary" />
      </div>
      <p className="font-heading font-bold text-lg mb-1">No conversations yet</p>
      <p className="text-muted-foreground text-sm mb-6">Message a friend or join a match to start chatting</p>
      <div className="flex gap-3 justify-center">
        <button onClick={() => navigate("/friends")} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-card border border-border text-sm font-medium hover:border-primary/40 transition-all">
          <Users className="w-4 h-4" /> Friends
        </button>
        <button onClick={() => navigate("/find-match")} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium">
          <Trophy className="w-4 h-4" /> Find Match
        </button>
      </div>
    </div>
  );
}