import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import {
  ArrowLeft, Mail, Phone, MessageCircle, Link2, Copy, Check,
  Send, Users, Clock, RefreshCw, ChevronDown, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

function generateToken() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const STATUS_COLORS = {
  created: "bg-gray-100 text-gray-600",
  sent: "bg-blue-100 text-blue-700",
  opened: "bg-purple-100 text-purple-700",
  joined: "bg-green-100 text-green-700",
  accepted: "bg-green-100 text-green-700",
  declined: "bg-red-100 text-red-600",
  expired: "bg-gray-100 text-gray-500",
};

export default function InvitePlayers() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const eventType = searchParams.get("type") || "match"; // match | competition | app
  const eventId = searchParams.get("id");
  const eventName = searchParams.get("name") || "Event";
  const eventDate = searchParams.get("date") || "";
  const eventTime = searchParams.get("time") || "";
  const eventLocation = searchParams.get("location") || "";

  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [pendingLink, setPendingLink] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  const { data: sentInvites = [], refetch: refetchInvites } = useQuery({
    queryKey: ["invites-sent", user?.email, eventId],
    queryFn: () => base44.entities.Invite.filter({ sender_email: user.email, event_id: eventId || null }, "-created_date", 50),
    enabled: !!user?.email,
  });

  const appUrl = window.location.origin;

  const buildInviteMessage = (token) => {
    const link = `${appUrl}/accept-invite?token=${token}`;
    let msg = `${user?.full_name || "Someone"} has invited you to join`;
    if (eventType === "match") msg += ` a padel match`;
    else if (eventType === "competition") msg += ` a tournament/league`;
    else msg += ` MatchPoint — the padel matchmaking app`;
    if (eventName && eventType !== "app") msg += ` — ${eventName}`;
    if (eventDate) msg += ` on ${eventDate}`;
    if (eventTime) msg += ` at ${eventTime}`;
    if (eventLocation) msg += ` in ${eventLocation}`;
    msg += `.\n\nTap here to join: ${link}`;
    return { link, msg };
  };

  const createInvite = async (channel, recipient = "") => {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const invite = await base44.entities.Invite.create({
      token,
      sender_email: user.email,
      sender_name: user.full_name,
      event_type: eventType,
      event_id: eventId || null,
      event_name: eventName,
      event_date: eventDate,
      event_time: eventTime,
      event_location: eventLocation,
      recipient_contact: recipient,
      channel,
      status: "created",
      expires_at: expiresAt,
    });
    refetchInvites();
    return { token, invite };
  };

  const markSent = async (inviteId) => {
    await base44.entities.Invite.update(inviteId, { status: "sent" });
    refetchInvites();
  };

  const handleCopyLink = async () => {
    setSending(true);
    const { token, invite } = await createInvite("link");
    const { link } = buildInviteMessage(token);
    await navigator.clipboard.writeText(link);
    await markSent(invite.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    setSending(false);
    toast({ title: "Link copied!", description: "Share it anywhere" });
  };

  const handleWhatsApp = async () => {
    setSending(true);
    const { token, invite } = await createInvite("whatsapp");
    const { msg } = buildInviteMessage(token);
    await markSent(invite.id);
    setSending(false);
    const encoded = encodeURIComponent(msg);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
    toast({ title: "Opening WhatsApp…", description: "Choose your contact in WhatsApp" });
  };

  const handleSendEmail = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Invalid email", variant: "destructive" });
      return;
    }
    // Check duplicate
    const existing = sentInvites.find(
      (i) => i.recipient_contact === email && i.status !== "expired" && i.status !== "declined"
    );
    if (existing) {
      toast({ title: "Already invited", description: `${email} was already invited`, variant: "destructive" });
      return;
    }
    setSending(true);
    const { token, invite } = await createInvite("email", email);
    const { msg, link } = buildInviteMessage(token);
    await markSent(invite.id);
    const subject = encodeURIComponent(`You're invited to join ${eventName || "a padel match"}`);
    const body = encodeURIComponent(msg);
    window.open(`mailto:${email}?subject=${subject}&body=${body}`, "_self");
    setEmail("");
    setSending(false);
    toast({ title: "Email invite ready", description: `Opening your email app for ${email}` });
  };

  const handleSendSMS = async () => {
    if (!phone || phone.replace(/\D/g, "").length < 9) {
      toast({ title: "Invalid phone number", variant: "destructive" });
      return;
    }
    const existing = sentInvites.find(
      (i) => i.recipient_contact === phone && i.status !== "expired" && i.status !== "declined"
    );
    if (existing) {
      toast({ title: "Already invited", description: `${phone} was already invited`, variant: "destructive" });
      return;
    }
    setSending(true);
    const { token, invite } = await createInvite("sms", phone);
    const { msg } = buildInviteMessage(token);
    await markSent(invite.id);
    const clean = phone.replace(/\s/g, "");
    const body = encodeURIComponent(msg);
    window.open(`sms:${clean}?body=${body}`, "_self");
    setPhone("");
    setSending(false);
    toast({ title: "SMS invite ready", description: `Opening SMS for ${phone}` });
  };

  const handleResend = async (invite) => {
    const { token, invite: newInvite } = await createInvite(invite.channel, invite.recipient_contact);
    const { msg, link } = buildInviteMessage(token);
    if (invite.channel === "whatsapp") {
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
    } else if (invite.channel === "email") {
      const subject = encodeURIComponent(`You're invited to join ${eventName}`);
      window.open(`mailto:${invite.recipient_contact}?subject=${subject}&body=${encodeURIComponent(msg)}`, "_self");
    } else if (invite.channel === "sms") {
      window.open(`sms:${invite.recipient_contact}?body=${encodeURIComponent(msg)}`, "_self");
    } else {
      await navigator.clipboard.writeText(link);
      toast({ title: "New link copied!" });
    }
    await markSent(newInvite.id);
    toast({ title: "Resent!", description: "New invite created and sent" });
  };

  if (!user) return (
    <div className="flex items-center justify-center h-96">
      <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-lg mx-auto pb-10">
      {/* Header */}
      <div className="px-5 pt-6 pb-2">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-muted-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <h1 className="font-heading font-bold text-xl">Invite Players</h1>
        {eventName && (
          <div className="mt-1 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-muted-foreground text-sm truncate">{eventName}</p>
            {eventDate && <span className="text-muted-foreground text-sm">· {eventDate}</span>}
            {eventTime && <span className="text-muted-foreground text-sm">{eventTime}</span>}
          </div>
        )}
      </div>

      <div className="px-5 space-y-5 mt-2">

        {/* Quick share buttons */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <h2 className="font-heading font-semibold text-sm text-muted-foreground uppercase tracking-wide">Quick Share</h2>
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={handleWhatsApp}
              disabled={sending}
              className="h-12 rounded-xl font-semibold gap-2 bg-[#25D366] hover:bg-[#20bc59] text-white"
            >
              <MessageCircle className="w-5 h-5" /> WhatsApp
            </Button>
            <Button
              onClick={handleCopyLink}
              disabled={sending}
              variant="outline"
              className="h-12 rounded-xl font-semibold gap-2"
            >
              {copied ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
              {copied ? "Copied!" : "Copy Link"}
            </Button>
          </div>
        </div>

        {/* Email */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <h2 className="font-heading font-semibold text-sm flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" /> Send via Email
          </h2>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="friend@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendEmail()}
              className="rounded-xl flex-1"
            />
            <Button onClick={handleSendEmail} disabled={sending || !email} className="rounded-xl gap-1 px-4">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* SMS */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <h2 className="font-heading font-semibold text-sm flex items-center gap-2">
            <Phone className="w-4 h-4 text-primary" /> Send via SMS
          </h2>
          <div className="flex gap-2">
            <Input
              type="tel"
              placeholder="+44 7700 900000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendSMS()}
              className="rounded-xl flex-1"
            />
            <Button onClick={handleSendSMS} disabled={sending || !phone} className="rounded-xl gap-1 px-4">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Invite history */}
        {sentInvites.length > 0 && (
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <button
              className="w-full flex items-center justify-between p-4"
              onClick={() => setShowHistory(!showHistory)}
            >
              <span className="font-heading font-semibold text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                Sent Invites ({sentInvites.length})
              </span>
              {showHistory ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </button>
            {showHistory && (
              <div className="px-4 pb-4 space-y-2">
                {sentInvites.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between gap-2 py-2 border-t border-border">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <ChannelIcon channel={inv.channel} />
                        <span className="text-sm font-medium truncate">
                          {inv.recipient_contact || inv.channel}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[inv.status] || ""}`}>
                          {inv.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {inv.created_date ? format(new Date(inv.created_date), "MMM d, h:mm a") : ""}
                        </span>
                      </div>
                    </div>
                    {(inv.status === "sent" || inv.status === "created" || inv.status === "expired") && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg h-7 text-xs gap-1"
                        onClick={() => handleResend(inv)}
                      >
                        <RefreshCw className="w-3 h-3" /> Resend
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ChannelIcon({ channel }) {
  if (channel === "whatsapp") return <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" />;
  if (channel === "email") return <Mail className="w-3.5 h-3.5 text-blue-500" />;
  if (channel === "sms") return <Phone className="w-3.5 h-3.5 text-purple-500" />;
  return <Link2 className="w-3.5 h-3.5 text-muted-foreground" />;
}