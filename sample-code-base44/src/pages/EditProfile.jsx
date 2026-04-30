import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, CheckCircle, Globe, Lock, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";

import LocationField from "../components/editprofile/LocationField";
import SectionCard from "../components/editprofile/SectionCard";
import Chip from "../components/editprofile/Chip";
import ProfileProgressBar from "../components/editprofile/ProfileProgressBar";

// ── Constants ────────────────────────────────────────────────────────────────

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_LABELS = { Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu", Friday: "Fri", Saturday: "Sat", Sunday: "Sun" };
const TIMES = [
  { value: "Morning",   emoji: "🌅", hint: "7am – 12pm" },
  { value: "Afternoon", emoji: "☀️", hint: "12pm – 5pm" },
  { value: "Evening",   emoji: "🌙", hint: "5pm – 10pm" },
];
const SKILL_LABELS = { 1: "Pro", 2: "Expert", 3: "Advanced+", 4: "Advanced", 5: "Intermediate+", 6: "Intermediate", 7: "Beginner+", 8: "Beginner", 9: "Novice", 10: "Just starting" };
const SKILL_CATEGORY = (n) => n <= 3 ? "Advanced" : n <= 6 ? "Intermediate" : "Beginner";
const SKILL_CATEGORY_COLOR = (n) => n <= 3 ? "text-purple-600" : n <= 6 ? "text-blue-600" : "text-green-600";
const TAG_OPTIONS = [
  { label: "Competitive 🔥", value: "Competitive" },
  { label: "Casual 😎", value: "Casual" },
  { label: "Beginner-friendly 🌱", value: "Beginner-friendly" },
  { label: "Social 🤝", value: "Social" },
  { label: "Training partner 🎯", value: "Training partner" },
];
const MATCH_TYPES = [
  { value: "casual", label: "Social" },
  { value: "competitive", label: "Competitive" },
  { value: "training", label: "Training" },
];
const MATCH_FORMATS = [
  { value: "singles", label: "Singles" },
  { value: "doubles", label: "Doubles" },
  { value: "both", label: "Both" },
];
const POSITIONS = [
  { value: "left", label: "Left 🏃" },
  { value: "right", label: "Right 🏃" },
  { value: "both", label: "Both ✌️" },
];
const CONFIDENCE = [
  { value: "low", label: "Still learning" },
  { value: "medium", label: "Comfortable" },
  { value: "high", label: "Very confident" },
];
const TRAVEL_OPTIONS = [5, 10, 20, 50];
const NOTIF_ITEMS = [
  { key: "notify_instant_play", label: "⚡ Instant Play matches" },
  { key: "notify_nearby_matches", label: "📍 Nearby matches" },
  { key: "notify_match_invites", label: "✉️ Match invites" },
  { key: "notify_tournaments", label: "🏆 Tournament invitations" },
];

function skillLabelFromNumeric(n) {
  if (n <= 3) return "advanced";
  if (n <= 6) return "intermediate";
  return "beginner";
}

// ── Component ────────────────────────────────────────────────────────────────

export default function EditProfile() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [bioLength, setBioLength] = useState(0);
  const [activeStep, setActiveStep] = useState(0);

  const [form, setForm] = useState({
    name: "", age: "", gender: "", location: "", bio: "",
    skill_level: 5, skill_confidence: "", preferred_position: "",
    availability_days: [], availability_times: [],
    travel_radius_km: 10, use_current_location: false,
    match_type_preference: "", match_format_preference: "", tags: [],
    photo_url: "", photo_verified: false,
    notify_instant_play: true, notify_nearby_matches: true,
    notify_match_invites: true, notify_tournaments: true,
    profile_visibility: "public",
  });

  useEffect(() => {
    base44.auth.me().then((u) => {
      const f = {
        name: u.name || u.full_name || "",
        age: u.age || "",
        gender: u.gender || "",
        location: u.location || "",
        bio: u.bio || "",
        skill_level: u.skill_level || 5,
        skill_confidence: u.skill_confidence || "",
        preferred_position: u.preferred_position || "",
        availability_days: u.availability_days || [],
        availability_times: u.availability_times || [],
        travel_radius_km: u.travel_radius_km || 10,
        use_current_location: u.use_current_location || false,
        match_type_preference: u.match_type_preference || "",
        match_format_preference: u.match_format_preference || "",
        tags: u.tags || [],
        photo_url: u.photo_url || "",
        photo_verified: u.photo_verified || false,
        notify_instant_play: u.notify_instant_play !== false,
        notify_nearby_matches: u.notify_nearby_matches !== false,
        notify_match_invites: u.notify_match_invites !== false,
        notify_tournaments: u.notify_tournaments !== false,
        profile_visibility: u.profile_visibility || "public",
      };
      setForm(f);
      setBioLength((f.bio || "").length);
    });
  }, []);

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const toggleArray = (field, value) =>
    setForm(prev => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter(v => v !== value)
        : [...prev[field], value],
    }));

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(prev => ({ ...prev, photo_url: file_url, photo_verified: true }));
    toast({ title: "Photo uploaded ✅" });
    setUploadingPhoto(false);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    if (!form.location.trim()) { toast({ title: "Location is required", variant: "destructive" }); return; }
    setLoading(true);
    await base44.auth.updateMe({
      name: form.name.trim(),
      full_name: form.name.trim(),
      age: form.age ? Number(form.age) : null,
      gender: form.gender,
      location: form.location,
      bio: form.bio,
      skill_level: Number(form.skill_level),
      skill_label: skillLabelFromNumeric(Number(form.skill_level)),
      skill_confidence: form.skill_confidence,
      preferred_position: form.preferred_position,
      availability_days: form.availability_days,
      availability_times: form.availability_times,
      travel_radius_km: Number(form.travel_radius_km),
      use_current_location: form.use_current_location,
      match_type_preference: form.match_type_preference,
      match_format_preference: form.match_format_preference,
      tags: form.tags,
      photo_url: form.photo_url,
      photo_verified: form.photo_verified,
      notify_instant_play: form.notify_instant_play,
      notify_nearby_matches: form.notify_nearby_matches,
      notify_match_invites: form.notify_match_invites,
      notify_tournaments: form.notify_tournaments,
      profile_visibility: form.profile_visibility,
      profile_complete: true,
    });
    toast({ title: "Profile saved! ✅" });
    setLoading(false);
    navigate("/profile");
  };

  // Section refs for scroll-based progress
  const sec0 = useRef(null);
  const sec1 = useRef(null);
  const sec2 = useRef(null);
  const sec3 = useRef(null);
  const sectionRefs = [sec0, sec1, sec2, sec3];

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const idx = sectionRefs.findIndex(r => r.current === entry.target);
            if (idx !== -1) setActiveStep(idx);
          }
        });
      },
      { threshold: 0.3 }
    );
    sectionRefs.forEach(r => { if (r.current) observer.observe(r.current); });
    return () => observer.disconnect();
  }, []);

  const skillN = Number(form.skill_level);

  return (
    <div className="min-h-screen bg-background">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border px-5 pt-5 pb-3">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="font-heading font-bold text-lg leading-tight">Edit Profile</h1>
              <p className="text-[11px] text-muted-foreground">Help us match you with the right players</p>
            </div>
          </div>
          <ProfileProgressBar activeStep={activeStep} />
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-lg mx-auto px-4 sm:px-5 pt-5 pb-32 space-y-5"
      >
        {/* ── SECTION 1: Basics ── */}
        <div ref={sec0}>
          <SectionCard emoji="👤" title="Basics" subtitle="The essentials — required to get started">
            {/* Photo */}
            <div className="flex items-center gap-4 pb-4 border-b border-border/60">
              <div className="relative flex-shrink-0">
                {form.photo_url ? (
                  <img src={form.photo_url} alt="Profile" className="w-16 h-16 rounded-full object-cover ring-2 ring-primary/20" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
                    <Camera className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                {form.photo_verified && (
                  <CheckCircle className="absolute -bottom-1 -right-1 w-5 h-5 text-green-500 bg-white rounded-full" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Profile Photo <span className="text-muted-foreground font-normal text-xs">(optional)</span></p>
                <p className="text-[11px] text-muted-foreground mb-2">Help others recognise you</p>
                <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                <Button
                  variant="outline" size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="rounded-full h-8 text-xs gap-1.5"
                >
                  <Upload className="w-3 h-3" />
                  {uploadingPhoto ? "Uploading..." : form.photo_url ? "Change Photo" : "Upload Photo"}
                </Button>
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Full Name <span className="text-destructive">*</span></label>
              <Input
                placeholder="Your name"
                value={form.name}
                onChange={e => update("name", e.target.value)}
                className="rounded-xl h-11 bg-background"
              />
            </div>

            {/* Age */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Age</label>
              <Input
                type="number" placeholder="25"
                value={form.age}
                onChange={e => update("age", e.target.value)}
                className="rounded-xl h-11 bg-background"
              />
            </div>

            {/* Location */}
            <LocationField value={form.location} onChange={v => update("location", v)} />

            {/* Gender */}
            <div>
              <label className="text-sm font-medium mb-2 block">Gender <span className="text-muted-foreground font-normal text-xs">(optional)</span></label>
              <div className="flex gap-2">
                {["male", "female", "other"].map(g => (
                  <Chip key={g} label={g.charAt(0).toUpperCase() + g.slice(1)} selected={form.gender === g} onClick={() => update("gender", form.gender === g ? "" : g)} />
                ))}
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ── SECTION 2: Play Style ── */}
        <div ref={sec1}>
          <SectionCard emoji="🎾" title="Your Padel Level" subtitle="Select your level — 1 = Pro, 10 = Just starting">
            {/* Skill chips 1–10 */}
            <div>
              <div className="grid grid-cols-5 gap-2 mb-3">
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <button
                    key={n} type="button"
                    onClick={() => update("skill_level", n)}
                    className={`h-11 rounded-xl text-sm font-bold border-2 transition-all ${
                      skillN === n
                        ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25"
                        : "border-border bg-background text-foreground hover:border-primary/40"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              {skillN && (
                <div className="text-center py-2 rounded-xl bg-secondary/50">
                  <span className={`font-heading font-bold text-sm ${SKILL_CATEGORY_COLOR(skillN)}`}>
                    {SKILL_CATEGORY(skillN)}
                  </span>
                  <span className="text-muted-foreground text-xs ml-2">{SKILL_LABELS[skillN]}</span>
                </div>
              )}
            </div>

            {/* Confidence */}
            <div>
              <label className="text-sm font-medium mb-2 block">Confidence on court</label>
              <div className="flex flex-wrap gap-2">
                {CONFIDENCE.map(c => (
                  <Chip key={c.value} label={c.label} selected={form.skill_confidence === c.value} onClick={() => update("skill_confidence", form.skill_confidence === c.value ? "" : c.value)} />
                ))}
              </div>
            </div>

            {/* Court position */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Court position <span className="text-muted-foreground font-normal text-xs">(optional)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {POSITIONS.map(p => (
                  <Chip key={p.value} label={p.label} selected={form.preferred_position === p.value} onClick={() => update("preferred_position", form.preferred_position === p.value ? "" : p.value)} />
                ))}
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ── SECTION 3: Availability ── */}
        <div ref={sec2}>
          <SectionCard emoji="📅" title="Availability" subtitle="You can update this anytime">
            {/* Days */}
            <div>
              <label className="text-sm font-medium mb-2 block">Days available</label>
              <div className="flex flex-wrap gap-2">
                {DAYS.map(day => (
                  <button
                    key={day} type="button"
                    onClick={() => toggleArray("availability_days", day)}
                    className={`w-11 h-11 rounded-full text-xs font-semibold border-2 transition-all ${
                      form.availability_days.includes(day)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:border-primary/30"
                    }`}
                  >
                    {DAY_LABELS[day]}
                  </button>
                ))}
              </div>
            </div>

            {/* Times */}
            <div>
              <label className="text-sm font-medium mb-2 block">Best time of day</label>
              <div className="grid grid-cols-3 gap-2">
                {TIMES.map(t => (
                  <button
                    key={t.value} type="button"
                    onClick={() => toggleArray("availability_times", t.value)}
                    className={`py-3.5 rounded-2xl border-2 text-center transition-all ${
                      form.availability_times.includes(t.value)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background"
                    }`}
                  >
                    <div className="text-xl mb-0.5">{t.emoji}</div>
                    <p className="text-xs font-semibold">{t.value}</p>
                    <p className="text-[10px] text-muted-foreground">{t.hint}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Travel radius */}
            <div>
              <label className="text-sm font-medium mb-2 block">Travel radius</label>
              <div className="flex gap-2">
                {TRAVEL_OPTIONS.map(km => (
                  <button
                    key={km} type="button"
                    onClick={() => update("travel_radius_km", km)}
                    className={`flex-1 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                      form.travel_radius_km === km
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground"
                    }`}
                  >
                    {km}km
                  </button>
                ))}
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ── SECTION 4: How do you like to play? ── */}
        <div ref={sec3}>
          <SectionCard emoji="🎯" title="How do you like to play?" subtitle="Help us find you the best matches">
            {/* Match type */}
            <div>
              <label className="text-sm font-medium mb-2 block">Match type</label>
              <div className="flex flex-wrap gap-2">
                {MATCH_TYPES.map(t => (
                  <Chip key={t.value} label={t.label} selected={form.match_type_preference === t.value} onClick={() => update("match_type_preference", form.match_type_preference === t.value ? "" : t.value)} />
                ))}
              </div>
            </div>

            {/* Match format */}
            <div>
              <label className="text-sm font-medium mb-2 block">Match format</label>
              <div className="flex flex-wrap gap-2">
                {MATCH_FORMATS.map(f => (
                  <Chip key={f.value} label={f.label} selected={form.match_format_preference === f.value} onClick={() => update("match_format_preference", form.match_format_preference === f.value ? "" : f.value)} />
                ))}
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="text-sm font-medium mb-2 block">Your vibe <span className="text-muted-foreground font-normal text-xs">(pick any)</span></label>
              <div className="flex flex-wrap gap-2">
                {TAG_OPTIONS.map(t => (
                  <Chip key={t.value} label={t.label} selected={form.tags.includes(t.value)} onClick={() => toggleArray("tags", t.value)} size="sm" />
                ))}
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ── Privacy ── */}
        <SectionCard emoji="🔒" title="Who can see your profile?">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => update("profile_visibility", "public")}
              className={`p-4 rounded-2xl border-2 text-left transition-all ${
                form.profile_visibility === "public" ? "border-primary bg-primary/10" : "border-border bg-background"
              }`}
            >
              <Globe className={`w-5 h-5 mb-2 ${form.profile_visibility === "public" ? "text-primary" : "text-muted-foreground"}`} />
              <p className={`font-semibold text-sm ${form.profile_visibility === "public" ? "text-primary" : "text-foreground"}`}>Public</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Anyone can find you</p>
            </button>
            <button
              type="button"
              onClick={() => update("profile_visibility", "private")}
              className={`p-4 rounded-2xl border-2 text-left transition-all ${
                form.profile_visibility === "private" ? "border-primary bg-primary/10" : "border-border bg-background"
              }`}
            >
              <Lock className={`w-5 h-5 mb-2 ${form.profile_visibility === "private" ? "text-primary" : "text-muted-foreground"}`} />
              <p className={`font-semibold text-sm ${form.profile_visibility === "private" ? "text-primary" : "text-foreground"}`}>Private</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Only friends see you</p>
            </button>
          </div>
        </SectionCard>

        {/* ── Notifications ── */}
        <SectionCard emoji="🔔" title="Notifications">
          <div className="divide-y divide-border/60">
            {NOTIF_ITEMS.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between py-3">
                <p className="text-sm">{label}</p>
                <Switch checked={form[key]} onCheckedChange={v => update(key, v)} />
              </div>
            ))}
          </div>
        </SectionCard>

        {/* ── About you ── */}
        <SectionCard emoji="💬" title="Tell us about you" subtitle="Optional — other players will see this">
          <div>
            <Textarea
              placeholder="Your play style, goals, or anything players should know..."
              value={form.bio}
              onChange={e => { update("bio", e.target.value); setBioLength(e.target.value.length); }}
              className="rounded-xl bg-background resize-none"
              rows={3}
              maxLength={300}
            />
            <p className="text-[11px] text-muted-foreground text-right mt-1">{bioLength}/300</p>
          </div>
        </SectionCard>

      </motion.div>

      {/* ── Sticky Save CTA ── */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border px-4 py-4 z-20">
        <div className="max-w-lg mx-auto">
          <Button
            onClick={handleSave}
            disabled={loading}
            className="w-full h-12 rounded-2xl font-heading font-bold text-base shadow-xl shadow-primary/20"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : "Save Profile"}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground mt-2">You can change this anytime</p>
        </div>
      </div>
    </div>
  );
}