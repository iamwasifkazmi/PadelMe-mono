import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  ArrowLeft, MapPin, Clock, Calendar, Users, MessageCircle,
  Share2, Zap, Star, AlertCircle, MoreVertical, XCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import PlayerAvatar from "../components/PlayerAvatar";
import SkillBadge from "../components/SkillBadge";
import RatingModal from "../components/RatingModal";
import MatchScoreModal from "../components/MatchScoreModal";
import MatchValidateModal from "../components/MatchValidateModal";
import InviteButton from "../components/InviteButton";
import TeamJoinModal from "../components/TeamJoinModal";
import DoublesTeamsDisplay from "../components/DoublesTeamsDisplay";
import VerificationBadge from "../components/VerificationBadge";
import { validateMatchStart } from "../utils/matchStartValidator";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { getOrCreateMatchConversation } from "../lib/chat";
import MatchResultPanel from "../components/MatchResultPanel";
import CancelMatchDialog from "../components/CancelMatchDialog";
import LeaveMatchDialog from "../components/LeaveMatchDialog";
import FindReplacementBanner from "../components/FindReplacementBanner";

export default function MatchDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [joining, setJoining] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [showValidateModal, setShowValidateModal] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  const { data: match, isLoading } = useQuery({
    queryKey: ["match", id],
    queryFn: () => base44.entities.Match.filter({ id }, "-created_date", 1).then((r) => r[0]),
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ["all-users"],
    queryFn: () => base44.entities.User.list(),
  });

  const { data: myRatings = [], refetch: refetchRatings } = useQuery({
    queryKey: ["my-ratings-for-match", id, user?.email],
    queryFn: () => base44.entities.Rating.filter({ match_id: id, rater_email: user.email }, "-created_date", 20),
    enabled: !!user?.email && !!id,
  });

  const { data: myFormEntry } = useQuery({
    queryKey: ["match-form-entry", id, user?.email],
    queryFn: () => base44.entities.PlayerRecentForm.filter({ match_id: id, user_email: user.email }, "-created_date", 1).then(r => r[0]),
    enabled: !!user?.email && !!id,
  });

  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-6">
        <div className="h-48 bg-card rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-6 text-center">
        <p className="text-muted-foreground">Match not found</p>
        <Button variant="link" onClick={() => navigate("/")}>Go home</Button>
      </div>
    );
  }

  // Access guard for invite-only matches
  if (match.visibility === "invite_only" && user) {
    const canAccess =
      match.created_by === user.email ||
      match.players?.includes(user.email) ||
      match.invited_emails?.includes(user.email) ||
      user.role === "admin";
    if (!canAccess) {
      return (
        <div className="max-w-lg mx-auto px-5 pt-6 text-center space-y-3">
          <div className="text-5xl">🔒</div>
          <h2 className="font-heading font-bold text-xl">Invite Only</h2>
          <p className="text-muted-foreground text-sm">You need an invite to view this match.</p>
          <Button variant="outline" onClick={() => navigate("/find-match")}>Browse Public Matches</Button>
        </div>
      );
    }
  }

  const players = match.players || [];
  const isDoubles = match.match_type === "doubles" || match.match_type === "mixed_doubles";
  const isJoined = user && players.includes(user.email);
  const isCreator = user && match.created_by === user.email;
  const isFull = players.length >= match.max_players;
  const spotsLeft = match.max_players - players.length;
  const isCompleted = match.status === "completed";
  const isInProgress = match.status === "in_progress";
  const isAwaitingScore = match.status === "awaiting_score";
  const isPendingValidation = match.status === "pending_validation";
  // A player can only leave before the match has started
  const canLeave = ["open", "full"].includes(match.status);
  const canSubmitScore = (isInProgress || isAwaitingScore) && (isJoined || isCreator);
  const canValidateScore = isPendingValidation && isJoined && match.submitted_by !== user?.email;
  const matchDate = match.date ? format(new Date(match.date), "EEEE, MMM d, yyyy") : "";
  const startValidation = validateMatchStart(match, allUsers);

  const playerProfiles = players.map((email) => {
    const u = allUsers.find((usr) => usr.email === email);
    return u || { email, full_name: email.split("@")[0] };
  });

  const handleJoin = async (team) => {
    setJoining(true);
    const updatedPlayers = [...players, user.email];
    const newStatus = updatedPlayers.length >= match.max_players ? "full" : "open";
    const teamUpdate = team === "team_a"
      ? { team_a: [...(match.team_a || []), user.email] }
      : { team_b: [...(match.team_b || []), user.email] };
    await base44.entities.Match.update(match.id, { players: updatedPlayers, status: newStatus, ...teamUpdate });

    await base44.entities.Notification.create({
      user_email: match.created_by,
      type: "join",
      title: "Player joined!",
      body: `${user.full_name} joined your match "${match.title}"`,
      match_id: match.id,
      is_read: false,
    });

    queryClient.invalidateQueries(["match", id]);
    toast({ title: "You're in! 🎉", description: "You've joined the match" });
    setJoining(false);
  };

  const handleLeave = async () => {
    const wasFull = match.status === "full";
    const updatedPlayers = players.filter((p) => p !== user.email);
    const teamA = (match.team_a || []).filter((e) => e !== user.email);
    const teamB = (match.team_b || []).filter((e) => e !== user.email);
    // Reopen the match — always goes back to "open" so a replacement can join
    const newStatus = "open";

    const updates = {
      players: updatedPlayers,
      status: newStatus,
      team_a: teamA,
      team_b: teamB,
      replacement_needed: true,
    };

    await base44.entities.Match.update(match.id, updates);

    // Late withdrawal — reduce reliability score by 5 points (min 0)
    if (isLateWithdrawal) {
      try {
        const statsArr = await base44.entities.PlayerStats.filter({ user_email: user.email }, "-created_date", 1);
        if (statsArr[0]) {
          const current = statsArr[0].reliability_score ?? 100;
          await base44.entities.PlayerStats.update(statsArr[0].id, {
            reliability_score: Math.max(0, current - 5),
          });
        }
      } catch (_) { /* non-blocking */ }
    }

    // Notify organiser
    if (match.created_by !== user.email) {
      await base44.entities.Notification.create({
        user_email: match.created_by,
        type: "join",
        title: "Player has withdrawn",
        body: `${user.full_name || user.email} has left your match "${match.title}" at ${match.location_name || "the venue"}. A slot is now open — find a replacement.`,
        related_entity_type: "match",
        related_entity_id: match.id,
        is_read: false,
      });
    }

    // If match was full, notify remaining players
    if (wasFull) {
      const remaining = updatedPlayers.filter(e => e !== match.created_by);
      await Promise.all(remaining.map(email =>
        base44.entities.Notification.create({
          user_email: email,
          type: "join",
          title: "A player has left",
          body: `${user.full_name || user.email} has left "${match.title}". The organiser is finding a replacement.`,
          related_entity_type: "match",
          related_entity_id: match.id,
          is_read: false,
        })
      ));
    }

    queryClient.invalidateQueries(["match", id]);
    setShowLeaveDialog(false);
    toast({ title: "You've left the match", description: "The organiser has been notified." });
    navigate(-1);
  };

  const handleLockTeams = async () => {
    await base44.entities.Match.update(match.id, { teams_locked: !match.teams_locked });
    queryClient.invalidateQueries(["match", id]);
    toast({ title: match.teams_locked ? "Teams unlocked" : "Teams locked 🔒", description: match.teams_locked ? "Players can now change teams" : "No more team changes allowed" });
  };

  const handleMarkInProgress = async () => {
    if (!startValidation.valid) {
      toast({ title: "Cannot start match", description: startValidation.reason, variant: "destructive" });
      return;
    }

    if (isDoubles && (!match.team_a_captain_email || !match.team_b_captain_email)) {
      const captainA = match.team_a?.[0] || match.players?.[0];
      const captainB = match.team_b?.[0] || match.players?.[1];
      await base44.entities.Match.update(match.id, {
        status: "in_progress",
        team_a_captain_email: match.team_a_captain_email || captainA,
        team_b_captain_email: match.team_b_captain_email || captainB,
      });
    } else {
      await base44.entities.Match.update(match.id, { status: "in_progress" });
    }
    queryClient.invalidateQueries(["match", id]);
    toast({ title: "Match started!", description: "Players can now submit scores when done" });
  };

  const handleCancelMatch = async () => {
    await base44.entities.Match.update(match.id, {
      status: "cancelled",
      cancelled_by: user.email,
      cancelled_at: new Date().toISOString(),
    });
    // Notify all players
    const others = (match.players || []).filter(e => e !== user.email);
    await Promise.all(others.map(email =>
      base44.entities.Notification.create({
        user_email: email,
        type: "match_cancelled",
        title: "Match cancelled",
        body: `"${match.title}" at ${match.location_name || "the venue"} has been cancelled.`,
        related_entity_type: "match",
        related_entity_id: match.id,
        is_read: false,
      })
    ));
    queryClient.invalidateQueries(["match", id]);
    setShowCancelDialog(false);
    toast({ title: "Match cancelled", description: "All players have been notified." });
    navigate(-1);
  };

  const handleRatingSubmit = async () => {
    refetchRatings();
    toast({ title: "Ratings submitted! 🔒", description: "Revealed when the window closes" });
  };

  // Late-withdrawal: match starts within 2 hours
  const isLateWithdrawal = (() => {
    if (!match?.date || !match?.time) return false;
    try {
      const matchStart = new Date(`${match.date}T${match.time}`);
      const diffMs = matchStart - Date.now();
      return diffMs > 0 && diffMs < 2 * 60 * 60 * 1000;
    } catch { return false; }
  })();

  // Build playersMap for rating modal
  const playersMap = Object.fromEntries(allUsers.map((u) => [u.email, u]));

  return (
    <div className="max-w-lg mx-auto">
      <div className="px-5 pt-6 pb-2 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-muted-foreground">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        {/* Cancel option — organiser only, before match starts */}
        {isCreator && (match.status === "open" || match.status === "full") && (
          <button
            onClick={() => setShowCancelDialog(true)}
            className="flex items-center gap-1.5 text-destructive text-sm font-medium hover:opacity-80 transition-opacity"
          >
            <XCircle className="w-4 h-4" /> Cancel Match
          </button>
        )}
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-5 pb-8 space-y-5">

        {/* ── CANCELLED BANNER ── */}
        {match.status === "cancelled" && (
          <div className="flex items-center gap-3 p-4 bg-destructive/8 border border-destructive/20 rounded-2xl">
            <XCircle className="w-5 h-5 text-destructive flex-shrink-0" />
            <div>
              <p className="font-heading font-semibold text-sm text-destructive">Match Cancelled</p>
              <p className="text-xs text-muted-foreground">This match was cancelled. No stats or ELO changes were recorded.</p>
            </div>
          </div>
        )}

        {/* ── REPLACEMENT NEEDED (organiser only) ── */}
        {isCreator && match.replacement_needed && canLeave && (
          <FindReplacementBanner match={match} />
        )}

        {/* ── RESULT PANEL (completed matches only) ── */}
        {isCompleted && (
          <MatchResultPanel
            match={match}
            currentUserEmail={user?.email}
            allUsers={allUsers}
            recentFormEntry={myFormEntry}
          />
        )}

        <div className="bg-card rounded-2xl border border-border p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              {match.is_instant && (
                <span className="flex items-center gap-1 text-accent text-xs font-bold">
                  <Zap className="w-4 h-4 fill-accent" /> Instant
                </span>
              )}
              <SkillBadge level={match.skill_level} />
              <Badge
                variant={match.status === "open" ? "default" : "secondary"}
                className="text-xs capitalize"
              >
                {match.status}
              </Badge>
            </div>
          </div>

          <h1 className="font-heading font-bold text-xl mb-4">{match.title}</h1>

          <div className="space-y-2.5">
            <InfoRow icon={Calendar} text={matchDate} />
            <InfoRow icon={Clock} text={`${match.time} · ${match.duration_minutes || 90} min`} />
            <InfoRow icon={MapPin} text={match.location_address ? `${match.location_name} · ${match.location_address}` : match.location_name} />
            <InfoRow
              icon={Users}
              text={
                <span>
                  {players.length}/{match.max_players} players
                  {spotsLeft > 0 && (
                    <span className="text-primary ml-1">
                      · {spotsLeft} spot{spotsLeft > 1 ? "s" : ""} left
                    </span>
                  )}
                </span>
              }
            />
          </div>

          {match.notes && (
            <p className="text-muted-foreground text-sm mt-4 border-t border-border pt-3">
              {match.notes}
            </p>
          )}

          {match.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {match.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs rounded-full">{tag}</Badge>
              ))}
            </div>
          )}
        </div>

        {isDoubles ? (
          <DoublesTeamsDisplay
            match={match}
            allUsers={allUsers}
            currentUserEmail={user?.email}
            isCreator={isCreator}
            isCompleted={isCompleted}
            onRate={() => setShowRatingModal(true)}
            onLockTeams={handleLockTeams}
          />
        ) : (
          <div className="bg-card rounded-2xl border border-border p-5">
            <h2 className="font-heading font-semibold mb-3">Players</h2>
            <div className="space-y-3">
              {playerProfiles.map((player) => (
                <div key={player.email} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <PlayerAvatar name={player.full_name} avatarUrl={player.avatar_url} size="md" />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-sm">{player.full_name}</p>
                        <VerificationBadge photoVerified={player.photo_verified} idVerified={player.id_verified} size="sm" />
                      </div>
                      <p className="text-muted-foreground text-xs">
                        {player.skill_level ? player.skill_level : "Player"}
                        {player.email === match.created_by && " · Host"}
                      </p>
                    </div>
                  </div>
                  {isCompleted && user && player.email !== user.email && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full text-xs gap-1"
                      onClick={() => setShowRatingModal(true)}
                    >
                      <Star className="w-3 h-3" /> Rate
                    </Button>
                  )}
                </div>
              ))}
              {spotsLeft > 0 &&
                Array.from({ length: spotsLeft }).map((_, i) => (
                  <div key={`empty-${i}`} className="flex items-center gap-3 opacity-40">
                    <div className="w-10 h-10 rounded-full border-2 border-dashed border-border" />
                    <p className="text-muted-foreground text-sm">Open spot</p>
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {(isJoined || isCreator) && (
            <Button
              className="w-full h-12 rounded-xl font-heading font-semibold gap-2"
              onClick={async () => {
                const conv = await getOrCreateMatchConversation(match, user);
                navigate(`/conversation/${conv.id}`);
              }}
            >
              <MessageCircle className="w-5 h-5" /> Match Chat
            </Button>
          )}

          {(isJoined || isCreator) && match.status !== "completed" && (
            <InviteButton
              eventType="match"
              eventId={match.id}
              eventName={match.title}
              eventDate={match.date}
              eventTime={match.time}
              eventLocation={match.location_name}
              className="w-full h-11"
            />
          )}

          {!isJoined && !isFull && match.status === "open" && (
            isDoubles && !match.teams_locked ? (
              <Button
                className="w-full h-12 rounded-xl font-heading font-semibold shadow-lg shadow-primary/20"
                onClick={() => setShowTeamModal(true)}
              >
                Join Match — Choose Team 🎾
              </Button>
            ) : (
              <Button
                className="w-full h-12 rounded-xl font-heading font-semibold shadow-lg shadow-primary/20"
                onClick={() => handleJoin(null)}
                disabled={joining}
              >
                {joining ? (
                  <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                  "Join Match 🎾"
                )}
              </Button>
            )
          )}

          {isJoined && !isCreator && canLeave && (
            <Button variant="outline" className="w-full h-11 rounded-xl text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => setShowLeaveDialog(true)}>
              Leave Match
            </Button>
          )}

          {isCreator && (match.status === "open" || match.status === "full") && (
            <>
              <Button
                className="w-full h-12 rounded-xl font-heading font-semibold shadow-lg shadow-primary/20"
                onClick={handleMarkInProgress}
                disabled={!startValidation.valid}
              >
                Start Match ▶
              </Button>
              {!startValidation.valid && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{startValidation.reason}</span>
                </div>
              )}
            </>
          )}

          {canSubmitScore && (
            <Button
              className="w-full h-12 rounded-xl font-heading font-semibold shadow-lg shadow-primary/20"
              onClick={() => setShowScoreModal(true)}
            >
              Submit Score 🎾
            </Button>
          )}

          {isPendingValidation && !canValidateScore && match.submitted_by === user?.email && (
            <div className="w-full p-3 bg-amber-50 border border-amber-200 rounded-xl text-center text-sm text-amber-700">
              ⏳ Waiting for opponent to confirm the score
            </div>
          )}

          {canValidateScore && (
            <Button
              className="w-full h-12 rounded-xl font-heading font-semibold bg-green-600 hover:bg-green-700 text-white"
              onClick={() => setShowValidateModal(true)}
            >
              Confirm Score ✓
            </Button>
          )}

          {isCompleted && isJoined && (
            <Button
              variant="outline"
              className="w-full h-11 rounded-xl gap-2 font-heading font-semibold"
              onClick={() => setShowRatingModal(true)}
            >
              <Star className="w-4 h-4 fill-accent text-accent" />
              Rate Players
              {myRatings.length > 0 && (
                <span className="text-xs text-muted-foreground font-normal">({myRatings.length} submitted)</span>
              )}
            </Button>
          )}
        </div>
      </motion.div>

      <LeaveMatchDialog
        open={showLeaveDialog}
        onClose={() => setShowLeaveDialog(false)}
        onConfirm={handleLeave}
        matchTitle={match?.title}
        matchDate={match?.date}
        matchTime={match?.time}
        isLateWithdrawal={isLateWithdrawal}
      />

      <CancelMatchDialog
        open={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={handleCancelMatch}
        matchTitle={match?.title}
      />

      <TeamJoinModal
        open={showTeamModal}
        onClose={() => setShowTeamModal(false)}
        match={match}
        allUsers={allUsers}
        currentUser={user}
        onJoin={async (team) => {
          await handleJoin(team);
          queryClient.invalidateQueries(["match", id]);
        }}
      />

      <RatingModal
        open={showRatingModal}
        onClose={() => setShowRatingModal(false)}
        match={match}
        currentUserEmail={user?.email}
        playersMap={playersMap}
        existingRatings={myRatings}
        onSubmitted={handleRatingSubmit}
      />

      <MatchScoreModal
        open={showScoreModal}
        onClose={() => setShowScoreModal(false)}
        match={match}
        currentUserEmail={user?.email}
        currentUserName={user?.full_name}
        onSubmitted={() => {
          setShowScoreModal(false);
          queryClient.invalidateQueries(["match", id]);
          toast({ title: "Score submitted!", description: "Waiting for opponent to confirm" });
        }}
      />

      <MatchValidateModal
        open={showValidateModal}
        onClose={() => setShowValidateModal(false)}
        match={match}
        currentUserEmail={user?.email}
        onValidated={() => {
          setShowValidateModal(false);
          queryClient.invalidateQueries(["match", id]);
          toast({ title: "Result confirmed! 🏆", description: "Match completed. Rate your players now!" });
          // Auto-open rating flow after a short delay
          setTimeout(() => setShowRatingModal(true), 800);
        }}
      />
    </div>
  );
}

function InfoRow({ icon: Icon, text }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <span className="text-foreground">{text}</span>
    </div>
  );
}