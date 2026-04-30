import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  ArrowLeft, MapPin, Calendar, Users, DollarSign,
  Trophy, Crown, MessageCircle, Shield
} from "lucide-react";
import { getOrCreateCompetitionConversation } from "../lib/chat";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { format } from "date-fns";
import PlayerAvatar from "../components/PlayerAvatar";
import SkillBadge from "../components/SkillBadge";
import BracketView from "../components/BracketView";
import StandingsTable from "../components/StandingsTable";
import ResultStatusBadge from "../components/ResultStatusBadge";
import InviteButton from "../components/InviteButton";
import SubmitScoreModal from "../components/SubmitScoreModal";
import HostScoreModal from "../components/HostScoreModal";
import ValidateScoreModal from "../components/ValidateScoreModal";
import { motion } from "framer-motion";

const statusColors = {
  upcoming: "bg-blue-100 text-blue-700",
  registration: "bg-green-100 text-green-700",
  in_progress: "bg-accent/20 text-accent",
  completed: "bg-gray-100 text-gray-600",
};

export default function CompetitionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [joining, setJoining] = useState(false);
  const [submitScoreMatch, setSubmitScoreMatch] = useState(null);
  const [validateScoreMatch, setValidateScoreMatch] = useState(null);
  const [hostScoreMatch, setHostScoreMatch] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  const { data: competition, isLoading } = useQuery({
    queryKey: ["competition", id],
    queryFn: () => base44.entities.Competition.filter({ id }, "-created_date", 1).then((r) => r[0]),
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["competition-entries", id],
    queryFn: () => base44.entities.CompetitionEntry.filter({ competition_id: id }, "created_date", 100),
  });

  const { data: bracketMatches = [] } = useQuery({
    queryKey: ["competition-matches", id],
    queryFn: () => base44.entities.CompetitionMatch.filter({ competition_id: id }, "round", 100),
  });

  if (isLoading) {
    return <div className="max-w-lg mx-auto px-5 pt-6"><div className="h-48 bg-card rounded-2xl animate-pulse" /></div>;
  }

  if (!competition) {
    return <div className="max-w-lg mx-auto px-5 pt-6 text-center"><p className="text-muted-foreground">Competition not found</p></div>;
  }

  // Access guard for invite-only competitions
  if (competition.visibility === "invite_only" && user) {
    const canAccess =
      competition.host_email === user.email ||
      competition.participants?.includes(user.email) ||
      competition.invited_emails?.includes(user.email) ||
      user.role === "admin";
    if (!canAccess) {
      return (
        <div className="max-w-lg mx-auto px-5 pt-6 text-center space-y-3">
          <div className="text-5xl">🔒</div>
          <h2 className="font-heading font-bold text-xl">Invite Only</h2>
          <p className="text-muted-foreground text-sm">You need an invite to view this competition.</p>
          <Button variant="outline" onClick={() => navigate("/competitions")}>Browse Public Competitions</Button>
        </div>
      );
    }
  }

  const isParticipant = user && competition.participants?.includes(user.email);
  const isHost = user && competition.host_email === user.email;
  const isFull = (competition.participants?.length || 0) >= competition.max_players;
  const isRegistrationOpen = competition.status === "registration";
  const startDate = competition.start_date ? format(new Date(competition.start_date), "EEE, MMM d, yyyy") : "";
  const endDate = competition.end_date ? format(new Date(competition.end_date), "MMM d, yyyy") : "";
  const playerCount = competition.participants?.length || 0;
  const prizePool = competition.entry_fee > 0
    ? (competition.entry_fee * playerCount * 0.975).toFixed(2)
    : null;

  const handleJoin = async () => {
    if (!user) return;
    if (competition.is_verified_only && !user.avg_reliability) {
      toast({ title: "Verification required", description: "You need at least one rating to enter this competition", variant: "destructive" });
      return;
    }
    setJoining(true);
    const updatedParticipants = [...(competition.participants || []), user.email];
    await base44.entities.Competition.update(competition.id, { participants: updatedParticipants });
    await base44.entities.CompetitionEntry.create({
      competition_id: competition.id,
      player_email: user.email,
      player_name: user.full_name,
      status: "confirmed",
      fee_paid: competition.entry_fee === 0,
      amount_paid: competition.entry_fee || 0,
    });
    queryClient.invalidateQueries(["competition", id]);
    queryClient.invalidateQueries(["competition-entries", id]);
    toast({ title: "You're in! 🏆", description: `You've joined ${competition.name}` });
    setJoining(false);
  };

  const handleStartTournament = async () => {
    await base44.entities.Competition.update(competition.id, { status: "in_progress" });
    const isDoubles = competition.team_structure === "doubles" || competition.team_structure === "mixed_doubles";
    // Auto-generate bracket for knockout
    if (competition.format === "knockout" && entries.length >= 2) {
      const shuffled = [...entries].sort(() => Math.random() - 0.5);
      const matches = [];
      if (isDoubles) {
        // Pair consecutive entries into teams of 2
        const step = 4; // 4 players per match (2 per team)
        for (let i = 0; i < shuffled.length; i += step) {
          const teamA = shuffled.slice(i, i + 2).filter(Boolean);
          const teamB = shuffled.slice(i + 2, i + 4).filter(Boolean);
          if (teamA.length >= 1 && teamB.length >= 1) {
            matches.push({
              competition_id: competition.id,
              round: 1,
              player1_email: teamA[0].player_email,
              player1_name: teamA.map(e => e.player_name).join(" & "),
              player2_email: teamB[0].player_email,
              player2_name: teamB.map(e => e.player_name).join(" & "),
              team_a_emails: teamA.map(e => e.player_email),
              team_b_emails: teamB.map(e => e.player_email),
              status: "scheduled",
              match_order: Math.floor(i / step) + 1,
            });
          }
        }
      } else {
        for (let i = 0; i < shuffled.length; i += 2) {
          if (shuffled[i + 1]) {
            matches.push({
              competition_id: competition.id,
              round: 1,
              player1_email: shuffled[i].player_email,
              player1_name: shuffled[i].player_name,
              player2_email: shuffled[i + 1].player_email,
              player2_name: shuffled[i + 1].player_name,
              status: "scheduled",
              match_order: i / 2 + 1,
            });
          }
        }
      }
      await base44.entities.CompetitionMatch.bulkCreate(matches);
    }
    queryClient.invalidateQueries(["competition", id]);
    queryClient.invalidateQueries(["competition-matches", id]);
    toast({ title: "Tournament started! 🏆", description: "Bracket has been generated" });
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="px-5 pt-6 pb-2">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-muted-foreground mb-3">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-5 pb-8 space-y-5">
        {/* Header card */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <div className="flex flex-wrap gap-2 mb-3">
            <Badge variant="secondary" className={`text-[11px] capitalize ${statusColors[competition.status] || ""}`}>
              {competition.status?.replace("_", " ")}
            </Badge>
            <SkillBadge level={competition.skill_level} />
            {competition.is_verified_only && (
              <Badge variant="outline" className="text-[11px] gap-1">
                <Shield className="w-3 h-3" /> Verified only
              </Badge>
            )}
          </div>

          <h1 className="font-heading font-bold text-xl mb-1">{competition.name}</h1>
          {competition.description && (
            <p className="text-muted-foreground text-sm mb-3">{competition.description}</p>
          )}

          <div className="space-y-2">
            {competition.location_name && (
              <div className="flex items-start gap-2 text-sm"><MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" /><div><div>{competition.location_name}</div>{competition.location_address && <div className="text-xs text-muted-foreground">{competition.location_address}</div>}</div></div>
            )}
            {startDate && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                {endDate && endDate !== startDate ? `${startDate} – ${endDate}` : startDate}
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span>{playerCount}/{competition.max_players} players</span>
              {!isFull && isRegistrationOpen && (
                <span className="text-primary font-medium">· {competition.max_players - playerCount} spots left</span>
              )}
            </div>
          </div>
        </div>

        {/* Prize Pool Card */}
        {(competition.entry_fee > 0 || competition.prize_description) && (
          <div className="bg-gradient-to-br from-accent/10 to-amber-50 rounded-2xl border border-accent/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-5 h-5 text-accent" />
              <span className="font-heading font-semibold">Prize Info</span>
            </div>
            {competition.entry_fee > 0 && (
              <div className="space-y-1 text-sm mb-2">
                <div className="flex justify-between"><span className="text-muted-foreground">Entry fee</span><span className="font-medium">£{competition.entry_fee}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Current pool</span><span className="font-semibold text-accent">£{prizePool}</span></div>
                <div className="flex justify-between text-xs text-muted-foreground"><span>Platform fee (2.5%)</span><span>deducted</span></div>
              </div>
            )}
            {competition.prize_description && (
              <p className="text-sm font-medium">{competition.prize_description}</p>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-2">
          {!isParticipant && isRegistrationOpen && !isFull && (
            <Button
              onClick={handleJoin}
              disabled={joining}
              className="w-full h-12 rounded-xl font-heading font-semibold shadow-lg shadow-primary/20"
            >
              {joining ? (
                <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : competition.entry_fee > 0 ? (
                `Join — Pay £${competition.entry_fee} 🏆`
              ) : (
                "Join for Free 🏆"
              )}
            </Button>
          )}

          {isHost && competition.status === "registration" && entries.length >= 2 && (
            <Button
              variant="outline"
              className="w-full h-11 rounded-xl font-heading font-semibold"
              onClick={handleStartTournament}
            >
              Start Tournament & Generate Bracket
            </Button>
          )}

          {(isParticipant || isHost) && (
            <Button
              variant="outline"
              className="w-full h-11 rounded-xl font-heading font-semibold gap-2"
              onClick={async () => {
                const conv = await getOrCreateCompetitionConversation(competition, user);
                navigate(`/conversation/${conv.id}`);
              }}
            >
              <MessageCircle className="w-5 h-5" /> Competition Chat
            </Button>
          )}

          {(isParticipant || isHost) && competition.status !== "completed" && competition.status !== "cancelled" && (
            <InviteButton
              eventType="competition"
              eventId={competition.id}
              eventName={competition.name}
              eventDate={competition.start_date}
              eventLocation={competition.location_name}
              className="w-full h-11"
            />
          )}
        </div>

        {/* Tabs: bracket / standings / participants */}
        <Tabs defaultValue={competition.type === "league" ? "standings" : (competition.format === "round_robin" || competition.format === "group_knockout") ? "standings" : "bracket"}>
          <TabsList className="w-full rounded-xl">
            {competition.type === "tournament" && competition.format !== "round_robin" && competition.format !== "group_knockout" && <TabsTrigger value="bracket" className="flex-1 rounded-lg">Bracket</TabsTrigger>}
            {(competition.type === "league" || competition.format === "round_robin" || competition.format === "group_knockout") && <TabsTrigger value="standings" className="flex-1 rounded-lg">Standings</TabsTrigger>}
            <TabsTrigger value="players" className="flex-1 rounded-lg">Players ({playerCount})</TabsTrigger>
          </TabsList>

          {competition.type === "tournament" && competition.format !== "round_robin" && competition.format !== "group_knockout" && (
            <TabsContent value="bracket" className="mt-3">
              <BracketView
                matches={bracketMatches}
                currentUserEmail={user?.email}
                onSubmitScore={setSubmitScoreMatch}
                onValidateScore={setValidateScoreMatch}
                onHostScore={setHostScoreMatch}
                isHost={isHost}
                competitionType={competition.type}
                hasEntryFee={(competition.entry_fee || 0) > 0}
                isDoubles={competition.team_structure === "doubles" || competition.team_structure === "mixed_doubles"}
              />
            </TabsContent>
          )}

          {(competition.type === "league" || competition.format === "round_robin" || competition.format === "group_knockout") && (
            <TabsContent value="standings" className="mt-3">
              <StandingsTable
                entries={entries}
                matches={bracketMatches}
                competition={competition}
              />
            </TabsContent>
          )}

          <TabsContent value="players" className="mt-3 space-y-2">
            {entries.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-6">No players yet</p>
            ) : (
              entries.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border">
                  <PlayerAvatar name={entry.player_name} size="sm" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">{entry.player_name}</p>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 ${entry.status === "confirmed" ? "text-green-600 border-green-200" : "text-muted-foreground"}`}
                    >
                      {entry.status}
                    </Badge>
                  </div>
                  {entry.fee_paid && competition.entry_fee > 0 && (
                    <span className="text-xs text-green-600 font-medium">Paid £{entry.amount_paid}</span>
                  )}
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Disputed matches — visible to host/admin */}
      {isHost && bracketMatches.some((m) => m.status === "disputed" || m.status === "admin_review") && (
        <div className="px-5 pb-8">
          <h3 className="font-heading font-semibold mb-3 text-destructive flex items-center gap-2">
            ⚠️ Disputed Results
          </h3>
          <div className="space-y-2">
            {bracketMatches
              .filter((m) => m.status === "disputed" || m.status === "admin_review")
              .map((match) => (
                <div key={match.id} className="bg-card rounded-xl border border-destructive/20 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{match.player1_name} vs {match.player2_name}</span>
                    <ResultStatusBadge status={match.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">Submitted: {match.submitted_score_p1} – {match.submitted_score_p2}</p>
                  {match.rejection_reason && (
                    <p className="text-xs text-destructive mt-1">Dispute: {match.rejection_reason}</p>
                  )}
                  {match.evidence_url && (
                    <a href={match.evidence_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 block">
                      View evidence →
                    </a>
                  )}
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg text-xs h-8"
                      onClick={async () => {
                        const s1 = Number(match.submitted_score_p1 || 0);
                        const s2 = Number(match.submitted_score_p2 || 0);
                        const winnerEmail = s1 > s2 ? match.player1_email : match.player2_email;
                        await base44.entities.CompetitionMatch.update(match.id, {
                          score_player1: match.submitted_score_p1,
                          score_player2: match.submitted_score_p2,
                          winner_email: winnerEmail,
                          status: "confirmed",
                        });
                        await base44.entities.ScoreAuditLog.create({
                          competition_match_id: match.id,
                          competition_id: competition.id,
                          action: "admin_override",
                          actor_email: user?.email,
                          actor_name: user?.full_name,
                          score_p1: match.submitted_score_p1,
                          score_p2: match.submitted_score_p2,
                          player1_name: match.player1_name,
                          player2_name: match.player2_name,
                          reason: "Admin accepted submitted score",
                          timestamp: new Date().toISOString(),
                        });
                        queryClient.invalidateQueries(["competition-matches", id]);
                      }}
                    >
                      Accept Submitted Score
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg text-xs h-8 text-destructive border-destructive/30"
                      onClick={async () => {
                        await base44.entities.CompetitionMatch.update(match.id, { status: "admin_review" });
                        queryClient.invalidateQueries(["competition-matches", id]);
                      }}
                    >
                      Escalate to Review
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      <SubmitScoreModal
        open={!!submitScoreMatch}
        onClose={() => setSubmitScoreMatch(null)}
        match={submitScoreMatch}
        currentUserEmail={user?.email}
        currentUserName={user?.full_name}
        onSubmitted={() => queryClient.invalidateQueries(["competition-matches", id])}
      />
      <ValidateScoreModal
        open={!!validateScoreMatch}
        onClose={() => setValidateScoreMatch(null)}
        match={validateScoreMatch}
        currentUserEmail={user?.email}
        currentUserName={user?.full_name}
        onValidated={() => {
          queryClient.invalidateQueries(["competition-matches", id]);
          queryClient.invalidateQueries(["competition", id]);
        }}
      />
      <HostScoreModal
        open={!!hostScoreMatch}
        onClose={() => setHostScoreMatch(null)}
        match={hostScoreMatch}
        currentUserEmail={user?.email}
        currentUserName={user?.full_name}
        onConfirmed={() => {
          queryClient.invalidateQueries(["competition-matches", id]);
          queryClient.invalidateQueries(["competition", id]);
        }}
      />
    </div>
  );
}