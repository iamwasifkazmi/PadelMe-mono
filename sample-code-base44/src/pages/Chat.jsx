import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ChatBubble from "../components/ChatBubble";

export default function Chat() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  const { data: match } = useQuery({
    queryKey: ["match-chat", matchId],
    queryFn: () => base44.entities.Match.filter({ id: matchId }, "-created_date", 1).then((r) => r[0]),
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["chat-messages", matchId],
    queryFn: () => base44.entities.ChatMessage.filter({ match_id: matchId }, "created_date", 100),
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!message.trim() || !user) return;
    setSending(true);
    await base44.entities.ChatMessage.create({
      match_id: matchId,
      sender_email: user.email,
      sender_name: user.full_name,
      message: message.trim(),
    });
    setMessage("");
    queryClient.invalidateQueries(["chat-messages", matchId]);
    setSending(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="max-w-lg mx-auto flex flex-col h-screen">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border bg-card flex items-center gap-3">
        <button onClick={() => navigate(`/match/${matchId}`)} className="text-muted-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="font-heading font-semibold text-sm">{match?.title || "Match Chat"}</h2>
          <p className="text-muted-foreground text-xs">
            {match?.players?.length || 0} players
          </p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-sm">No messages yet</p>
            <p className="text-muted-foreground text-xs mt-1">Say hi to your teammates! 👋</p>
          </div>
        )}
        {messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} isOwn={user?.email === msg.sender_email} />
        ))}
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border bg-card mb-16">
        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="rounded-xl h-11 bg-background"
          />
          <Button
            onClick={handleSend}
            disabled={!message.trim() || sending}
            size="icon"
            className="h-11 w-11 rounded-xl flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}