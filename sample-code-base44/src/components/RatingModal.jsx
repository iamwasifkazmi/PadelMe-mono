import { useState } from "react";
import { Star, Clock, CheckCircle, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import PlayerAvatar from "./PlayerAvatar";
import { base44 } from "@/api/base44Client";

const TEAMMATE_TAGS = [
  { key: "great_teamwork", label: "🤝 Great teamwork" },
  { key: "reliable", label: "⏰ Reliable" },
  { key: "good_attitude", label: "😊 Good attitude" },
  { key: "communicated_well", label: "💬 Communicated well" },
  { key: "would_play_again", label: "👍 Play again" },
];

const OPPONENT_TAGS = [
  { key: "sportsmanlike", label: "🏅 Sportsmanlike" },
  { key: "reliable", label: "⏰ Reliable" },
  { key: "good_attitude", label: "😊 Good attitude" },
  { key: "skill_accurate", label: "🎯 Skill accurate" },
  { key: "competitive", label: "⚡ Competitive" },
  { key: "would_play_again", label: "👍 Play again" },
];

const STAR_LABELS = ["", "Poor", "Below average", "Average", "Good", "Excellent"];

function StarRow({ value, onChange }) {
  return (
    <div className="flex gap-3 justify-center">
      {[1, 2, 3, 4, 5].map((star) => (
        <button key={star} onClick={() => onChange(star)} className="transition-transform active:scale-90">
          <Star
            className={`w-10 h-10 transition-colors ${
              star <= value ? "fill-accent text-accent" : "text-border hover:text-accent/40"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

function TagGrid({ tags, selected, onToggle }) {
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {tags.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onToggle(key)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            selected.includes(key)
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-muted-foreground border-border hover:border-primary/50"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function RatePlayerStep({ player, role, stepNum, totalSteps, onSubmit, isLast, isExpired, hoursLeft }) {
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState([]);
  const toggleTag = (key) => setTags((p) => p.includes(key) ? p.filter((t) => t !== key) : [...p, key]);

  if (isExpired) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <Clock className="w-12 h-12 text-muted-foreground" />
        <p className="font-heading font-semibold">Rating window expired</p>
        <p className="text-muted-foreground text-sm">Ratings must be submitted within 24 hours of match completion.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Player card */}
      <div className="flex flex-col items-center gap-2 pt-2">
        <PlayerAvatar name={player?.full_name} avatarUrl={player?.photo_url} size="xl" />
        <p className="font-heading font-bold text-lg mt-1">{player?.full_name || "Player"}</p>
        <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
          role === "teammate"
            ? "bg-primary/10 text-primary"
            : "bg-orange-100 text-orange-700"
        }`}>
          {role === "teammate" ? "🤝 Your Teammate" : "⚔️ Your Opponent"}
        </span>
      </div>

      {/* Urgency */}
      {hoursLeft < 6 && hoursLeft > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl justify-center">
          <Clock className="w-3.5 h-3.5" />
          <span>{Math.ceil(hoursLeft)}h left to rate</span>
        </div>
      )}

      {/* Stars */}
      <div className="space-y-2 text-center">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-widest">Overall Rating *</p>
        <StarRow value={stars} onChange={setStars} />
        {stars > 0 && (
          <p className="text-sm font-medium text-muted-foreground">{STAR_LABELS[stars]}</p>
        )}
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-widest text-center">Tags (optional)</p>
        <TagGrid
          tags={role === "teammate" ? TEAMMATE_TAGS : OPPONENT_TAGS}
          selected={tags}
          onToggle={toggleTag}
        />
      </div>

      <Button
        onClick={() => onSubmit({ stars, tags })}
        disabled={stars === 0}
        className="w-full h-12 rounded-xl font-heading font-semibold gap-2 text-base"
      >
        {isLast ? "Submit & Finish 🔒" : <>Next Player <ArrowRight className="w-4 h-4" /></>}
      </Button>

      <p className="text-center text-xs text-muted-foreground pb-1">
        🔒 Blind rating — revealed when window closes or everyone submits
      </p>
    </div>
  );
}

/**
 * RatingModal — multi-step post-match rating flow
 * Works for singles (rate 1 opponent) and doubles (teammate first, then 2 opponents)
 *
 * Props:
 *   open, onClose
 *   match              — full Match object
 *   currentUserEmail
 *   playersMap         — { email: User } for all players
 *   existingRatings    — Rating[] already submitted by currentUser for this match
 *   onSubmitted        — callback after all ratings done
 */
export default function RatingModal({ open, onClose, match, currentUserEmail, playersMap = {}, existingRatings = [], onSubmitted }) {
  const [step, setStep] = useState(0);
  const [allDone, setAllDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const isDoubles = match?.match_type === "doubles" || match?.match_type === "mixed_doubles";

  // Build ordered list of players to rate
  const toRate = (() => {
    if (!match || !currentUserEmail) return [];
    const teamA = match.team_a || [];
    const teamB = match.team_b || [];
    const myTeam = teamA.includes(currentUserEmail) ? teamA : teamB;
    const oppTeam = teamA.includes(currentUserEmail) ? teamB : teamA;
    const result = [];
    if (isDoubles) {
      const teammate = myTeam.find((e) => e !== currentUserEmail);
      if (teammate) result.push({ email: teammate, role: "teammate" });
      oppTeam.forEach((e) => result.push({ email: e, role: "opponent" }));
    } else {
      const all = match.players || [...teamA, ...teamB];
      const opp = all.find((e) => e !== currentUserEmail);
      if (opp) result.push({ email: opp, role: "opponent" });
    }
    const alreadyRated = new Set(existingRatings.map((r) => r.rated_email));
    return result.filter((p) => !alreadyRated.has(p.email));
  })();

  const alreadyAllRated = toRate.length === 0 && existingRatings.length > 0;
  const isExpired = match?.updated_date
    ? Date.now() - new Date(match.updated_date).getTime() > 24 * 60 * 60 * 1000
    : false;
  const hoursLeft = match?.updated_date
    ? Math.max(0, 24 - (Date.now() - new Date(match.updated_date).getTime()) / 3600000)
    : 24;

  const handleStepSubmit = async ({ stars, tags }) => {
    setSubmitting(true);
    const target = toRate[step];
    await base44.entities.Rating.create({
      match_id: match.id,
      rater_email: currentUserEmail,
      rated_email: target.email,
      role: target.role,
      overall: stars,
      tags,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    // Notify the rated player
    base44.entities.Notification.create({
      user_email: target.email,
      type: "rating_received",
      title: "You received a rating ⭐",
      body: "A player rated you after your recent match. Ratings are revealed when the window closes.",
      related_entity_type: "match",
      related_entity_id: match.id,
      is_read: false,
      priority: "normal",
    }).catch(() => {});
    // Recalculate rating summary for the rated player
    base44.functions.invoke("updateRatingSummary", { rated_email: target.email }).catch(() => {});

    setSubmitting(false);
    if (step < toRate.length - 1) {
      setStep((s) => s + 1);
    } else {
      setAllDone(true);
      onSubmitted?.();
    }
  };

  const handleClose = () => {
    setStep(0);
    setAllDone(false);
    onClose();
  };

  const currentTarget = toRate[step];
  const currentPlayer = currentTarget ? (playersMap[currentTarget.email] || { full_name: currentTarget.email.split("@")[0] }) : null;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-sm bg-background rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
          <div>
            <h2 className="font-heading font-bold text-base">Rate your match</h2>
            {toRate.length > 0 && !allDone && !alreadyAllRated && (
              <p className="text-xs text-muted-foreground">{step + 1} of {toRate.length}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Progress dots */}
            {toRate.length > 1 && !allDone && (
              <div className="flex gap-1.5 items-center">
                {toRate.map((_, i) => (
                  <div
                    key={i}
                    className={`h-2 rounded-full transition-all duration-300 ${
                      i < step ? "w-2 bg-primary" : i === step ? "w-5 bg-primary" : "w-2 bg-border"
                    }`}
                  />
                ))}
              </div>
            )}
            <button onClick={handleClose} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 pb-6 pt-4 max-h-[85vh] overflow-y-auto">
          {allDone ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-9 h-9 text-green-600" />
              </div>
              <p className="font-heading font-bold text-xl">Thanks for rating!</p>
              <p className="text-muted-foreground text-sm max-w-[260px]">
                Ratings are blind and will be revealed once the window closes or everyone submits.
              </p>
              <Button onClick={handleClose} className="w-full h-11 rounded-xl mt-2 font-heading font-semibold">
                Done
              </Button>
            </div>
          ) : alreadyAllRated ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle className="w-12 h-12 text-green-500" />
              <p className="font-heading font-semibold">Already rated all players</p>
              <p className="text-muted-foreground text-sm">
                Ratings are revealed once the window closes 🔒
              </p>
              <Button onClick={handleClose} variant="outline" className="w-full h-11 rounded-xl mt-2">Close</Button>
            </div>
          ) : toRate.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-muted-foreground text-sm">No players to rate for this match.</p>
              <Button onClick={handleClose} variant="outline" className="w-full h-11 rounded-xl">Close</Button>
            </div>
          ) : (
            <RatePlayerStep
              key={`${step}-${currentTarget?.email}`}
              player={currentPlayer}
              role={currentTarget?.role}
              stepNum={step + 1}
              totalSteps={toRate.length}
              onSubmit={handleStepSubmit}
              isLast={step === toRate.length - 1}
              isExpired={isExpired}
              hoursLeft={hoursLeft}
            />
          )}
        </div>
      </div>
    </div>
  );
}