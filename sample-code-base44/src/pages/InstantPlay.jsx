import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import {
  Zap, MapPin, Clock, Users, CheckCircle, XCircle,
  Loader2, ArrowLeft, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { motion, AnimatePresence } from "framer-motion";

const TIME_WINDOWS = [
  { value: "now", label: "Right now", sub: "≤ 30 min" },
  { value: "1h",  label: "Within 1h",  sub: "≤ 60 min" },
  { value: "2h",  label: "Within 2h",  sub: "≤ 120 min" },
];

const FORMATS = [
  { value: "singles",       label: "Singles", sub: "1v1" },
  { value: "doubles",       label: "Doubles", sub: "2v2" },
  { value: "mixed_doubles", label: "Mixed",   sub: "2v2" },
];

function Chip({ label, sub, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-3 rounded-xl border text-center transition-all ${
        selected ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40"
      }`}
    >
      <p className={`text-xs font-semibold ${selected ? "text-primary" : "text-foreground"}`}>{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </button>
  );
}

function MatchOption({ match, onJoin, joining }) {
  const spots = match.spots_left;
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{match.title}</p>
        {match.location_name && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <MapPin className="w-3 h-3" /> {match.location_name}
          </p>
        )}
        <p className="text-xs text-primary font-medium mt-1">
          {match.players_count}/{match.max_players} players · {spots} spot{spots !== 1 ? "s" : ""} left
        </p>
      </div>
      <Button size="sm" className="rounded-xl h-9 px-4 flex-shrink-0" onClick={onJoin} disabled={joining}>
        {joining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Join →"}
      </Button>
    </div>
  );
}

export default function InstantPlay() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const pollRef = useRef(null);

  const [user, setUser] = useState(null);
  const [step, setStep] = useState("form"); // form | searching | options | waiting | matched
  const [form, setForm] = useState({
    match_type: "doubles",
    time_window: "1h",
    location_name: "",
    location_lat: null,
    location_lng: null,
    max_distance_km: 10,
  });
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [requestId, setRequestId] = useState(null);
  const [matchId, setMatchId] = useState(null);
  const [nearbyMatches, setNearbyMatches] = useState([]);
  const [notifiedCount, setNotifiedCount] = useState(0);
  const [joiningMatchId, setJoiningMatchId] = useState(null);
  const [missingFields, setMissingFields] = useState([]);

  useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      if (u?.location_name || u?.location) setForm(f => ({ ...f, location_name: u.location_name || u.location || "" }));
      if (u?.location_lat) setForm(f => ({ ...f, location_lat: u.location_lat, location_lng: u.location_lng }));
    });
    return () => { clearInterval(pollRef.current); };
  }, []);

  const detectLocation = () => {
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        let label = "My Location";
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
          const d = await r.json();
          label = d.address?.city || d.address?.town || d.address?.village || "My Location";
        } catch {}
        setForm(f => ({ ...f, location_lat: lat, location_lng: lng, location_name: label }));
        setGeoLoading(false);
      },
      () => {
        toast({ title: "Location unavailable", description: "Enter a location manually", variant: "destructive" });
        setGeoLoading(false);
      }
    );
  };

  const validate = () => {
    const missing = [];
    if (!user?.full_name) missing.push("name");
    if (!user?.skill_label && !user?.skill_level) missing.push("skill level");
    if (!form.location_name && !form.location_lat) missing.push("location");
    setMissingFields(missing);
    return missing.length === 0;
  };

  const startPolling = (reqId) => {
    clearInterval(pollRef.current);
    let active = true;
    pollRef.current = setInterval(async () => {
      if (!active) return;
      const res = await base44.functions.invoke("instantPlayMatch", { action: "status", request_id: reqId });
      const data = res.data;
      if (data.status === "matched") {
        active = false;
        clearInterval(pollRef.current);
        setMatchId(data.match_id);
        setStep("matched");
      } else if (data.status === "expired" || data.status === "cancelled") {
        active = false;
        clearInterval(pollRef.current);
        setStep(prev => {
          // Only show toast and reset if we're still in waiting state
          if (prev === "waiting") {
            toast({ title: "Request expired", description: "No players found. Try expanding your search." });
            return "form";
          }
          return prev;
        });
      }
    }, 5000);
  };

  const handleSearch = async () => {
    if (!validate()) return;
    setLoading(true);
    setStep("searching");

    const skillLabel = user?.skill_label || (typeof user?.skill_level === "string" ? user.skill_level : "any");
    const skillNumeric = typeof user?.skill_level === "number" ? user.skill_level : undefined;

    const res = await base44.functions.invoke("instantPlayMatch", {
      action: "join",
      ...form,
      skill_level: skillLabel,
      skill_numeric: skillNumeric,
    });
    const data = res.data;
    setLoading(false);

    if (data.status === "options") {
      setNearbyMatches(data.matches || []);
      setStep("options");
    } else if (data.status === "matched") {
      setMatchId(data.match_id);
      setRequestId(data.request_id);
      setStep("matched");
    } else if (data.status === "waiting") {
      setRequestId(data.request_id);
      setNotifiedCount(data.notified_count || 0);
      setStep("waiting");
      startPolling(data.request_id);
    }
  };

  const handleJoinExisting = async (match) => {
    setJoiningMatchId(match.id);
    const res = await base44.functions.invoke("instantPlayMatch", { action: "join_match", match_id: match.id });
    setJoiningMatchId(null);
    if (res.data?.status === "matched") {
      setMatchId(res.data.match_id);
      setStep("matched");
    } else {
      toast({ title: "Couldn't join", description: res.data?.error || "Try another match", variant: "destructive" });
    }
  };

  const handleConfirm = async () => {
    if (requestId) await base44.functions.invoke("instantPlayMatch", { action: "confirm", request_id: requestId });
    navigate(`/match/${matchId}`);
  };

  const handleDecline = async () => {
    clearInterval(pollRef.current);
    if (requestId) await base44.functions.invoke("instantPlayMatch", { action: "decline", request_id: requestId });
    setStep("form"); setRequestId(null); setMatchId(null);
  };

  const handleCancel = async () => {
    clearInterval(pollRef.current);
    if (requestId) await base44.functions.invoke("instantPlayMatch", { action: "cancel", request_id: requestId });
    setStep("form"); setRequestId(null); setMatchId(null); setLoading(false);
  };

  return (
    <div className="max-w-lg mx-auto min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="px-5 pt-6 pb-3 flex items-center gap-3 flex-shrink-0">
        <button onClick={async () => { await handleCancel(); navigate(-1); }} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
            <Zap className="w-4 h-4 text-accent" />
          </div>
          <h1 className="font-heading font-bold text-lg">Instant Padel</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">

          {/* ── FORM ──────────────────────────────────────────────────── */}
          {step === "form" && (
            <motion.div key="form" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="px-5 pb-10 space-y-5">

              <div className="bg-gradient-to-br from-accent/10 to-primary/5 rounded-2xl border border-accent/20 p-4">
                <p className="text-sm font-semibold mb-0.5">⚡ Play Now</p>
                <p className="text-xs text-muted-foreground">Find an existing game or we'll form one with nearby players — in seconds.</p>
              </div>

              {missingFields.length > 0 && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Complete your profile first</p>
                    <p>Missing: {missingFields.join(", ")} —{" "}
                      <button className="underline" onClick={() => navigate("/edit-profile")}>Update now</button>
                    </p>
                  </div>
                </div>
              )}

              <div>
                <p className="text-sm font-semibold mb-2">Format</p>
                <div className="flex gap-2">
                  {FORMATS.map(f => (
                    <Chip key={f.value} label={f.label} sub={f.sub}
                      selected={form.match_type === f.value}
                      onClick={() => setForm(p => ({ ...p, match_type: f.value }))} />
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" /> When?
                </p>
                <div className="flex gap-2">
                  {TIME_WINDOWS.map(w => (
                    <Chip key={w.value} label={w.label} sub={w.sub}
                      selected={form.time_window === w.value}
                      onClick={() => setForm(p => ({ ...p, time_window: w.value }))} />
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground" /> Location
                </p>
                <div className="flex gap-2">
                  <input
                    placeholder="Area, venue, or postcode…"
                    value={form.location_name}
                    onChange={e => setForm(f => ({ ...f, location_name: e.target.value }))}
                    className="flex-1 h-11 px-3 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <Button variant="outline" size="icon" onClick={detectLocation} disabled={geoLoading}
                    className="h-11 w-11 rounded-xl flex-shrink-0">
                    {geoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                  </Button>
                </div>
                {form.location_lat && (
                  <p className="text-[11px] text-primary mt-1.5 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> GPS location set
                  </p>
                )}
              </div>

              <div>
                <p className="text-sm font-semibold mb-2">Max distance</p>
                <div className="flex gap-2">
                  {[2, 5, 10, 20].map(d => (
                    <button key={d}
                      onClick={() => setForm(f => ({ ...f, max_distance_km: d }))}
                      className={`flex-1 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                        form.max_distance_km === d
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {d} km
                    </button>
                  ))}
                </div>
              </div>

              <Button onClick={handleSearch} disabled={loading}
                className="w-full h-12 rounded-xl font-heading font-bold text-base shadow-lg shadow-primary/20 gap-2">
                <Zap className="w-5 h-5" /> Find Players Now
              </Button>

              <button onClick={() => navigate("/create-match?instant=true")}
                className="w-full text-xs text-muted-foreground hover:text-foreground text-center py-1">
                Need full control? → Schedule a match instead
              </button>
            </motion.div>
          )}

          {/* ── SEARCHING ──────────────────────────────────────────────── */}
          {step === "searching" && (
            <motion.div key="searching" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center pt-24 px-5 gap-6 text-center">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <Zap className="w-10 h-10 text-primary" />
                </div>
                <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-ping" />
              </div>
              <div>
                <h2 className="font-heading font-bold text-xl mb-1">Searching…</h2>
                <p className="text-muted-foreground text-sm">Scanning for matches and players near you</p>
              </div>
              <Button variant="outline" onClick={handleCancel} className="rounded-xl h-10 px-6">Cancel</Button>
            </motion.div>
          )}

          {/* ── OPTIONS ────────────────────────────────────────────────── */}
          {step === "options" && (
            <motion.div key="options" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="px-5 pt-4 pb-10 space-y-4">
              <div>
                <h2 className="font-heading font-bold text-lg">Open matches nearby</h2>
                <p className="text-muted-foreground text-sm">Join one or we'll create a new match for you</p>
              </div>
              <div className="space-y-3">
                {nearbyMatches.map(m => (
                  <MatchOption key={m.id} match={m}
                    onJoin={() => handleJoinExisting(m)}
                    joining={joiningMatchId === m.id} />
                ))}
              </div>
              <div className="pt-2 space-y-2">
                <Button onClick={handleSearch} variant="outline" className="w-full h-11 rounded-xl font-heading font-semibold gap-2">
                  <Zap className="w-4 h-4" /> Create New Match Instead
                </Button>
                <button onClick={() => setStep("form")} className="w-full text-xs text-muted-foreground text-center py-1">
                  ← Change preferences
                </button>
              </div>
            </motion.div>
          )}

          {/* ── WAITING ────────────────────────────────────────────────── */}
          {step === "waiting" && (
            <motion.div key="waiting" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center px-5 pt-16 pb-10 gap-6 text-center">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center">
                  <Users className="w-10 h-10 text-accent" />
                </div>
                <div className="absolute inset-0 rounded-full border-4 border-accent/20 animate-pulse" />
              </div>
              <div>
                <h2 className="font-heading font-bold text-xl mb-1">Waiting for players…</h2>
                <p className="text-muted-foreground text-sm mb-3">
                  You're in the queue. We'll notify you the moment someone nearby is ready.
                </p>
                {notifiedCount > 0 && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    <Zap className="w-3 h-3 text-accent" />
                    {notifiedCount} nearby player{notifiedCount !== 1 ? "s" : ""} notified
                  </Badge>
                )}
              </div>
              <div className="w-full bg-card border border-border rounded-2xl p-4 text-left space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Your request</p>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold">Padel</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground capitalize">{form.match_type.replace("_", " ")}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{TIME_WINDOWS.find(w => w.value === form.time_window)?.label}</span>
                </div>
                {form.location_name && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="w-3 h-3" /> {form.location_name}
                  </div>
                )}
              </div>
              <div className="w-full space-y-2">
                <Button variant="outline" onClick={() => setStep("form")} className="w-full h-11 rounded-xl">
                  Expand Search
                </Button>
                <Button variant="ghost" onClick={handleCancel}
                  className="w-full h-10 rounded-xl text-destructive hover:bg-destructive/5 text-sm">
                  Cancel Request
                </Button>
              </div>
            </motion.div>
          )}

          {/* ── MATCHED ────────────────────────────────────────────────── */}
          {step === "matched" && (
            <motion.div key="matched" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center px-5 pt-16 pb-10 gap-6 text-center">
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", bounce: 0.4, delay: 0.1 }}
                className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center"
              >
                <CheckCircle className="w-10 h-10 text-green-600" />
              </motion.div>
              <div>
                <h2 className="font-heading font-bold text-2xl mb-1 text-green-700">Match Found! 🎾</h2>
                <p className="text-muted-foreground text-sm">
                  You've been matched. Confirm your spot before it's given away.
                </p>
              </div>
              <div className="w-full bg-green-50 border border-green-200 rounded-2xl p-4 text-sm text-green-800 font-medium">
                ⏱ Confirm within 10 minutes or your spot will be released.
              </div>
              <div className="w-full grid grid-cols-2 gap-3">
                <Button variant="outline" onClick={handleDecline}
                  className="h-12 rounded-xl font-heading font-semibold border-destructive/30 text-destructive hover:bg-destructive/5 gap-2">
                  <XCircle className="w-4 h-4" /> Decline
                </Button>
                <Button onClick={handleConfirm}
                  className="h-12 rounded-xl font-heading font-semibold bg-green-600 hover:bg-green-700 text-white gap-2 shadow-lg shadow-green-600/20">
                  <CheckCircle className="w-4 h-4" /> Confirm!
                </Button>
              </div>
              {matchId && (
                <button onClick={() => navigate(`/match/${matchId}`)}
                  className="text-xs text-muted-foreground underline">
                  View match details first →
                </button>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}