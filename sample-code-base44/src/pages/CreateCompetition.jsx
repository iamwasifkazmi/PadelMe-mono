import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Trophy, Calendar, MapPin, Users, DollarSign, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";
import SubscriptionGate from "../components/SubscriptionGate";
import VisibilityPicker from "../components/VisibilityPicker";
import VenuePicker from "../components/VenuePicker";
import { motion } from "framer-motion";

export default function CreateCompetition() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [venue, setVenue] = useState(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    type: "tournament",
    format: "knockout",
    location_name: "",
    start_date: "",
    end_date: "",
    skill_level: "any",
    max_players: 8,
    entry_fee: 0,
    prize_type: "non_cash",
    prize_description: "",
    is_verified_only: false,
    visibility: "public",
    season: "",
    weekly_day: "",
    league_weeks: 8,
    gender_requirement: "any",
    age_min: "",
    age_max: "",
    skill_range_min: "",
    skill_range_max: "",
    min_rating_threshold: "",
    verification_requirement: "none",
    team_structure: "singles",
    scoring_mode: "simple",
    num_sets: 1,
    games_per_set: 6,
    tiebreak_rule: "tiebreak_at_6",
    points_win: 3,
    points_loss: 0,
    points_draw: 1,
    allow_draws: false,
  });

  useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      setCheckingAuth(false);
    });
  }, []);

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    if (!form.name || !form.start_date || !venue) {
      toast({ title: "Missing fields", description: "Please fill in all required fields including a venue", variant: "destructive" });
      return;
    }

    setLoading(true);
    const platformFee = form.entry_fee > 0 ? form.entry_fee * form.max_players * 0.025 : 0;
    const prizePool = form.entry_fee > 0 ? form.entry_fee * form.max_players - platformFee : 0;

    const comp = await base44.entities.Competition.create({
      ...form,
      location_name: venue.name,
      location_address: venue.address,
      participants: [],
      status: "registration",
      host_email: user?.email,
      platform_fee_pct: 2.5,
      prize_pool: prizePool,
      invited_emails: [user?.email],
      sport: "Padel",
    });

    toast({ title: "Competition created! 🏆", description: "Players can now join and register" });
    navigate(`/competition/${comp.id}`);
    setLoading(false);
  };

  if (checkingAuth) return null;

  if (!user?.is_subscribed) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="px-5 pt-6 pb-2">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-muted-foreground text-sm">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </div>
        <SubscriptionGate onSubscribed={() => window.location.reload()} />
      </div>
    );
  }

  const isLeague = form.type === "league";
  const estimatedPool = form.entry_fee > 0
    ? (form.entry_fee * form.max_players * 0.975).toFixed(2)
    : 0;

  return (
    <div className="max-w-lg mx-auto">
      <div className="px-5 pt-6 pb-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-muted-foreground mb-3">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-2">
          <h1 className="font-heading font-bold text-2xl">Host a Padel Competition</h1>
          <Crown className="w-5 h-5 text-accent" />
        </div>
        <p className="text-muted-foreground text-sm mt-0.5">Set up a Padel tournament or weekly league</p>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="px-5 space-y-5 pb-8">
        {/* Type toggle */}
        <div className="grid grid-cols-2 gap-2">
          {["tournament", "league"].map((t) => (
            <button
              key={t}
              onClick={() => update("type", t)}
              className={`p-3 rounded-xl border text-sm font-heading font-semibold capitalize transition-all ${
                form.type === t
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              {t === "tournament" ? "🏆 Tournament" : "📅 League"}
            </button>
          ))}
        </div>

        <div>
          <Label className="text-sm font-medium mb-2 block">Competition Name</Label>
          <Input
            placeholder={isLeague ? "e.g. Madrid Club League Season 1" : "e.g. Spring Padel Open 2026"}
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            className="rounded-xl h-11 bg-card"
          />
        </div>

        <div>
          <Label className="text-sm font-medium mb-2 block">Description</Label>
          <Textarea
            placeholder="Tell players about this competition..."
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            className="rounded-xl bg-card resize-none"
            rows={2}
          />
        </div>

        {/* Format */}
        <div>
          <Label className="text-sm font-medium mb-2 block">Format</Label>
          <Select value={form.format} onValueChange={(v) => update("format", v)}>
            <SelectTrigger className="rounded-xl h-11 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="knockout">Knockout</SelectItem>
              <SelectItem value="round_robin">Round Robin</SelectItem>
              <SelectItem value="group_knockout">Group + Knockout</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Location */}
        <div>
          <Label className="text-sm font-medium mb-2 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" /> Venue
          </Label>
          <VenuePicker sport="padel" value={venue} onChange={setVenue} />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-sm font-medium mb-2 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Start Date
            </Label>
            <Input type="date" value={form.start_date} onChange={(e) => update("start_date", e.target.value)} className="rounded-xl h-11 bg-card" />
          </div>
          <div>
            <Label className="text-sm font-medium mb-2 block">End Date</Label>
            <Input type="date" value={form.end_date} onChange={(e) => update("end_date", e.target.value)} className="rounded-xl h-11 bg-card" />
          </div>
        </div>

        {isLeague && (
          <div className="space-y-3 p-4 bg-primary/5 rounded-2xl border border-primary/20">
            <p className="text-xs font-heading font-semibold text-primary uppercase tracking-wide">📅 Weekly Schedule</p>
            <div>
              <Label className="text-sm font-medium mb-2 block">Fixture Day</Label>
              <Select value={form.weekly_day} onValueChange={(v) => update("weekly_day", v)}>
                <SelectTrigger className="rounded-xl h-11 bg-card">
                  <SelectValue placeholder="Select day..." />
                </SelectTrigger>
                <SelectContent>
                  {["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block">League Duration (weeks)</Label>
              <Select value={String(form.league_weeks)} onValueChange={(v) => update("league_weeks", Number(v))}>
                <SelectTrigger className="rounded-xl h-11 bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[4, 6, 8, 10, 12, 16, 20].map((w) => (
                    <SelectItem key={w} value={String(w)}>{w} weeks</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1.5">New match-ups will be generated automatically every {form.weekly_day || "selected day"}. The league ends after {form.league_weeks} rounds.</p>
            </div>
          </div>
        )}

        {/* Players & Skill */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-sm font-medium mb-2 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Max Players
            </Label>
            <Select value={String(form.max_players)} onValueChange={(v) => update("max_players", Number(v))}>
              <SelectTrigger className="rounded-xl h-11 bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[4, 8, 16, 32].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} Players</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm font-medium mb-2 block">Skill Level</Label>
            <Select value={form.skill_level} onValueChange={(v) => update("skill_level", v)}>
              <SelectTrigger className="rounded-xl h-11 bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any Level</SelectItem>
                <SelectItem value="beginner">Beginner</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="advanced">Advanced</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Entry Fee */}
        <div>
          <Label className="text-sm font-medium mb-2 flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5" /> Entry Fee (£)
          </Label>
          <Input
            type="number"
            min="0"
            placeholder="0 = free"
            value={form.entry_fee || ""}
            onChange={(e) => update("entry_fee", Number(e.target.value))}
            className="rounded-xl h-11 bg-card"
          />
          {form.entry_fee > 0 && (
            <div className="mt-2 p-3 bg-primary/5 rounded-xl border border-primary/20 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{form.max_players} players × £{form.entry_fee}</span>
                <span>£{(form.entry_fee * form.max_players).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-destructive/70">
                <span>Platform fee (2.5%)</span>
                <span>−£{(form.entry_fee * form.max_players * 0.025).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-semibold text-primary border-t border-primary/20 pt-1">
                <span>Prize Pool</span>
                <span>£{estimatedPool}</span>
              </div>
            </div>
          )}
        </div>

        {/* Prize type */}
        <div>
          <Label className="text-sm font-medium mb-2 block">Prize Type</Label>
          <div className="flex gap-2">
            {[
              { value: "cash", label: "💰 Cash" },
              { value: "non_cash", label: "🎖 Bragging Rights" },
              { value: "badges", label: "🏅 Badges" },
            ].map((p) => (
              <button
                key={p.value}
                onClick={() => update("prize_type", p.value)}
                className={`flex-1 py-2 rounded-xl border text-xs font-medium transition-all ${
                  form.prize_type === p.value
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium mb-2 block">Prize Details</Label>
          <Input
            placeholder="e.g. Winner takes all, Club membership, etc."
            value={form.prize_description}
            onChange={(e) => update("prize_description", e.target.value)}
            className="rounded-xl h-11 bg-card"
          />
        </div>

        {/* Visibility */}
        <VisibilityPicker value={form.visibility} onChange={(v) => update("visibility", v)} />

        {/* Eligibility Criteria */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="font-heading font-semibold text-base">Eligibility Criteria</h3>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Rules players must meet to join</span>
          </div>

          {/* Team structure */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Team Structure</Label>
            <div className="grid grid-cols-3 gap-2">
              {[{v:"singles",l:"Singles"},{v:"doubles",l:"Doubles"},{v:"mixed_doubles",l:"Mixed Doubles"}].map(({v,l}) => (
                <button key={v} onClick={() => update("team_structure", v)}
                  className={`py-2 rounded-xl border text-xs font-medium transition-all ${form.team_structure === v ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-muted-foreground"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Gender */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Gender</Label>
            <div className="grid grid-cols-4 gap-2">
              {[{v:"any",l:"Any"},{v:"male",l:"Male"},{v:"female",l:"Female"},{v:"mixed",l:"Mixed"}].map(({v,l}) => (
                <button key={v} onClick={() => update("gender_requirement", v)}
                  className={`py-2 rounded-xl border text-xs font-medium transition-all ${form.gender_requirement === v ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-muted-foreground"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Age range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm font-medium mb-2 block">Min Age</Label>
              <Input type="number" placeholder="e.g. 18" value={form.age_min} onChange={(e) => update("age_min", e.target.value)} className="rounded-xl h-11 bg-card" />
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block">Max Age</Label>
              <Input type="number" placeholder="e.g. 40" value={form.age_max} onChange={(e) => update("age_max", e.target.value)} className="rounded-xl h-11 bg-card" />
            </div>
          </div>

          {/* Skill range */}
          <div>
            <Label className="text-sm font-medium mb-1.5 block">Skill Level Range (1–10)</Label>
            <p className="text-xs text-muted-foreground mb-2">⚠️ Inverted scale: <strong>1 = Elite/Pro</strong>, <strong>10 = Beginner</strong>. Set the range of skill levels allowed. E.g. 4–7 lets intermediate players join.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Best skill allowed (lowest #)</Label>
                <Input type="number" min="1" max="10" placeholder="e.g. 3" value={form.skill_range_min} onChange={(e) => update("skill_range_min", e.target.value)} className="rounded-xl h-11 bg-card" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Worst skill allowed (highest #)</Label>
                <Input type="number" min="1" max="10" placeholder="e.g. 8" value={form.skill_range_max} onChange={(e) => update("skill_range_max", e.target.value)} className="rounded-xl h-11 bg-card" />
              </div>
            </div>
          </div>

          {/* Min rating threshold */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Minimum Reliability Rating</Label>
            <Input type="number" min="1" max="5" step="0.1" placeholder="e.g. 3.5 (leave blank for no minimum)" value={form.min_rating_threshold} onChange={(e) => update("min_rating_threshold", e.target.value)} className="rounded-xl h-11 bg-card" />
          </div>

          {/* Verification requirement */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Verification Requirement</Label>
            <div className="grid grid-cols-3 gap-2">
              {[{v:"none",l:"None"},{v:"photo",l:"📸 Photo"},{v:"id",l:"🪪 ID Verified"}].map(({v,l}) => (
                <button key={v} onClick={() => update("verification_requirement", v)}
                  className={`py-2 rounded-xl border text-xs font-medium transition-all ${form.verification_requirement === v ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-muted-foreground"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Scoring Format for Tournament Matches */}
        {form.type === "tournament" && (
          <div className="space-y-3">
            <Label className="text-sm font-medium block">Match Scoring Format</Label>
            <div className="grid grid-cols-2 gap-2">
              {[{ v: "simple", l: "Simple Score" }, { v: "sets", l: "Set-Based" }].map(({ v, l }) => (
                <button
                  key={v}
                  onClick={() => update("scoring_mode", v)}
                  className={`py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    form.scoring_mode === v ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            {form.scoring_mode === "sets" && (
              <div className="space-y-3 p-4 bg-muted/40 rounded-2xl">
                <div>
                  <Label className="text-sm font-medium mb-2 block">Number of Sets</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[{ v: 1, l: "1 Set" }, { v: 3, l: "Best of 3" }, { v: 5, l: "Best of 5" }].map(({ v, l }) => (
                      <button key={v} onClick={() => update("num_sets", v)}
                        className={`py-2 rounded-xl border text-xs font-medium transition-all ${
                          form.num_sets === v ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-muted-foreground"
                        }`}>{l}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium mb-2 block">Games per Set</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[{ v: 4, l: "First to 4" }, { v: 6, l: "First to 6" }, { v: 8, l: "First to 8" }].map(({ v, l }) => (
                      <button key={v} onClick={() => update("games_per_set", v)}
                        className={`py-2 rounded-xl border text-xs font-medium transition-all ${
                          form.games_per_set === v ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-muted-foreground"
                        }`}>{l}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium mb-2 block">Tie-Break</Label>
                  <Select value={form.tiebreak_rule} onValueChange={(v) => update("tiebreak_rule", v)}>
                    <SelectTrigger className="rounded-xl h-11 bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tiebreak_at_6">Tie-break at 6–6</SelectItem>
                      <SelectItem value="match_tiebreak">Match tie-break (first to 10)</SelectItem>
                      <SelectItem value="none">No tie-break</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Group Stage Points Configuration */}
        {form.type === "tournament" && (form.format === "round_robin" || form.format === "group_knockout") && (
          <div className="space-y-4 p-4 bg-gradient-to-br from-primary/5 to-accent/5 rounded-2xl border border-primary/20">
            <div className="flex items-center gap-2">
              <h3 className="font-heading font-semibold text-base">Group Stage Points Rules</h3>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Optional: Customize or use defaults</span>
            </div>
            <p className="text-xs text-muted-foreground">Define how many points are awarded for each match result in group stage tables.</p>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-sm font-medium mb-2 block">Win</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.points_win}
                  onChange={(e) => update("points_win", Number(e.target.value))}
                  className="rounded-xl h-11 bg-card text-center font-heading"
                />
                <p className="text-xs text-muted-foreground mt-1 text-center">points</p>
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block">Loss</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.points_loss}
                  onChange={(e) => update("points_loss", Number(e.target.value))}
                  className="rounded-xl h-11 bg-card text-center font-heading"
                />
                <p className="text-xs text-muted-foreground mt-1 text-center">points</p>
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block">Draw</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.points_draw}
                  onChange={(e) => update("points_draw", Number(e.target.value))}
                  className="rounded-xl h-11 bg-card text-center font-heading"
                />
                <p className="text-xs text-muted-foreground mt-1 text-center">points</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-card rounded-xl border border-border">
              <div>
                <p className="font-medium text-sm">Allow draws</p>
                <p className="text-muted-foreground text-xs">Players can agree to draw a match</p>
              </div>
              <Switch checked={form.allow_draws} onCheckedChange={(v) => update("allow_draws", v)} />
            </div>

            <div className="p-3 bg-background/50 rounded-lg border border-border text-xs text-muted-foreground">
              <strong>Example:</strong> Win = {form.points_win}, Loss = {form.points_loss}, Draw = {form.points_draw}
            </div>
          </div>
        )}

        <Button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full h-12 rounded-xl font-heading font-semibold text-base shadow-lg shadow-primary/20"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
          ) : (
            "Create Competition 🏆"
          )}
        </Button>
      </motion.div>
    </div>
  );
}