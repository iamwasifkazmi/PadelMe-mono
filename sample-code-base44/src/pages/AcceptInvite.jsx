import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { CheckCircle, XCircle, Users, MapPin, Calendar, Clock, Trophy, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { notifyFriendRequest } from "@/lib/notifications";

export default function AcceptInvite() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get("token");

  const [invite, setInvite] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(false);
  const [done, setDone] = useState(null); // "accepted" | "declined"
  const [error, setError] = useState(null);

  useEffect(() => {
    const init = async () => {
      try {
        const u = await base44.auth.me();
        setUser(u);
      } catch {
        // not logged in — that's fine
      }

      if (!token) {
        setError("Invalid invite link.");
        setLoading(false);
        return;
      }

      // Persist token for post-auth redirect
      localStorage.setItem("invite_token_pending", token);

      const results = await base44.entities.Invite.filter({ token }, "-created_date", 1);
      const inv = results[0];

      if (!inv) {
        setError("This invite link is not valid.");
        setLoading(false);
        return;
      }

      if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
        await base44.entities.Invite.update(inv.id, { status: "expired" });
        setError("This invite has expired.");
        setLoading(false);
        return;
      }

      if (inv.status === "sent" || inv.status === "created") {
        await base44.entities.Invite.update(inv.id, { status: "opened" });
      }

      // If this is an app/friend invite and the user is already logged in,
      // ensure a FriendRequest exists immediately so it shows in their Requests tab.
      let currentUser = null;
      try { currentUser = await base44.auth.me(); } catch { /* not logged in */ }
      if (currentUser && inv.event_type === "app" && inv.sender_email && inv.sender_email !== currentUser.email) {
        const existing = await base44.entities.FriendRequest.filter({
          requester_email: inv.sender_email,
          recipient_email: currentUser.email,
        });
        const existingReverse = await base44.entities.FriendRequest.filter({
          requester_email: currentUser.email,
          recipient_email: inv.sender_email,
        });
        if ((!existing || existing.length === 0) && (!existingReverse || existingReverse.length === 0)) {
          await base44.entities.FriendRequest.create({
            requester_email: inv.sender_email,
            requester_name: inv.sender_name || inv.sender_email,
            recipient_email: currentUser.email,
            recipient_name: currentUser.full_name || currentUser.email,
            status: "pending",
          });
          notifyFriendRequest(currentUser.email, { email: inv.sender_email, full_name: inv.sender_name }).catch(() => {});
        }
      }

      setInvite({ ...inv, status: inv.status === "created" || inv.status === "sent" ? "opened" : inv.status });
      setLoading(false);
    };

    init();
  }, [token]);

  const handleSignIn = () => {
    // Preserve full invite URL as the post-login redirect
    base44.auth.redirectToLogin(`/accept-invite?token=${token}`);
  };

  const handleAccept = async () => {
    setResponding(true);
    await base44.entities.Invite.update(invite.id, {
      status: "accepted",
      accepted_at: new Date().toISOString(),
    });
    localStorage.removeItem("invite_token_pending");

    // For app invites (friend invites), create a real FriendRequest so the
    // sender appears in the recipient's Requests tab and the friendship can be formed.
    if (invite.event_type === "app" && user && invite.sender_email && invite.sender_email !== user.email) {
      // Check no duplicate request already exists
      const existing = await base44.entities.FriendRequest.filter({
        requester_email: invite.sender_email,
        recipient_email: user.email,
      });
      if (!existing || existing.length === 0) {
        // Also check reverse direction
        const existingReverse = await base44.entities.FriendRequest.filter({
          requester_email: user.email,
          recipient_email: invite.sender_email,
        });
        if (!existingReverse || existingReverse.length === 0) {
          await base44.entities.FriendRequest.create({
            requester_email: invite.sender_email,
            requester_name: invite.sender_name || invite.sender_email,
            recipient_email: user.email,
            recipient_name: user.full_name || user.email,
            status: "pending",
          });
          // Notify the invited user that they have a friend request
          notifyFriendRequest(user.email, { email: invite.sender_email, full_name: invite.sender_name }).catch(() => {});
        }
      }
    }

    if (invite.event_type === "match" && invite.event_id) {
      navigate(`/match/${invite.event_id}`);
    } else if (invite.event_type === "competition" && invite.event_id) {
      navigate(`/competition/${invite.event_id}`);
    } else {
      setDone("accepted");
    }
    setResponding(false);
  };

  const handleDecline = async () => {
    setResponding(true);
    await base44.entities.Invite.update(invite.id, { status: "declined" });
    localStorage.removeItem("invite_token_pending");
    setDone("declined");
    setResponding(false);
  };

  // ── LOADING ──
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // ── ERROR ──
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-background">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <XCircle className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="font-heading font-bold text-xl mb-2">Invite Unavailable</h2>
        <p className="text-muted-foreground text-sm mb-6">{error}</p>
        <Button onClick={() => navigate("/")} className="w-full max-w-xs rounded-xl h-12">Back to MatchPoint</Button>
      </div>
    );
  }

  // ── ACCEPTED ──
  if (done === "accepted") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-background">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5 }}>
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-4">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
        </motion.div>
        <h2 className="font-heading font-bold text-2xl mb-2">You're in! 🎉</h2>
        <p className="text-muted-foreground text-sm mb-6">You've joined {invite?.event_name || "the event"}.</p>
        <Button onClick={() => navigate("/")} className="w-full max-w-xs rounded-xl h-12">Go to Home</Button>
      </div>
    );
  }

  // ── DECLINED ──
  if (done === "declined") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-background">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <XCircle className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="font-heading font-bold text-xl mb-2">Maybe next time</h2>
        <p className="text-muted-foreground text-sm mb-6">You've declined this invite.</p>
        <Button onClick={() => navigate("/")} variant="outline" className="w-full max-w-xs rounded-xl h-12">Go to Home</Button>
      </div>
    );
  }

  const isAlreadyResponded = invite?.status === "accepted" || invite?.status === "declined";
  const eventTypeLabel = invite?.event_type === "competition" ? "Tournament" : "Match";
  const eventIcon = invite?.event_type === "competition" ? Trophy : Users;
  const EventIcon = eventIcon;

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 via-background to-background flex flex-col">
      {/* Top brand bar */}
      <div className="flex items-center justify-center pt-8 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-heading font-bold text-base text-foreground">MatchPoint</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-5 py-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-sm"
        >
          {/* Invite hero */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-3">
              <EventIcon className="w-8 h-8 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground mb-1">
              <span className="font-semibold text-foreground">{invite?.sender_name || "Someone"}</span> invited you to a {eventTypeLabel}
            </p>
            <h1 className="font-heading font-bold text-2xl leading-tight">
              {invite?.event_name || "Join the game"}
            </h1>
          </div>

          {/* Event details */}
          {(invite?.event_date || invite?.event_time || invite?.event_location) && (
            <div className="bg-card rounded-2xl border border-border p-4 mb-5 space-y-2.5">
              {invite?.event_date && (
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="w-4 h-4 text-primary flex-shrink-0" />
                  <span>{invite.event_date}</span>
                </div>
              )}
              {invite?.event_time && (
                <div className="flex items-center gap-3 text-sm">
                  <Clock className="w-4 h-4 text-primary flex-shrink-0" />
                  <span>{invite.event_time}</span>
                </div>
              )}
              {invite?.event_location && (
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
                  <span>{invite.event_location}</span>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          {isAlreadyResponded ? (
            <div className="text-center bg-card rounded-2xl border border-border p-4">
              <p className="text-sm text-muted-foreground">You already <strong>{invite.status}</strong> this invite.</p>
              <button onClick={() => navigate("/")} className="text-primary text-sm font-medium mt-2">Go to Home →</button>
            </div>
          ) : !user ? (
            <div className="space-y-3">
              <div className="bg-accent/10 border border-accent/20 rounded-2xl p-3 text-center">
                <p className="text-sm font-medium text-foreground">Join in seconds</p>
                <p className="text-xs text-muted-foreground mt-0.5">Sign in to accept this invite and get straight into the game</p>
              </div>
              <Button
                onClick={handleSignIn}
                className="w-full h-13 rounded-2xl font-heading font-bold text-base shadow-lg shadow-primary/20 gap-2"
                style={{ height: "52px" }}
              >
                Sign In to Accept 🎾
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                New to MatchPoint? You'll create your account in under a minute.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Already logged in — show accept/decline */}
              <p className="text-center text-sm text-muted-foreground mb-1">
                Joining as <strong className="text-foreground">{user.full_name || user.email}</strong>
              </p>
              <Button
                className="w-full h-13 rounded-2xl font-heading font-bold text-base shadow-lg shadow-primary/20 gap-2"
                style={{ height: "52px" }}
                disabled={responding}
                onClick={handleAccept}
              >
                {responding ? (
                  <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                  <><CheckCircle className="w-5 h-5" /> Accept Invite</>
                )}
              </Button>
              <Button
                variant="ghost"
                className="w-full h-11 rounded-2xl text-muted-foreground text-sm"
                disabled={responding}
                onClick={handleDecline}
              >
                Decline
              </Button>
            </div>
          )}
        </motion.div>
      </div>

      <p className="text-center text-xs text-muted-foreground pb-8">
        MatchPoint · Padel Matchmaking
      </p>
    </div>
  );
}