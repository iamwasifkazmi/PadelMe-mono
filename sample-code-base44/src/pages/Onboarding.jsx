import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, MapPin, Zap } from "lucide-react";

const SKILL_OPTIONS = [
  { value: "beginner", label: "Beginner", emoji: "🌱", desc: "Just starting out" },
  { value: "intermediate", label: "Intermediate", emoji: "⚡", desc: "Played for a while" },
  { value: "advanced", label: "Advanced", emoji: "🏆", desc: "Competitive player" },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState(1); // 1: name, 2: skill, 3: location
  const [name, setName] = useState("");
  const [skill, setSkill] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      // Pre-fill name if provided by auth provider
      if (u?.full_name && u.full_name !== u.email) {
        setName(u.full_name);
      }
      // If profile is already complete, redirect
      if (u?.profile_complete) {
        redirectAfterOnboarding();
      }
    });
  }, []);

  const redirectAfterOnboarding = () => {
    const pendingToken = localStorage.getItem("invite_token_pending");
    if (pendingToken) {
      localStorage.removeItem("invite_token_pending");
      navigate(`/accept-invite?token=${pendingToken}`, { replace: true });
    } else {
      navigate("/", { replace: true });
    }
  };

  const handleFinish = async () => {
    if (!name.trim() || !skill || !location.trim()) return;
    setSaving(true);

    const skillNumeric = skill === "advanced" ? 3 : skill === "intermediate" ? 5 : 8;

    await base44.auth.updateMe({
      name: name.trim(),
      full_name: name.trim(),
      skill_label: skill,
      skill_level: skillNumeric,
      location: location.trim(),
      profile_complete: true,
    });

    redirectAfterOnboarding();
  };

  const canGoNext = () => {
    if (step === 1) return name.trim().length >= 2;
    if (step === 2) return !!skill;
    if (step === 3) return location.trim().length >= 2;
    return false;
  };

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
    else handleFinish();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 via-background to-background flex flex-col">
      {/* Brand */}
      <div className="flex items-center justify-center pt-10 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-heading font-bold text-base">MatchPoint</span>
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 mt-4 mb-2">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`rounded-full transition-all duration-300 ${
              s === step ? "w-6 h-2 bg-primary" : s < step ? "w-2 h-2 bg-primary/50" : "w-2 h-2 bg-border"
            }`}
          />
        ))}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-5">
        <div className="w-full max-w-sm">
          <AnimatePresence mode="wait">
            {/* ── STEP 1: Name ── */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.25 }}
                className="space-y-6"
              >
                <div className="text-center">
                  <p className="text-4xl mb-3">👋</p>
                  <h1 className="font-heading font-bold text-2xl">What's your name?</h1>
                  <p className="text-muted-foreground text-sm mt-1">This is how other players will see you</p>
                </div>
                <Input
                  autoFocus
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && canGoNext() && handleNext()}
                  className="h-14 rounded-2xl text-lg text-center bg-card border-2 focus-visible:ring-0 focus-visible:border-primary"
                />
              </motion.div>
            )}

            {/* ── STEP 2: Skill ── */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.25 }}
                className="space-y-6"
              >
                <div className="text-center">
                  <p className="text-4xl mb-3">🎾</p>
                  <h1 className="font-heading font-bold text-2xl">Your Padel level?</h1>
                  <p className="text-muted-foreground text-sm mt-1">We'll match you with the right players</p>
                </div>
                <div className="space-y-3">
                  {SKILL_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setSkill(opt.value)}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
                        skill === opt.value
                          ? "border-primary bg-primary/8 shadow-md shadow-primary/10"
                          : "border-border bg-card"
                      }`}
                    >
                      <span className="text-2xl">{opt.emoji}</span>
                      <div className="flex-1">
                        <p className={`font-heading font-semibold text-base ${skill === opt.value ? "text-primary" : "text-foreground"}`}>
                          {opt.label}
                        </p>
                        <p className="text-xs text-muted-foreground">{opt.desc}</p>
                      </div>
                      {skill === opt.value && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                          <div className="w-2 h-2 rounded-full bg-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── STEP 3: Location ── */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.25 }}
                className="space-y-6"
              >
                <div className="text-center">
                  <p className="text-4xl mb-3">📍</p>
                  <h1 className="font-heading font-bold text-2xl">Where are you based?</h1>
                  <p className="text-muted-foreground text-sm mt-1">Find matches near you</p>
                </div>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    autoFocus
                    placeholder="City or town"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && canGoNext() && handleNext()}
                    className="h-14 rounded-2xl text-lg pl-11 bg-card border-2 focus-visible:ring-0 focus-visible:border-primary"
                  />
                </div>
                <p className="text-xs text-center text-muted-foreground">
                  You can add more detail to your profile later
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* CTA Button */}
          <div className="mt-8">
            <Button
              onClick={handleNext}
              disabled={!canGoNext() || saving}
              className="w-full h-14 rounded-2xl font-heading font-bold text-base shadow-lg shadow-primary/20 gap-2"
            >
              {saving ? (
                <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : step === 3 ? (
                "Let's Play 🎾"
              ) : (
                <>Continue <ChevronRight className="w-5 h-5" /></>
              )}
            </Button>
          </div>

          {/* Skip link for steps 2+ */}
          {step === 3 && (
            <button
              onClick={() => { setLocation("TBD"); handleFinish(); }}
              className="w-full mt-3 text-center text-xs text-muted-foreground hover:text-foreground"
            >
              Skip for now
            </button>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground pb-8">
        MatchPoint · Padel Matchmaking
      </p>
    </div>
  );
}