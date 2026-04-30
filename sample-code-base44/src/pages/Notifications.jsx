import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Bell, UserPlus, MessageCircle, Swords, Trophy, CheckCircle2,
  AlertTriangle, Clock, Zap, MapPin, ShieldCheck, Star,
  RefreshCw, CalendarDays, Users, Check, Trash2, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";

// ── Icon + colour map ─────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  // Social
  friend_request:               { icon: UserPlus,       color: "bg-primary/10 text-primary",        label: "Friend Request" },
  friend_request_accepted:      { icon: UserPlus,       color: "bg-green-100 text-green-600",        label: "Friend Accepted" },
  friend_request_declined:      { icon: UserPlus,       color: "bg-muted text-muted-foreground",     label: "Friend Declined" },
  new_message:                  { icon: MessageCircle,  color: "bg-blue-100 text-blue-600",          label: "Message" },
  // Match
  match_invite:                 { icon: Swords,         color: "bg-primary/10 text-primary",        label: "Match Invite" },
  match_invite_accepted:        { icon: Swords,         color: "bg-green-100 text-green-600",        label: "Invite Accepted" },
  match_invite_declined:        { icon: Swords,         color: "bg-muted text-muted-foreground",     label: "Invite Declined" },
  match_starting_soon:          { icon: Clock,          color: "bg-accent/10 text-accent",           label: "Starting Soon" },
  match_started:                { icon: Zap,            color: "bg-accent/10 text-accent",           label: "Match Started" },
  match_found:                  { icon: Zap,            color: "bg-green-100 text-green-600",        label: "Match Found" },
  match_almost_full:            { icon: Users,          color: "bg-amber-100 text-amber-600",        label: "Almost Full" },
  match_cancelled:              { icon: AlertTriangle,  color: "bg-destructive/10 text-destructive", label: "Match Cancelled" },
  // Score
  score_submitted:              { icon: CheckCircle2,   color: "bg-blue-100 text-blue-600",          label: "Score Submitted" },
  score_validation_required:    { icon: AlertTriangle,  color: "bg-amber-100 text-amber-600",        label: "Confirm Score" },
  score_confirmed:              { icon: CheckCircle2,   color: "bg-green-100 text-green-600",        label: "Score Confirmed" },
  score_disputed:               { icon: AlertTriangle,  color: "bg-destructive/10 text-destructive", label: "Score Disputed" },
  score_overridden:             { icon: RefreshCw,      color: "bg-purple-100 text-purple-600",      label: "Score Override" },
  // Recurring
  recurring_match_upcoming:     { icon: CalendarDays,   color: "bg-primary/10 text-primary",        label: "Upcoming Match" },
  recurring_match_changed:      { icon: CalendarDays,   color: "bg-amber-100 text-amber-600",        label: "Match Changed" },
  recurring_match_cancelled:    { icon: CalendarDays,   color: "bg-destructive/10 text-destructive", label: "Recurring Cancelled" },
  // Competition
  tournament_invite:            { icon: Trophy,         color: "bg-amber-100 text-amber-600",        label: "Tournament Invite" },
  competition_invite:           { icon: Trophy,         color: "bg-amber-100 text-amber-600",        label: "League Invite" },
  tournament_registration_confirmed: { icon: Trophy,    color: "bg-green-100 text-green-600",        label: "Registered" },
  competition_registration_confirmed: { icon: Trophy,   color: "bg-green-100 text-green-600",        label: "Registered" },
  tournament_started:           { icon: Trophy,         color: "bg-accent/10 text-accent",           label: "Tournament Started" },
  league_fixture_available:     { icon: CalendarDays,   color: "bg-primary/10 text-primary",        label: "Fixture Ready" },
  competition_result_confirmed: { icon: CheckCircle2,   color: "bg-green-100 text-green-600",        label: "Result Confirmed" },
  // System
  verification_approved:        { icon: ShieldCheck,    color: "bg-green-100 text-green-600",        label: "Verified" },
  verification_rejected:        { icon: ShieldCheck,    color: "bg-destructive/10 text-destructive", label: "Verification Failed" },
  subscription_required:        { icon: Star,           color: "bg-amber-100 text-amber-600",        label: "Subscription" },
  subscription_success:         { icon: Star,           color: "bg-green-100 text-green-600",        label: "Subscribed" },
  // Legacy
  join:                         { icon: UserPlus,       color: "bg-primary/10 text-primary",        label: "Joined" },
  match_nearby:                 { icon: MapPin,         color: "bg-blue-100 text-blue-600",          label: "Nearby Match" },
  match_starting:               { icon: Clock,          color: "bg-accent/10 text-accent",           label: "Starting Soon" },
  rating_received:              { icon: Star,           color: "bg-purple-100 text-purple-600",      label: "Rating" },
};

function getConfig(type) {
  return TYPE_CONFIG[type] || { icon: Bell, color: "bg-muted text-muted-foreground", label: "Notification" };
}

// ── Date grouping ─────────────────────────────────────────────────────────────

function groupByDate(notifications) {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const groups = {};

  for (const n of notifications) {
    const d = new Date(n.created_date || Date.now()).toDateString();
    const label = d === today ? "Today" : d === yesterday ? "Yesterday" : new Date(n.created_date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
    if (!groups[label]) groups[label] = [];
    groups[label].push(n);
  }

  return Object.entries(groups);
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Notifications() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications", user?.email],
    queryFn: () =>
      base44.entities.Notification.filter({ user_email: user.email }, "-created_date", 100),
    enabled: !!user?.email,
    refetchInterval: 30000,
  });

  const unreadCount = useMemo(() => notifications.filter((n) => !n.is_read).length, [notifications]);
  const grouped = useMemo(() => groupByDate(notifications), [notifications]);

  const invalidate = () => {
    queryClient.invalidateQueries(["notifications"]);
    queryClient.invalidateQueries(["unread-notifications"]);
  };

  const handleTap = async (notif) => {
    if (!notif.is_read) {
      await base44.entities.Notification.update(notif.id, { is_read: true });
      invalidate();
    }
    // Resolve action URL
    const url = notif.action_url ||
      (notif.match_id ? `/match/${notif.match_id}` : null) ||
      (notif.related_entity_type === "match" ? `/match/${notif.related_entity_id}` : null) ||
      (notif.related_entity_type === "competition" ? `/competition/${notif.related_entity_id}` : null) ||
      (notif.related_entity_type === "conversation" ? `/conversation/${notif.related_entity_id}` : null) ||
      (notif.related_entity_type === "user" ? `/player/${notif.related_entity_id}` : null) ||
      (notif.type === "friend_request" || notif.type === "friend_request_accepted" ? "/friends" : null);

    if (url) navigate(url);
  };

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.is_read);
    await Promise.all(unread.map((n) => base44.entities.Notification.update(n.id, { is_read: true })));
    invalidate();
  };

  const deleteNotif = async (e, notif) => {
    e.stopPropagation();
    setDeletingId(notif.id);
    await base44.entities.Notification.delete(notif.id);
    invalidate();
    setDeletingId(null);
  };

  return (
    <div className="max-w-lg mx-auto min-h-screen bg-background">

      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/97 backdrop-blur-sm border-b border-border px-5 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading font-bold text-2xl">Notifications</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up 🎉"}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="text-primary text-xs gap-1.5 rounded-xl" onClick={markAllRead}>
              <Check className="w-3.5 h-3.5" /> Mark all read
            </Button>
          )}
        </div>
      </div>

      <div className="pb-8">
        {isLoading ? (
          <div className="px-5 pt-4 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-[72px] bg-card rounded-2xl animate-pulse border border-border" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Bell className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="font-heading font-bold text-lg mb-1">No notifications yet</p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Friend requests, match invites, scores, and more will appear here
            </p>
          </div>
        ) : (
          <div className="pt-2">
            <AnimatePresence>
              {grouped.map(([dateLabel, items]) => (
                <div key={dateLabel}>
                  {/* Date group header */}
                  <div className="px-5 py-2">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{dateLabel}</p>
                  </div>

                  <div className="px-4 space-y-1.5">
                    {items.map((notif, i) => {
                      const cfg = getConfig(notif.type);
                      const Icon = cfg.icon;
                      const isDeleting = deletingId === notif.id;

                      return (
                        <motion.div
                          key={notif.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: isDeleting ? 0 : 1, x: isDeleting ? 40 : 0, y: 0 }}
                          transition={{ delay: i * 0.03, duration: 0.2 }}
                          onClick={() => handleTap(notif)}
                          className={`relative flex items-start gap-3 p-3.5 rounded-2xl cursor-pointer transition-all active:scale-[0.98] group ${
                            notif.is_read
                              ? "bg-card hover:bg-secondary/50"
                              : "bg-card border border-primary/20 shadow-sm shadow-primary/5"
                          }`}
                        >
                          {/* Icon */}
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                            <Icon className="w-4.5 h-4.5 w-[18px] h-[18px]" />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0 pr-6">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <p className={`text-sm leading-tight ${notif.is_read ? "text-foreground" : "font-semibold text-foreground"}`}>
                                {notif.title}
                              </p>
                              {!notif.is_read && (
                                <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">NEW</span>
                              )}
                            </div>
                            <p className="text-muted-foreground text-xs mt-0.5 line-clamp-2 leading-relaxed">{notif.body}</p>
                            <p className="text-[11px] text-muted-foreground/70 mt-1">
                              {notif.created_date
                                ? formatDistanceToNow(new Date(notif.created_date), { addSuffix: true })
                                : "Just now"}
                            </p>
                          </div>

                          {/* Unread dot + chevron */}
                          <div className="absolute right-3.5 top-3.5 flex flex-col items-end gap-2">
                            {!notif.is_read && (
                              <div className="w-2 h-2 rounded-full bg-primary" />
                            )}
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                          </div>

                          {/* Delete button (appears on hover) */}
                          <button
                            onClick={(e) => deleteNotif(e, notif)}
                            className="absolute right-10 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-destructive/10"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                          </button>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </AnimatePresence>

            {/* Clear old / footer */}
            {notifications.length > 0 && (
              <div className="px-5 pt-6 pb-2 text-center">
                <p className="text-xs text-muted-foreground">Showing last 100 notifications</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}