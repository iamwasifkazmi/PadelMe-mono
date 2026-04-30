import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Send, Users, Check } from "lucide-react";
import PlayerAvatar from "../components/PlayerAvatar";
import { format, isToday, isYesterday, formatDistanceToNow } from "date-fns";
import { markConversationRead } from "../lib/chat";

const TYPE_ICON = { direct: "👤", match: "🎾", competition: "🏆" };
const TYPE_LABEL = { match: "Match Chat", competition: "Competition Chat" };

// ── Active status helper ──────────────────────────────────────────────────────
function getActiveStatus(user) {
  if (!user?.last_active_at) return null;
  const diff = Date.now() - new Date(user.last_active_at).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 2) return { label: "Active now", color: "text-green-500" };
  if (minutes < 60) return { label: `Active ${minutes}m ago`, color: "text-muted-foreground" };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { label: `Active ${hours}h ago`, color: "text-muted-foreground" };
  if (hours < 48) return { label: "Active yesterday", color: "text-muted-foreground" };
  return null; // too long ago, don't show
}

// ── Message tick component ────────────────────────────────────────────────────
function MessageTicks({ status }) {
  if (!status || status === "sent") {
    // Single grey tick
    return (
      <span className="inline-flex ml-1 opacity-60">
        <Check className="w-3 h-3 text-muted-foreground" />
      </span>
    );
  }
  if (status === "delivered") {
    // Double grey ticks
    return (
      <span className="inline-flex ml-1 -space-x-1.5 opacity-60">
        <Check className="w-3 h-3 text-muted-foreground" />
        <Check className="w-3 h-3 text-muted-foreground" />
      </span>
    );
  }
  if (status === "read") {
    // Double blue ticks
    return (
      <span className="inline-flex ml-1 -space-x-1.5">
        <Check className="w-3 h-3 text-blue-400" />
        <Check className="w-3 h-3 text-blue-400" />
      </span>
    );
  }
  return null;
}

export default function ConversationView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      // Update last_active_at on mount
      if (u) {
        base44.auth.updateMe({ last_active_at: new Date().toISOString() }).catch(() => {});
      }
    });
  }, []);

  const { data: conversation } = useQuery({
    queryKey: ["conversation", id],
    queryFn: () => base44.entities.Conversation.filter({ id }, "-created_date", 1).then((r) => r[0]),
    enabled: !!id,
  });

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["messages", id],
    queryFn: () => base44.entities.Message.filter({ conversation_id: id }, "created_date", 300),
    enabled: !!id,
    refetchInterval: 3000,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ["all-users"],
    queryFn: () => base44.entities.User.list(),
    enabled: !!user,
    refetchInterval: 30000, // refresh for active status
  });

  const userMap = useMemo(() => Object.fromEntries(allUsers.map((u) => [u.email, u])), [allUsers]);

  // The other participant in a direct conversation
  const otherUser = useMemo(() => {
    if (!conversation || conversation.type !== "direct" || !user) return null;
    const otherEmail = (conversation.participant_emails || []).find((e) => e !== user.email);
    return userMap[otherEmail] || null;
  }, [conversation, user, userMap]);

  const activeStatus = useMemo(() => getActiveStatus(otherUser), [otherUser]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Mark as read when conversation is opened / new messages arrive
  useEffect(() => {
    if (user && id) {
      markConversationRead(id, user.email).then(() => {
        queryClient.invalidateQueries(["all-messages-unread"]);
        queryClient.invalidateQueries(["messages", id]);
      });
    }
  }, [id, user, messages.length]);

  // Real-time subscription for instant tick updates
  useEffect(() => {
    if (!id) return;
    const unsub = base44.entities.Message.subscribe(() => {
      queryClient.invalidateQueries(["messages", id]);
    });
    return unsub;
  }, [id, queryClient]);

  const handleSend = async () => {
    if (!text.trim() || sending || !user || !conversation) return;
    const msgText = text.trim();
    setText("");
    setSending(true);

    await base44.entities.Message.create({
      conversation_id: id,
      sender_email: user.email,
      sender_name: user.name || user.full_name,
      sender_avatar: user.photo_url || "",
      text: msgText,
      read_by: [user.email],
      status: "sent",
    });

    await base44.entities.Conversation.update(id, {
      last_message_text: msgText.slice(0, 100),
      last_message_at: new Date().toISOString(),
      last_message_by: user.email,
    });

    // Update own last_active_at
    base44.auth.updateMe({ last_active_at: new Date().toISOString() }).catch(() => {});

    queryClient.invalidateQueries(["messages", id]);
    queryClient.invalidateQueries(["conversations"]);
    setSending(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const displayName = useMemo(() => {
    if (!conversation) return "Chat";
    if (conversation.type === "direct") {
      return otherUser?.name || otherUser?.full_name || conversation.entity_name || "Direct Message";
    }
    return conversation.entity_name || "Group Chat";
  }, [conversation, otherUser]);

  const participantCount = conversation?.participant_emails?.length || 0;

  // Group messages by date
  const grouped = useMemo(() => {
    const groups = [];
    let lastDate = null;
    messages.forEach((msg) => {
      const d = new Date(msg.created_date);
      let label;
      if (isToday(d)) label = "Today";
      else if (isYesterday(d)) label = "Yesterday";
      else label = format(d, "EEE, MMM d");
      if (label !== lastDate) {
        groups.push({ type: "divider", label });
        lastDate = label;
      }
      groups.push({ type: "message", msg });
    });
    return groups;
  }, [messages]);

  if (!conversation || !user) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  const canSend = conversation.participant_emails?.includes(user.email);

  return (
    <div className="flex flex-col h-screen max-w-lg mx-auto bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm flex-shrink-0">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>

        {conversation.type === "direct" && otherUser ? (
          <div className="relative flex-shrink-0">
            <PlayerAvatar name={displayName} avatarUrl={otherUser.photo_url} size="sm" />
            {activeStatus?.color === "text-green-500" && (
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-card" />
            )}
          </div>
        ) : (
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-base flex-shrink-0">
            {TYPE_ICON[conversation.type] || "💬"}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="font-heading font-semibold text-sm truncate">{displayName}</p>
          <p className={`text-xs ${activeStatus ? activeStatus.color : "text-muted-foreground"}`}>
            {conversation.type === "direct"
              ? (activeStatus?.label || "Direct Message")
              : `${TYPE_LABEL[conversation.type] || "Group Chat"} · ${participantCount} members`}
          </p>
        </div>

        {conversation.type !== "direct" && (
          <button className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <Users className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : grouped.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-2xl mb-2">{TYPE_ICON[conversation.type]}</p>
            <p className="font-heading font-semibold text-sm mb-1">No messages yet</p>
            <p className="text-xs text-muted-foreground">Send the first message!</p>
          </div>
        ) : (
          grouped.map((item, i) => {
            if (item.type === "divider") {
              return (
                <div key={`div-${i}`} className="flex items-center gap-3 py-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] text-muted-foreground font-medium">{item.label}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              );
            }
            const { msg } = item;
            const isMine = msg.sender_email === user.email;
            const senderUser = userMap[msg.sender_email];
            const prevItem = i > 0 ? grouped[i - 1] : null;
            const prevMsg = prevItem?.type === "message" ? prevItem.msg : null;
            const showAvatar = !isMine && (!prevMsg || prevMsg.sender_email !== msg.sender_email);

            return (
              <MessageBubble
                key={msg.id}
                msg={msg}
                isMine={isMine}
                senderUser={senderUser}
                showAvatar={showAvatar}
                isGroup={conversation.type !== "direct"}
              />
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-border bg-card/80 backdrop-blur-sm">
        {canSend ? (
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                rows={1}
                className="w-full resize-none rounded-2xl border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring max-h-32 overflow-y-auto"
                style={{ minHeight: "42px" }}
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!text.trim() || sending}
              className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 flex-shrink-0 transition-all active:scale-95"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground py-2">You are not a participant in this conversation.</p>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ msg, isMine, senderUser, showAvatar, isGroup }) {
  const time = msg.created_date ? format(new Date(msg.created_date), "HH:mm") : "";
  const name = senderUser?.name || senderUser?.full_name || msg.sender_name;

  return (
    <div className={`flex items-end gap-2 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar placeholder for alignment */}
      {!isMine && (
        <div className="w-7 flex-shrink-0">
          {showAvatar && (
            <PlayerAvatar name={name} avatarUrl={senderUser?.photo_url || msg.sender_avatar} size="sm" />
          )}
        </div>
      )}

      <div className={`flex flex-col max-w-[75%] ${isMine ? "items-end" : "items-start"}`}>
        {isGroup && !isMine && showAvatar && (
          <span className="text-[10px] text-muted-foreground font-medium mb-1 ml-1">{name}</span>
        )}
        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
          isMine
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-card border border-border text-foreground rounded-bl-sm"
        }`}>
          {msg.text}
        </div>
        <div className={`flex items-center gap-0.5 mt-1 mx-1 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
          <span className="text-[10px] text-muted-foreground">{time}</span>
          {isMine && <MessageTicks status={msg.status} />}
        </div>
      </div>
    </div>
  );
}