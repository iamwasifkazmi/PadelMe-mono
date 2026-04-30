import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Zap, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { base44 } from "@/api/base44Client";
import VenuePicker from "../components/VenuePicker";
import RecurrenceConfig from "../components/RecurrenceConfig";
import { useToast } from "@/components/ui/use-toast";
import { motion, AnimatePresence } from "framer-motion";

// ── Constants ─────────────────────────────────────────────────────────────────

const MATCH_TYPES = [
  { value: "singles",       label: "Singles",       icon: "👤", sub: "1v1 · 2 players" },
  { value: "doubles",       label: "Doubles",       icon: "👥", sub: "2v2 · 4 players" },
  { value: "mixed_doubles", label: "Mixed",         icon: "🤝", sub: "2v2 · mixed" },
];

const SKILL_OPTIONS = [
  { value: "any",          label: "Any Level", icon: "🌍" },
  { value: "beginner",     label: "Beginner",  icon: "🌱" },
  { value: "intermediate", label: "Mid",       icon: "⚡" },
  { value: "advanced",     label: "Advanced",  icon: "🏆" },
];

const DURATIONS = [60, 90, 120];

const INSTANT_WINDOWS = [
  { value: "now", label: "Right Now", icon: "⚡" },
  { value: "1h",  label: "1 Hour",    icon: "🕐" },
  { value: "2h",  label: "2 Hours",   icon: "🕑" },
];

const TAG_OPTIONS = [
  { label: "Competitive", icon: "🔥" },
  { label: "Social",      icon: "🤝" },
  { label: "Training",    icon: "🎯" },
  { label: "Chill",       icon: "😎" },
  { label: "Beginner-friendly", icon: "🌱" },
];

const STEPS = [
  { id: "mode",    title: "How do you want to play?" },
  { id: "setup",   title: "Match Setup" },
  { id: "when",    title: "When & Where?" },
  { id: "players", title: "Players & Skill" },
];

function getSteps(isInstant, isRecurring) {
  // instant: mode → setup → players (skip when/where)
  // scheduled: mode → setup → when/where → players
  if (isInstant) return ["mode", "setup", "players"];
  return ["mode", "setup", "when", "players"];
}

function autoTitle(matchType, venue) {
  const format = matchType === "singles" ? "Singles" : matchType === "mixed_doubles" ? "Mixed Doubles" : "Doubles";
  if (venue?.name) return `Padel ${format} at ${venue.name}`;
  return `Padel ${format}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CreateMatch() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const urlParams = new URLSearchParams(window.location.search);
  const paramInstant   = urlParams.get("instant") === "true";
  const paramRecurring = urlParams.get("recurring") === "true";
  const paramLocation  = urlParams.get("location");

  const [user, setUser]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [stepIdx, setStepIdx]   = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [venue, setVenue]       = useState(paramLocation ? { name: paramLocation, address: "" } : null);
  const [recurring, setRecurring] = useState({ enabled: paramRecurring, pattern: {}, player_mode: "open" });

  const [form, setForm] = useState({
    mode:           paramInstant ? "instant" : "scheduled", // instant | scheduled | recurring
    instant_window: "now",
    match_type:     "doubles",
    title:          "",
    date:           "",
    time:           "",
    duration_minutes: 90,
    skill_level:    "any",
    visibility:     "public",
    tags:           [],
    scoring_mode:   "simple",
    num_sets:       1,
    tiebreak_rule:  "tiebreak_at_6",
    auto_balance:   false,
  });

  useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      // Pre-fill skill from profile
      if (u?.skill_label) {
        setForm(prev => ({ ...prev, skill_level: u.skill_label }));
      }
    });
  }, []);

  // Auto-update title when match_type or venue changes
  useEffect(() => {
    setForm(prev => ({ ...prev, title: autoTitle(prev.match_type, venue) }));
  }, [form.match_type, venue]);

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
  const toggleTag = (tag) => setForm(prev => ({
    ...prev,
    tags: prev.tags.includes(tag) ? prev.tags.filter(t => t !== tag) : [...prev.tags, tag],
  }));

  const isInstant   = form.mode === "instant";
  const isRecurring = form.mode === "recurring";
  const steps       = getSteps(isInstant, isRecurring);
  const currentStep = steps[stepIdx];
  const totalSteps  = steps.length;
  const maxPlayers  = form.match_type === "singles" ? 2 : 4;

  const canNext = () => {
    if (currentStep === "mode")  return !!form.mode;
    if (currentStep === "setup") return !!form.match_type;
    if (currentStep === "when")  return form.date && form.time; // venue optional
    return true;
  };

  const handleNext = () => {
    if (!canNext()) {
      toast({ title: "Please complete this step first", variant: "destructive" });
      return;
    }
    if (stepIdx < totalSteps - 1) setStepIdx(s => s + 1);
  };

  const handleBack = () => {
    if (stepIdx === 0) navigate(-1);
    else setStepIdx(s => s - 1);
  };

  const handleSubmit = async () => {
    if (!isInstant && !form.date) {
      toast({ title: "Please pick a date", variant: "destructive" });
      return;
    }
    setLoading(true);

    const matchData = {
      title: form.title || autoTitle(form.match_type, venue),
      sport: "Padel",
      match_type: form.match_type,
      is_instant: isInstant,
      instant_window: isInstant ? form.instant_window : undefined,
      date: form.date || new Date().toISOString().split("T")[0],
      time: form.time || "00:00",
      duration_minutes: form.duration_minutes,
      location_name: venue?.name || (isInstant ? "TBD" : ""),
      location_address: venue?.address || "",
      location_lat: venue?.lat ?? null,
      location_lng: venue?.lng ?? null,
      players: [user?.email],
      max_players: maxPlayers,
      team_a: form.match_type !== "singles" ? [user?.email] : [],
      team_b: [],
      status: "open",
      skill_level: form.skill_level,
      visibility: form.visibility,
      tags: form.tags,
      scoring_mode: form.scoring_mode,
      num_sets: form.num_sets,
      tiebreak_rule: form.tiebreak_rule,
      auto_balance: form.auto_balance,
      invited_emails: [user?.email],
    };

    if (isRecurring || recurring.enabled) {
      matchData.is_recurring = true;
      matchData.recurrence_pattern = recurring.pattern;
      matchData.player_group_mode = recurring.player_mode;
      matchData.fixed_players = recurring.player_mode === "fixed" ? [user?.email] : [];
    }

    const match = await base44.entities.Match.create(matchData);

    if (isRecurring || recurring.enabled) {
      await base44.entities.Match.update(match.id, { recurring_match_id: match.id });
      await base44.functions.invoke("generateRecurringMatches", { parentMatchId: match.id, startDate: form.date });
      toast({ title: "Recurring match created! 🔄" });
    } else {
      toast({ title: isInstant ? "Looking for players ⚡" : "Match created! 🎾" });
    }

    navigate(`/match/${match.id}`);
  };

  return (
    <div className="max-w-lg mx-auto min-h-screen flex flex-col bg-background">

      {/* ── Header ── */}
      <div className="px-5 pt-6 pb-3 flex items-center gap-3">
        <button
          onClick={handleBack}
          className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-heading font-bold text-base leading-tight">Create Padel Match</p>
          <p className="text-[11px] text-muted-foreground">Step {stepIdx + 1} of {totalSteps}</p>
        </div>
      </div>

      {/* ── Progress dots ── */}
      <div className="px-5 mb-5">
        <div className="flex gap-1.5">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                i <= stepIdx ? "bg-primary" : "bg-secondary"
              }`}
            />
          ))}
        </div>
      </div>

      {/* ── Step Content ── */}
      <div className="flex-1 px-5 pb-36 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.18 }}
            className="space-y-5"
          >

            {/* ═══════════════════════════════════════════════
                STEP 1: MODE
            ════════════════════════════════════════════════ */}
            {currentStep === "mode" && (
              <>
                <div>
                  <h2 className="font-heading font-bold text-2xl mb-1">How do you want to play? 🎾</h2>
                  <p className="text-muted-foreground text-sm">Pick your match style to get started</p>
                </div>

                <div className="space-y-3">
                  {/* Instant Play */}
                  <ModeCard
                    selected={form.mode === "instant"}
                    onClick={() => update("mode", "instant")}
                    icon="⚡"
                    iconBg="bg-amber-400"
                    title="Play Now"
                    sub="We'll find players for you right now"
                    badge="Fastest"
                    badgeColor="bg-amber-100 text-amber-700"
                  >
                    {form.mode === "instant" && (
                      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-primary/15">
                        {INSTANT_WINDOWS.map(w => (
                          <button
                            key={w.value}
                            onClick={e => { e.stopPropagation(); update("instant_window", w.value); }}
                            className={`py-2.5 rounded-xl text-xs font-semibold transition-all ${
                              form.instant_window === w.value
                                ? "bg-primary text-primary-foreground"
                                : "bg-background/80 text-foreground border border-border"
                            }`}
                          >
                            {w.icon} {w.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </ModeCard>

                  {/* Schedule */}
                  <ModeCard
                    selected={form.mode === "scheduled"}
                    onClick={() => update("mode", "scheduled")}
                    icon="📅"
                    iconBg="bg-blue-500"
                    title="Schedule a Match"
                    sub="Pick a date, time and venue"
                  />

                  {/* Recurring */}
                  <ModeCard
                    selected={form.mode === "recurring"}
                    onClick={() => update("mode", "recurring")}
                    icon="🔁"
                    iconBg="bg-purple-500"
                    title="Recurring Match"
                    sub="Set up a weekly or regular game"
                  >
                    {form.mode === "recurring" && (
                      <div className="mt-3 pt-3 border-t border-primary/15">
                        <RecurrenceConfig value={recurring} onChange={setRecurring} />
                      </div>
                    )}
                  </ModeCard>
                </div>
              </>
            )}

            {/* ═══════════════════════════════════════════════
                STEP 2: SETUP
            ════════════════════════════════════════════════ */}
            {currentStep === "setup" && (
              <>
                <div>
                  <h2 className="font-heading font-bold text-2xl mb-1">Match Setup 🏓</h2>
                  <p className="text-muted-foreground text-sm">Pick your format</p>
                </div>

                {/* Format */}
                <div>
                  <p className="text-sm font-medium mb-2">Format</p>
                  <div className="grid grid-cols-3 gap-2">
                    {MATCH_TYPES.map(t => (
                      <button
                        key={t.value}
                        onClick={() => update("match_type", t.value)}
                        className={`py-4 rounded-2xl border-2 text-center transition-all ${
                          form.match_type === t.value
                            ? "border-primary bg-primary/10 shadow-sm shadow-primary/10"
                            : "border-border bg-card"
                        }`}
                      >
                        <div className="text-2xl mb-1">{t.icon}</div>
                        <p className={`font-heading font-bold text-sm ${form.match_type === t.value ? "text-primary" : "text-foreground"}`}>{t.label}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{t.sub}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Match name */}
                <div>
                  <p className="text-sm font-medium mb-2">Match Name <span className="text-muted-foreground font-normal text-xs">(auto-filled)</span></p>
                  <Input
                    value={form.title}
                    onChange={e => update("title", e.target.value)}
                    placeholder={autoTitle(form.match_type, venue)}
                    className="rounded-xl h-11 bg-card"
                  />
                </div>

                {/* Duration */}
                <div>
                  <p className="text-sm font-medium mb-2">Duration</p>
                  <div className="flex gap-2">
                    {DURATIONS.map(d => (
                      <button
                        key={d}
                        onClick={() => update("duration_minutes", d)}
                        className={`flex-1 py-3 rounded-xl border-2 font-heading font-semibold text-sm transition-all ${
                          form.duration_minutes === d
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card text-foreground"
                        }`}
                      >
                        {d}m
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ═══════════════════════════════════════════════
                STEP 3: WHEN & WHERE (scheduled only)
            ════════════════════════════════════════════════ */}
            {currentStep === "when" && (
              <>
                <div>
                  <h2 className="font-heading font-bold text-2xl mb-1">When & where? 📍</h2>
                  <p className="text-muted-foreground text-sm">Venue is optional — you can confirm later</p>
                </div>

                {/* Date & Time row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-sm font-medium mb-1.5">Date</p>
                    <Input
                      type="date"
                      min={new Date().toISOString().split("T")[0]}
                      value={form.date}
                      onChange={e => update("date", e.target.value)}
                      className="rounded-xl h-11 bg-card"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-1.5">Time</p>
                    <Input
                      type="time"
                      value={form.time}
                      onChange={e => update("time", e.target.value)}
                      className="rounded-xl h-11 bg-card"
                    />
                  </div>
                </div>

                {/* Venue */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">Venue</p>
                    <span className="text-[11px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">Optional</span>
                  </div>
                  <VenuePicker sport="padel" value={venue} onChange={setVenue} />
                  {!venue && (
                    <button
                      type="button"
                      onClick={() => setVenue({ name: "TBD — to be confirmed", address: "" })}
                      className="mt-2 text-xs text-primary font-medium"
                    >
                      📍 No venue yet — confirm after players join
                    </button>
                  )}
                </div>

                {/* Recurrence (only if recurring mode) */}
                {isRecurring && (
                  <div className="pt-1">
                    <RecurrenceConfig value={recurring} onChange={setRecurring} />
                  </div>
                )}
              </>
            )}

            {/* ═══════════════════════════════════════════════
                STEP 4: PLAYERS & SKILL
            ════════════════════════════════════════════════ */}
            {currentStep === "players" && (
              <>
                <div>
                  <h2 className="font-heading font-bold text-2xl mb-1">Players & Skill 👥</h2>
                  <p className="text-muted-foreground text-sm">Who should join?</p>
                </div>

                {/* Skill level */}
                <div>
                  <p className="text-sm font-medium mb-2">Skill Level</p>
                  <div className="grid grid-cols-2 gap-2">
                    {SKILL_OPTIONS.map(s => (
                      <button
                        key={s.value}
                        onClick={() => update("skill_level", s.value)}
                        className={`py-3 rounded-2xl border-2 text-center font-semibold text-sm transition-all ${
                          form.skill_level === s.value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card text-foreground"
                        }`}
                      >
                        {s.icon} {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Visibility */}
                <div>
                  <p className="text-sm font-medium mb-2">Who can join?</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => update("visibility", "public")}
                      className={`p-3.5 rounded-2xl border-2 text-left transition-all ${
                        form.visibility === "public" ? "border-primary bg-primary/10" : "border-border bg-card"
                      }`}
                    >
                      <p className={`font-heading font-bold text-sm ${form.visibility === "public" ? "text-primary" : ""}`}>🌍 Public</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Anyone can join</p>
                    </button>
                    <button
                      onClick={() => update("visibility", "invite_only")}
                      className={`p-3.5 rounded-2xl border-2 text-left transition-all ${
                        form.visibility === "invite_only" ? "border-primary bg-primary/10" : "border-border bg-card"
                      }`}
                    >
                      <p className={`font-heading font-bold text-sm ${form.visibility === "invite_only" ? "text-primary" : ""}`}>🔒 Invite Only</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Friends only</p>
                    </button>
                  </div>
                </div>

                {/* Vibe / Tags */}
                <div>
                  <p className="text-sm font-medium mb-2">Vibe <span className="text-muted-foreground font-normal text-xs">(optional)</span></p>
                  <div className="flex flex-wrap gap-2">
                    {TAG_OPTIONS.map(t => (
                      <button
                        key={t.label}
                        onClick={() => toggleTag(t.label)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold transition-all ${
                          form.tags.includes(t.label)
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        {t.icon} {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Advanced Options (collapsed) ── */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(v => !v)}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    Advanced Options
                  </button>

                  <AnimatePresence>
                    {showAdvanced && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 space-y-4 p-4 bg-muted/40 rounded-2xl">
                          {/* Scoring */}
                          <div>
                            <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Scoring Format</p>
                            <div className="grid grid-cols-2 gap-2">
                              {[{ v: "simple", l: "🎯 Simple" }, { v: "sets", l: "🎾 Set-Based" }].map(({ v, l }) => (
                                <button key={v} onClick={() => update("scoring_mode", v)}
                                  className={`py-2.5 rounded-xl border text-sm font-medium transition-all ${
                                    form.scoring_mode === v ? "border-primary bg-primary/10 text-primary" : "border-border bg-card"
                                  }`}>
                                  {l}
                                </button>
                              ))}
                            </div>
                            {form.scoring_mode === "sets" && (
                              <div className="mt-3 space-y-2">
                                <p className="text-xs font-medium">Sets</p>
                                <div className="grid grid-cols-3 gap-2">
                                  {[{ v: 1, l: "1 Set" }, { v: 3, l: "Best of 3" }, { v: 5, l: "Best of 5" }].map(({ v, l }) => (
                                    <button key={v} onClick={() => update("num_sets", v)}
                                      className={`py-2 rounded-xl border text-xs font-medium transition-all ${
                                        form.num_sets === v ? "border-primary bg-primary/5 text-primary" : "border-border bg-card"
                                      }`}>
                                      {l}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Auto-balance */}
                          {form.match_type !== "singles" && (
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium">Auto-balance Teams</p>
                                <p className="text-xs text-muted-foreground">Balance skill levels automatically</p>
                              </div>
                              <Switch checked={form.auto_balance} onCheckedChange={v => update("auto_balance", v)} />
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Preview card */}
                <div className="p-4 bg-gradient-to-br from-primary/8 to-accent/5 rounded-2xl border border-primary/15">
                  <p className="font-heading font-semibold text-xs text-primary uppercase tracking-wide mb-2">Match Preview</p>
                  <p className="font-heading font-bold text-base">{form.title || autoTitle(form.match_type, venue)}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                    {isInstant ? (
                      <span>⚡ {INSTANT_WINDOWS.find(w => w.value === form.instant_window)?.label}</span>
                    ) : form.date ? (
                      <span>📅 {form.date}{form.time ? ` · ${form.time}` : ""}</span>
                    ) : null}
                    {venue && <span>📍 {venue.name}</span>}
                    <span>👥 {MATCH_TYPES.find(t => t.value === form.match_type)?.label} · {form.duration_minutes}min</span>
                    <span className="capitalize">🎯 {SKILL_OPTIONS.find(s => s.value === form.skill_level)?.label}</span>
                  </div>
                </div>
              </>
            )}

          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Sticky Bottom CTA ── */}
      <div className="fixed bottom-14 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border px-5 py-3 z-10">
        <div className="max-w-lg mx-auto">
          {stepIdx < totalSteps - 1 ? (
            <Button
              onClick={handleNext}
              className="w-full h-12 rounded-2xl font-heading font-bold text-base shadow-lg shadow-primary/20"
            >
              Continue →
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full h-12 rounded-2xl font-heading font-bold text-base shadow-xl shadow-primary/25"
            >
              {loading
                ? <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                : isInstant ? "Find Players ⚡" : "Create Match 🎾"
              }
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ModeCard({ selected, onClick, icon, iconBg, title, sub, badge, badgeColor, children }) {
  return (
    <div
      onClick={onClick}
      className={`cursor-pointer rounded-2xl border-2 p-4 transition-all ${
        selected
          ? "border-primary bg-primary/8 shadow-md shadow-primary/10"
          : "border-border bg-card"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${iconBg || "bg-primary/10"}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`font-heading font-bold text-sm ${selected ? "text-primary" : "text-foreground"}`}>{title}</p>
            {badge && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>}
          </div>
          <p className="text-xs text-muted-foreground">{sub}</p>
        </div>
        <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
          selected ? "border-primary bg-primary" : "border-border"
        }`}>
          {selected && <div className="w-2 h-2 rounded-full bg-white" />}
        </div>
      </div>
      {children}
    </div>
  );
}