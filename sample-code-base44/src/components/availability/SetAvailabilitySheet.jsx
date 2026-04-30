import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { X, MapPin, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";

const TIME_OPTIONS = [
  { value: "now",  label: "Available Now",  emoji: "⚡" },
  { value: "1h",   label: "Next 1 hour",    emoji: "🕐" },
  { value: "2h",   label: "Next 2 hours",   emoji: "🕑" },
];

const SKILL_OPTIONS = [
  { value: "any",          label: "Any Level" },
  { value: "beginner",     label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced",     label: "Advanced" },
];

const TYPE_OPTIONS = [
  { value: "any",     label: "Any" },
  { value: "singles", label: "Singles" },
  { value: "doubles", label: "Doubles" },
];

const EXPIRY_HOURS = { now: 1, "1h": 2, "2h": 3 };

export default function SetAvailabilitySheet({ user, existingPost, onClose }) {
  const queryClient = useQueryClient();
  const [timeWindow, setTimeWindow] = useState(existingPost?.time_window || "now");
  const [skillLevel, setSkillLevel] = useState(existingPost?.skill_level || user?.skill_label || "any");
  const [matchType, setMatchType] = useState(existingPost?.match_type || "any");
  const [note, setNote] = useState(existingPost?.note || "");
  const [locationName, setLocationName] = useState(existingPost?.location_name || user?.location || "");
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);

  const detectLocation = async () => {
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`);
        const data = await r.json();
        const city = data.address?.city || data.address?.town || data.address?.village || "";
        setLocationName(city || locationName);
      } catch {}
      setDetecting(false);
    }, () => setDetecting(false));
  };

  const handleSubmit = async () => {
    if (saving) return;
    setSaving(true);

    const expiresAt = new Date(Date.now() + EXPIRY_HOURS[timeWindow] * 3600000).toISOString();

    // Cancel any existing active post first
    if (existingPost) {
      await base44.entities.AvailabilityPost.update(existingPost.id, { status: "cancelled" });
    }

    await base44.entities.AvailabilityPost.create({
      user_id: user.id,
      user_email: user.email,
      user_name: user.full_name || user.name,
      user_avatar: user.photo_url || "",
      status: "active",
      time_window: timeWindow,
      location_name: locationName,
      skill_level: skillLevel,
      match_type: matchType,
      note: note.trim(),
      expires_at: expiresAt,
    });

    queryClient.invalidateQueries(["availability-posts"]);
    setSaving(false);
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
        onClick={onClose}
      >
        <motion.div
          key="sheet"
          initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 300 }}
          className="w-full max-w-lg bg-card rounded-t-3xl overflow-hidden shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-border rounded-full" />
          </div>

          <div className="px-5 pt-2 pb-8">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-heading font-bold text-lg">I'm Available to Play 🎾</h2>
                <p className="text-xs text-muted-foreground">Your post will appear in the live feed</p>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5">
              {/* Time window */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">When?</p>
                <div className="grid grid-cols-3 gap-2">
                  {TIME_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setTimeWindow(opt.value)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-xs font-semibold transition-all ${
                        timeWindow === opt.value
                          ? "bg-primary/10 border-primary text-primary"
                          : "bg-secondary border-border text-secondary-foreground"
                      }`}
                    >
                      <span className="text-lg">{opt.emoji}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Location */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Location</p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      value={locationName}
                      onChange={e => setLocationName(e.target.value)}
                      placeholder="Town or venue…"
                      className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <button
                    onClick={detectLocation}
                    disabled={detecting}
                    className="w-10 h-10 rounded-xl border border-border bg-secondary flex items-center justify-center flex-shrink-0"
                  >
                    {detecting
                      ? <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      : <Navigation className="w-3.5 h-3.5 text-muted-foreground" />
                    }
                  </button>
                </div>
              </div>

              {/* Skill level */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Skill Level</p>
                <div className="flex gap-2 flex-wrap">
                  {SKILL_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setSkillLevel(opt.value)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                        skillLevel === opt.value
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-secondary text-secondary-foreground border-border"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Match type */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Match Type</p>
                <div className="flex gap-2">
                  {TYPE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setMatchType(opt.value)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                        matchType === opt.value
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-secondary text-secondary-foreground border-border"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional note */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Note (optional)</p>
                <input
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  maxLength={100}
                  placeholder="e.g. Looking for a friendly hitting session…"
                  className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={saving}
              className="w-full h-12 rounded-2xl font-heading font-semibold text-base mt-6 gap-2"
            >
              {saving
                ? <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                : "🎾 Post Availability"
              }
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}