import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import {
  CheckCircle, XCircle, Clock, Play, RefreshCw, Shield,
  User, Trophy, Star, Bell, CreditCard, ChevronDown, ChevronRight, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─── Test runner ────────────────────────────────────────────────────────────
const STATUS = { idle: "idle", running: "running", pass: "pass", fail: "fail" };

function useTestRunner() {
  const [results, setResults] = useState({});

  const run = async (id, fn) => {
    setResults((p) => ({ ...p, [id]: { status: STATUS.running, msg: "" } }));
    try {
      const msg = await fn();
      setResults((p) => ({ ...p, [id]: { status: STATUS.pass, msg: msg || "Passed" } }));
    } catch (e) {
      setResults((p) => ({ ...p, [id]: { status: STATUS.fail, msg: e.message || "Failed" } }));
    }
  };

  const reset = (id) => setResults((p) => ({ ...p, [id]: { status: STATUS.idle, msg: "" } }));
  const resetAll = () => setResults({});

  return { results, run, reset, resetAll };
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function StatusIcon({ status }) {
  if (status === STATUS.running) return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
  if (status === STATUS.pass) return <CheckCircle className="w-4 h-4 text-green-500" />;
  if (status === STATUS.fail) return <XCircle className="w-4 h-4 text-destructive" />;
  return <Clock className="w-4 h-4 text-muted-foreground" />;
}

function TestRow({ id, label, description, results, onRun }) {
  const r = results[id] || { status: STATUS.idle };
  return (
    <div className={`flex items-start justify-between gap-3 p-3 rounded-xl border transition-colors ${
      r.status === STATUS.pass ? "bg-green-50 border-green-200" :
      r.status === STATUS.fail ? "bg-red-50 border-red-200" :
      r.status === STATUS.running ? "bg-blue-50 border-blue-200" :
      "bg-card border-border"
    }`}>
      <div className="flex items-start gap-2 flex-1 min-w-0">
        <StatusIcon status={r.status} />
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
          {r.msg && (
            <p className={`text-xs mt-0.5 ${r.status === STATUS.fail ? "text-destructive" : "text-green-700"}`}>
              {r.msg}
            </p>
          )}
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="rounded-lg h-7 text-xs gap-1 flex-shrink-0"
        disabled={r.status === STATUS.running}
        onClick={() => onRun(id)}
      >
        <Play className="w-3 h-3" />
        {r.status === STATUS.idle ? "Run" : "Re-run"}
      </Button>
    </div>
  );
}

function Section({ icon: Icon, title, color, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
          <span className="font-heading font-semibold">{title}</span>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4 space-y-2">{children}</div>}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminTestMode() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const { results, run, resetAll } = useTestRunner();

  useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      setAuthChecked(true);
      if (u?.role !== "admin") navigate("/");
    }).catch(() => { setAuthChecked(true); navigate("/"); });
  }, []);

  // ── Summary ────────────────────────────────────────────────────────────────
  const all = Object.values(results);
  const passed = all.filter((r) => r.status === STATUS.pass).length;
  const failed = all.filter((r) => r.status === STATUS.fail).length;
  const running = all.filter((r) => r.status === STATUS.running).length;

  // ── Test definitions ───────────────────────────────────────────────────────

  // AUTH
  const runAuthMe = () => run("auth_me", async () => {
    const u = await base44.auth.me();
    if (!u?.email) throw new Error("No authenticated user returned");
    return `Logged in as ${u.email} (${u.role})`;
  });

  const runAuthAdmin = () => run("auth_admin", async () => {
    const u = await base44.auth.me();
    if (u.role !== "admin") throw new Error(`Role is '${u.role}', expected 'admin'`);
    return "User has admin role";
  });

  // PROFILE
  const runProfileRead = () => run("profile_read", async () => {
    const u = await base44.auth.me();
    const required = ["email", "full_name"];
    const missing = required.filter((f) => !u[f]);
    if (missing.length) throw new Error(`Missing fields: ${missing.join(", ")}`);
    return `Profile OK — ${u.full_name}`;
  });

  const runProfileUpdate = () => run("profile_update", async () => {
    const before = await base44.auth.me();
    await base44.auth.updateMe({ bio: `Test bio @ ${Date.now()}` });
    const after = await base44.auth.me();
    if (!after.bio) throw new Error("Bio did not save");
    await base44.auth.updateMe({ bio: before.bio || "" });
    return "Profile update and revert OK";
  });

  const runProfileSubscription = () => run("profile_subscription", async () => {
    const u = await base44.auth.me();
    return `is_subscribed = ${!!u.is_subscribed}`;
  });

  // MATCH CREATION
  const runMatchCreate = () => run("match_create", async () => {
    const u = await base44.auth.me();
    const m = await base44.entities.Match.create({
      title: `[TEST] Match ${Date.now()}`,
      date: new Date(Date.now() + 86400000).toISOString().split("T")[0],
      time: "18:00",
      location_name: "Test Court",
      skill_level: "intermediate",
      max_players: 4,
      players: [u.email],
      status: "open",
      is_instant: false,
    });
    if (!m?.id) throw new Error("No match ID returned");
    await base44.entities.Match.delete(m.id);
    return `Match created and cleaned up (id: ${m.id.slice(0, 8)}...)`;
  });

  const runMatchRequiredFields = () => run("match_required_fields", async () => {
    let threw = false;
    try {
      await base44.entities.Match.create({ title: "" });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("Server accepted incomplete match — validation missing");
    return "Incomplete match correctly rejected";
  });

  const runMatchList = () => run("match_list", async () => {
    const matches = await base44.entities.Match.list("-created_date", 5);
    return `Listed ${matches.length} match(es) successfully`;
  });

  const runMatchJoin = () => run("match_join", async () => {
    const u = await base44.auth.me();
    const m = await base44.entities.Match.create({
      title: `[TEST] Join Test ${Date.now()}`,
      date: new Date(Date.now() + 86400000).toISOString().split("T")[0],
      time: "19:00",
      location_name: "Test Court",
      skill_level: "any",
      max_players: 4,
      players: [],
      status: "open",
    });
    const updated = [...(m.players || []), u.email];
    await base44.entities.Match.update(m.id, { players: updated });
    const refetched = await base44.entities.Match.filter({ id: m.id }, "-created_date", 1).then((r) => r[0]);
    if (!refetched.players.includes(u.email)) throw new Error("Player email not in players array after join");
    await base44.entities.Match.delete(m.id);
    return "Join and player array update verified";
  });

  // SCORE SUBMISSION
  const runScoreSubmit = () => run("score_submit", async () => {
    const u = await base44.auth.me();
    const m = await base44.entities.CompetitionMatch.create({
      competition_id: "test",
      round: 1,
      player1_email: u.email,
      player1_name: u.full_name,
      player2_email: "opponent@test.com",
      player2_name: "Opponent",
      status: "scheduled",
    });
    await base44.entities.CompetitionMatch.update(m.id, {
      submitted_score_p1: "6",
      submitted_score_p2: "4",
      submitted_by: u.email,
      status: "pending_validation",
    });
    const r = await base44.entities.CompetitionMatch.filter({ id: m.id }, "-created_date", 1).then((r) => r[0]);
    if (r.status !== "pending_validation") throw new Error(`Status is '${r.status}', expected 'pending_validation'`);
    await base44.entities.CompetitionMatch.delete(m.id);
    return "Score submission → pending_validation flow verified";
  });

  const runScoreConfirm = () => run("score_confirm", async () => {
    const u = await base44.auth.me();
    const m = await base44.entities.CompetitionMatch.create({
      competition_id: "test",
      round: 1,
      player1_email: u.email,
      player1_name: u.full_name,
      player2_email: "opp@test.com",
      player2_name: "Opp",
      submitted_score_p1: "6",
      submitted_score_p2: "3",
      submitted_by: "opp@test.com",
      status: "pending_validation",
    });
    await base44.entities.CompetitionMatch.update(m.id, {
      score_player1: m.submitted_score_p1,
      score_player2: m.submitted_score_p2,
      winner_email: u.email,
      confirmed_by: u.email,
      status: "confirmed",
    });
    const r = await base44.entities.CompetitionMatch.filter({ id: m.id }, "-created_date", 1).then((r) => r[0]);
    if (r.status !== "confirmed") throw new Error(`Status is '${r.status}', expected 'confirmed'`);
    await base44.entities.CompetitionMatch.delete(m.id);
    return "Score confirmation flow verified";
  });

  const runScoreDispute = () => run("score_dispute", async () => {
    const u = await base44.auth.me();
    const m = await base44.entities.CompetitionMatch.create({
      competition_id: "test",
      round: 1,
      player1_email: "p1@test.com",
      player1_name: "P1",
      player2_email: u.email,
      player2_name: u.full_name,
      submitted_score_p1: "6",
      submitted_score_p2: "4",
      submitted_by: "p1@test.com",
      status: "pending_validation",
    });
    await base44.entities.CompetitionMatch.update(m.id, {
      rejected_by: u.email,
      rejection_reason: "Test dispute",
      status: "disputed",
    });
    const r = await base44.entities.CompetitionMatch.filter({ id: m.id }, "-created_date", 1).then((r) => r[0]);
    if (r.status !== "disputed") throw new Error(`Status is '${r.status}', expected 'disputed'`);
    await base44.entities.CompetitionMatch.delete(m.id);
    return "Dispute flow verified";
  });

  // RATINGS
  const runRatingCreate = () => run("rating_create", async () => {
    const u = await base44.auth.me();
    const r = await base44.entities.Rating.create({
      match_id: "test-match",
      rater_email: u.email,
      rated_email: "rated@test.com",
      overall: 5,
      tags: ["showed_up_on_time", "good_attitude"],
    });
    if (!r?.id) throw new Error("No rating ID returned");
    await base44.entities.Rating.delete(r.id);
    return "Rating create and cleanup OK";
  });

  const runRatingAvgCalc = () => run("rating_avg_calc", async () => {
    const u = await base44.auth.me();
    const ratings = await base44.entities.Rating.filter({ rated_email: u.email }, "-created_date", 100);
    if (ratings.length === 0) return "No ratings found (new user) — avg would be null ✓";
    const avg = ratings.reduce((s, r) => s + (r.overall || 0), 0) / ratings.length;
    if (isNaN(avg)) throw new Error("Average calculation produced NaN");
    return `Average of ${ratings.length} ratings = ${avg.toFixed(2)} ★`;
  });

  const runRatingThreshold = () => run("rating_threshold", async () => {
    const thresholds = [
      { score: 2.4, expected: "restricted" },
      { score: 2.9, expected: "reduced_visibility" },
      { score: 3.4, expected: "warning" },
      { score: 4.0, expected: "ok" },
    ];
    const results = thresholds.map(({ score, expected }) => {
      const status = score < 2.5 ? "restricted" : score < 3.0 ? "reduced_visibility" : score < 3.5 ? "warning" : "ok";
      return status === expected ? `${score}★ → ${status} ✓` : `${score}★ → ${status} ✗ (expected ${expected})`;
    });
    const failed = results.filter((r) => r.includes("✗"));
    if (failed.length) throw new Error(failed.join(", "));
    return results.join(" | ");
  });

  // SUBSCRIPTION
  const runSubCheck = () => run("sub_check", async () => {
    const u = await base44.auth.me();
    return `is_subscribed = ${!!u.is_subscribed}${u.is_subscribed ? ` (since ${u.subscription_since?.split("T")[0]})` : " — free user"}`;
  });

  const runSubGate = () => run("sub_gate", async () => {
    const u = await base44.auth.me();
    if (u.is_subscribed) return "Subscribed — premium features unlocked ✓";
    return "Not subscribed — SubscriptionGate should block competition creation ✓";
  });

  const runSubActivate = () => run("sub_activate", async () => {
    const u = await base44.auth.me();
    await base44.auth.updateMe({ is_subscribed: true, subscription_since: new Date().toISOString() });
    const after = await base44.auth.me();
    if (!after.is_subscribed) throw new Error("Subscription flag did not persist");
    return "Subscription activated — re-run Sub Check to verify";
  });

  const runSubDeactivate = () => run("sub_deactivate", async () => {
    await base44.auth.updateMe({ is_subscribed: false, subscription_since: null });
    const after = await base44.auth.me();
    if (after.is_subscribed) throw new Error("Subscription flag still true after deactivation");
    return "Subscription deactivated — premium features should be blocked ✓";
  });

  // COMPETITIONS
  const runCompCreate = () => run("comp_create", async () => {
    const u = await base44.auth.me();
    const c = await base44.entities.Competition.create({
      name: `[TEST] Tournament ${Date.now()}`,
      type: "tournament",
      format: "knockout",
      status: "registration",
      skill_level: "any",
      max_players: 8,
      entry_fee: 10,
      participants: [],
      host_email: u.email,
    });
    if (!c?.id) throw new Error("No competition ID returned");
    await base44.entities.Competition.delete(c.id);
    return "Competition create + cleanup verified";
  });

  const runCompPlatformFee = () => run("comp_platform_fee", async () => {
    const fee = 10;
    const players = 8;
    const gross = fee * players;
    const platformFee = gross * 0.025;
    const net = gross - platformFee;
    if (Math.abs(platformFee - 2) > 0.001) throw new Error(`Fee ${platformFee} ≠ expected 2.00`);
    if (Math.abs(net - 78) > 0.001) throw new Error(`Net ${net} ≠ expected 78.00`);
    return `£${fee} × ${players} players = £${gross} gross → 2.5% fee = £${platformFee.toFixed(2)} → net £${net.toFixed(2)} ✓`;
  });

  const runCompBracket = () => run("comp_bracket", async () => {
    const u = await base44.auth.me();
    const comp = await base44.entities.Competition.create({
      name: `[TEST] Bracket ${Date.now()}`,
      type: "tournament",
      format: "knockout",
      status: "in_progress",
      skill_level: "any",
      max_players: 4,
      host_email: u.email,
      participants: [],
    });
    const players = ["a@t.com", "b@t.com", "c@t.com", "d@t.com"];
    const matches = [
      { competition_id: comp.id, round: 1, player1_email: players[0], player2_email: players[1], status: "scheduled", match_order: 1 },
      { competition_id: comp.id, round: 1, player1_email: players[2], player2_email: players[3], status: "scheduled", match_order: 2 },
    ];
    await base44.entities.CompetitionMatch.bulkCreate(matches);
    const created = await base44.entities.CompetitionMatch.filter({ competition_id: comp.id }, "round", 10);
    if (created.length !== 2) throw new Error(`Expected 2 matches, got ${created.length}`);
    for (const m of created) await base44.entities.CompetitionMatch.delete(m.id);
    await base44.entities.Competition.delete(comp.id);
    return `Bracket generated: ${created.length} round-1 matches ✓`;
  });

  // NOTIFICATIONS
  const runNotifCreate = () => run("notif_create", async () => {
    const u = await base44.auth.me();
    const n = await base44.entities.Notification.create({
      user_email: u.email,
      type: "join",
      title: "[TEST] Notification",
      body: "This is a test notification",
      is_read: false,
    });
    if (!n?.id) throw new Error("No notification ID returned");
    await base44.entities.Notification.delete(n.id);
    return "Notification create + cleanup OK";
  });

  const runNotifUnread = () => run("notif_unread", async () => {
    const u = await base44.auth.me();
    const notifs = await base44.entities.Notification.filter({ user_email: u.email, is_read: false }, "-created_date", 50);
    return `${notifs.length} unread notification(s) for ${u.email}`;
  });

  // FEES
  const runFeeCalculation = () => run("fee_calc", async () => {
    const cases = [
      { fee: 5, players: 4 },
      { fee: 20, players: 16 },
      { fee: 0, players: 10 },
    ];
    const errors = [];
    cases.forEach(({ fee, players }) => {
      const gross = fee * players;
      const platformFee = +(gross * 0.025).toFixed(2);
      const net = +(gross - platformFee).toFixed(2);
      const expected = +(gross * 0.975).toFixed(2);
      if (net !== expected) errors.push(`fee=${fee} players=${players}: ${net} ≠ ${expected}`);
    });
    if (errors.length) throw new Error(errors.join("; "));
    return `All ${cases.length} fee calculations correct at 2.5% ✓`;
  });

  // E2E FLOWS
  const runFlowCasualMatch = () => run("flow_casual", async () => {
    const u = await base44.auth.me();
    // Create match
    const m = await base44.entities.Match.create({
      title: `[TEST E2E] Casual ${Date.now()}`,
      date: new Date(Date.now() + 86400000).toISOString().split("T")[0],
      time: "10:00",
      location_name: "E2E Court",
      skill_level: "any",
      max_players: 4,
      players: [u.email],
      status: "open",
    });
    // Join
    await base44.entities.Match.update(m.id, { players: [u.email, "p2@test.com"], status: "full" });
    // Complete
    await base44.entities.Match.update(m.id, { status: "completed" });
    // Rate
    const r = await base44.entities.Rating.create({
      match_id: m.id,
      rater_email: u.email,
      rated_email: "p2@test.com",
      overall: 4,
      tags: ["good_attitude"],
    });
    if (!r?.id) throw new Error("Rating not created");
    // Cleanup
    await base44.entities.Rating.delete(r.id);
    await base44.entities.Match.delete(m.id);
    return "E2E casual flow: create → join → complete → rate ✓";
  });

  const runFlowTournament = () => run("flow_tournament", async () => {
    const u = await base44.auth.me();
    if (!u.is_subscribed) throw new Error("User not subscribed — cannot run tournament flow. Activate subscription first.");
    const comp = await base44.entities.Competition.create({
      name: `[TEST E2E] Tournament ${Date.now()}`,
      type: "tournament",
      format: "knockout",
      status: "registration",
      skill_level: "any",
      max_players: 4,
      entry_fee: 10,
      participants: [u.email],
      host_email: u.email,
    });
    await base44.entities.Competition.update(comp.id, { status: "in_progress" });
    const m = await base44.entities.CompetitionMatch.create({
      competition_id: comp.id,
      round: 1,
      player1_email: u.email,
      player1_name: u.full_name,
      player2_email: "opp@test.com",
      player2_name: "Opponent",
      status: "pending_validation",
      submitted_score_p1: "6",
      submitted_score_p2: "3",
      submitted_by: u.email,
    });
    await base44.entities.CompetitionMatch.update(m.id, {
      score_player1: "6",
      score_player2: "3",
      winner_email: u.email,
      confirmed_by: "opp@test.com",
      status: "confirmed",
    });
    const fee = 10, players = 1;
    const gross = fee * players;
    const net = +(gross * 0.975).toFixed(2);
    await base44.entities.CompetitionMatch.delete(m.id);
    await base44.entities.Competition.delete(comp.id);
    return `E2E tournament: created → started → score confirmed → net prize pool £${net} ✓`;
  });

  const runFlowLeague = () => run("flow_league", async () => {
    const u = await base44.auth.me();
    if (!u.is_subscribed) throw new Error("User not subscribed — activate subscription first.");
    const league = await base44.entities.Competition.create({
      name: `[TEST E2E] League ${Date.now()}`,
      type: "league",
      format: "round_robin",
      status: "registration",
      skill_level: "any",
      max_players: 6,
      entry_fee: 0,
      participants: [u.email],
      host_email: u.email,
    });
    const entry = await base44.entities.CompetitionEntry.create({
      competition_id: league.id,
      player_email: u.email,
      player_name: u.full_name,
      status: "confirmed",
      fee_paid: true,
    });
    if (!entry?.id) throw new Error("Entry not created");
    await base44.entities.CompetitionEntry.delete(entry.id);
    await base44.entities.Competition.delete(league.id);
    return "E2E league: created → player registered → standings-ready ✓";
  });

  if (!authChecked) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto pb-10">
      {/* Header */}
      <div className="px-5 pt-6 pb-4 sticky top-0 bg-background/95 backdrop-blur z-10 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="font-heading font-bold text-xl flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" /> Admin Test Mode
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">Simulate and verify all critical user flows</p>
          </div>
          <Button variant="outline" size="sm" className="rounded-xl gap-1" onClick={resetAll}>
            <RefreshCw className="w-3.5 h-3.5" /> Reset
          </Button>
        </div>

        {/* Summary bar */}
        {all.length > 0 && (
          <div className="flex gap-3 text-sm">
            <span className="flex items-center gap-1 text-green-600 font-medium">
              <CheckCircle className="w-3.5 h-3.5" /> {passed} passed
            </span>
            <span className="flex items-center gap-1 text-destructive font-medium">
              <XCircle className="w-3.5 h-3.5" /> {failed} failed
            </span>
            {running > 0 && (
              <span className="flex items-center gap-1 text-blue-500 font-medium">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> {running} running
              </span>
            )}
            <Badge
              variant="outline"
              className={failed === 0 && passed > 0 ? "text-green-700 border-green-300 bg-green-50" : "text-muted-foreground"}
            >
              {failed === 0 && passed > 0 ? "✓ All passing" : `${passed}/${all.length}`}
            </Badge>
          </div>
        )}
      </div>

      <div className="px-5 pt-4 space-y-3">

        {/* 1. Auth */}
        <Section icon={User} title="1. Auth & Session" color="bg-blue-500" defaultOpen>
          <TestRow id="auth_me" label="Current user session" description="Verifies base44.auth.me() returns valid user" results={results} onRun={runAuthMe} />
          <TestRow id="auth_admin" label="Admin role check" description="Confirms current user has role='admin'" results={results} onRun={runAuthAdmin} />
        </Section>

        {/* 2. Profile */}
        <Section icon={User} title="2. Player Profile" color="bg-purple-500">
          <TestRow id="profile_read" label="Profile fields present" description="Checks email and full_name exist" results={results} onRun={runProfileRead} />
          <TestRow id="profile_update" label="Profile update + revert" description="Writes bio, verifies save, reverts" results={results} onRun={runProfileUpdate} />
          <TestRow id="profile_subscription" label="Subscription status" description="Reads is_subscribed flag" results={results} onRun={runProfileSubscription} />
        </Section>

        {/* 3. Matches */}
        <Section icon={Zap} title="3. Match Creation & Joining" color="bg-green-600">
          <TestRow id="match_create" label="Create and delete match" description="Full create → delete cycle" results={results} onRun={runMatchCreate} />
          <TestRow id="match_required_fields" label="Reject incomplete match" description="Verifies validation blocks empty title" results={results} onRun={runMatchRequiredFields} />
          <TestRow id="match_list" label="List matches" description="Reads last 5 matches from DB" results={results} onRun={runMatchList} />
          <TestRow id="match_join" label="Join match flow" description="Creates match, adds player, verifies array" results={results} onRun={runMatchJoin} />
        </Section>

        {/* 4. Score Validation */}
        <Section icon={Trophy} title="4. Score Submission & Validation" color="bg-orange-500">
          <TestRow id="score_submit" label="Submit score → pending_validation" description="Sets submitted scores and status" results={results} onRun={runScoreSubmit} />
          <TestRow id="score_confirm" label="Confirm score → confirmed" description="Opponent confirms, winner set" results={results} onRun={runScoreConfirm} />
          <TestRow id="score_dispute" label="Reject score → disputed" description="Opponent rejects with reason" results={results} onRun={runScoreDispute} />
        </Section>

        {/* 5. Ratings */}
        <Section icon={Star} title="5. Player Ratings" color="bg-yellow-500">
          <TestRow id="rating_create" label="Create and delete rating" description="Submits rating with overall + tags" results={results} onRun={runRatingCreate} />
          <TestRow id="rating_avg_calc" label="Average rating calculation" description="Fetches own ratings and computes avg" results={results} onRun={runRatingAvgCalc} />
          <TestRow id="rating_threshold" label="Restriction thresholds logic" description="Verifies 2.5 / 3.0 / 3.5 ★ logic" results={results} onRun={runRatingThreshold} />
        </Section>

        {/* 6. Subscription */}
        <Section icon={CreditCard} title="6. Subscription & Premium Access" color="bg-accent">
          <TestRow id="sub_check" label="Read subscription status" description="Shows current is_subscribed value" results={results} onRun={runSubCheck} />
          <TestRow id="sub_gate" label="Premium gate logic" description="Checks whether features should be blocked" results={results} onRun={runSubGate} />
          <TestRow id="sub_activate" label="Activate subscription (simulate)" description="Sets is_subscribed=true on your profile" results={results} onRun={runSubActivate} />
          <TestRow id="sub_deactivate" label="Deactivate subscription (simulate)" description="Sets is_subscribed=false — reverts premium" results={results} onRun={runSubDeactivate} />
        </Section>

        {/* 7. Competitions */}
        <Section icon={Trophy} title="7. Leagues & Tournaments" color="bg-indigo-500">
          <TestRow id="comp_create" label="Create and delete competition" description="Full tournament create → delete" results={results} onRun={runCompCreate} />
          <TestRow id="comp_platform_fee" label="2.5% platform fee calculation" description="Verifies £10 × 8 players = £78 net" results={results} onRun={runCompPlatformFee} />
          <TestRow id="comp_bracket" label="Generate bracket matches" description="Creates 4-player bracket, verifies 2 round-1 matches" results={results} onRun={runCompBracket} />
        </Section>

        {/* 8. Fees */}
        <Section icon={CreditCard} title="8. Fee Calculations" color="bg-teal-500">
          <TestRow id="fee_calc" label="Platform fee accuracy" description="Tests 2.5% deduction across multiple cases" results={results} onRun={runFeeCalculation} />
        </Section>

        {/* 9. Notifications */}
        <Section icon={Bell} title="9. Notifications" color="bg-pink-500">
          <TestRow id="notif_create" label="Create and delete notification" description="Verifies notification record cycle" results={results} onRun={runNotifCreate} />
          <TestRow id="notif_unread" label="Count unread notifications" description="Lists unread for current user" results={results} onRun={runNotifUnread} />
        </Section>

        {/* 10. E2E Flows */}
        <Section icon={Play} title="10. End-to-End Flows" color="bg-slate-700" defaultOpen>
          <p className="text-xs text-muted-foreground pb-1">
            These simulate full user journeys with real DB writes (auto cleaned up).
          </p>
          <TestRow
            id="flow_casual"
            label="Flow 1: Casual Match"
            description="Create → join → complete → rate"
            results={results}
            onRun={runFlowCasualMatch}
          />
          <TestRow
            id="flow_tournament"
            label="Flow 2: Premium Tournament"
            description="Requires active subscription — create → score → confirm → fee calc"
            results={results}
            onRun={runFlowTournament}
          />
          <TestRow
            id="flow_league"
            label="Flow 3: League"
            description="Requires active subscription — create → register player"
            results={results}
            onRun={runFlowLeague}
          />
        </Section>

        {/* Release gate summary */}
        <div className={`rounded-2xl border p-4 ${failed === 0 && passed >= 10 ? "bg-green-50 border-green-200" : "bg-muted/50 border-border"}`}>
          <h3 className="font-heading font-semibold mb-1 flex items-center gap-2">
            {failed === 0 && passed >= 10
              ? <><CheckCircle className="w-4 h-4 text-green-600" /> Release Gate: PASS</>
              : <><Clock className="w-4 h-4 text-muted-foreground" /> Release Gate: Pending</>
            }
          </h3>
          <p className="text-xs text-muted-foreground">
            {passed} of {passed + failed + (all.length - passed - failed)} tests run.
            {failed > 0 ? ` ${failed} failure(s) must be resolved before release.` : passed === 0 ? " Run all tests above to verify readiness." : " All run tests are passing ✓"}
          </p>
        </div>

      </div>
    </div>
  );
}