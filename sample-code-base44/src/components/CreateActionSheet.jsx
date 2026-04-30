import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, Lock, Crown, RefreshCw, Trophy, BarChart2, Zap, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import SetAvailabilitySheet from "./availability/SetAvailabilitySheet";

export default function CreateActionSheet({ user, onClose }) {
  const navigate = useNavigate();
  const [showPaywall, setShowPaywall] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [showAvailability, setShowAvailability] = useState(false);

  const isSubscribed = user?.is_subscribed;

  const handlePlayNow = () => {
    onClose();
    navigate("/instant-play");
  };

  const handleMatch = () => {
    onClose();
    navigate("/create-match");
  };

  const handleRecurring = () => {
    onClose();
    navigate("/create-match?recurring=true");
  };

  const handleCompetition = (type) => {
    if (!isSubscribed) {
      setShowPaywall(true);
      return;
    }
    onClose();
    navigate("/create-competition", { state: { defaultType: type } });
  };

  const handleUpgrade = async () => {
    setUpgrading(true);
    // Simulate subscription upgrade (reuse existing SubscriptionGate logic)
    try {
      const { base44 } = await import("@/api/base44Client");
      await base44.auth.updateMe({ is_subscribed: true });
      // Re-fetch user
      const updated = await base44.auth.me();
      setUpgrading(false);
      setShowPaywall(false);
      // Now allow them to proceed
      onClose();
      navigate("/create-competition");
    } catch {
      setUpgrading(false);
    }
  };

  return (
    <>
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
        onClick={onClose}
      >
        <motion.div
          key="sheet"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 300 }}
          className="w-full max-w-lg bg-card rounded-t-3xl overflow-hidden shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {!showPaywall ? (
            <>
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-border rounded-full" />
              </div>

              <div className="px-5 pt-2 pb-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="font-heading font-bold text-lg">Create</h2>
                  <button onClick={onClose} className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-2">
                  {/* I'm Available */}
                  <ActionRow
                    icon={<Radio className="w-5 h-5 text-green-500" />}
                    label="I'm Available to Play 🎾"
                    desc="Post to the live feed — let players find you"
                    highlight
                    onClick={() => setShowAvailability(true)}
                  />

                  {/* Play Now */}
                  <ActionRow
                    icon={<Zap className="w-5 h-5 text-accent" />}
                    label="Play Now ⚡"
                    desc="Find a match instantly — minimal setup"
                    onClick={handlePlayNow}
                  />

                  <div className="my-1 border-t border-border" />
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Full Control</p>

                  {/* Match */}
                  <ActionRow
                    icon="🎾"
                    label="Create Match"
                    desc="Set up a single game with full options"
                    onClick={handleMatch}
                  />

                  {/* Recurring */}
                  <ActionRow
                    icon={<RefreshCw className="w-5 h-5 text-primary" />}
                    label="Recurring Match"
                    desc="Weekly or repeating series"
                    onClick={handleRecurring}
                  />

                  <div className="my-3 border-t border-border" />
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Competitions · Pro</p>

                  {/* Tournament */}
                  <ActionRow
                    icon={<Trophy className="w-5 h-5 text-accent" />}
                    label="Create Tournament"
                    desc="Knockout or round-robin"
                    pro
                    locked={!isSubscribed}
                    onClick={() => handleCompetition("tournament")}
                  />

                  {/* League */}
                  <ActionRow
                    icon={<BarChart2 className="w-5 h-5 text-primary" />}
                    label="Create League"
                    desc="Season-long standings"
                    pro
                    locked={!isSubscribed}
                    onClick={() => handleCompetition("league")}
                  />
                </div>
              </div>
            </>
          ) : (
            <PaywallPanel
              onClose={() => setShowPaywall(false)}
              onUpgrade={handleUpgrade}
              upgrading={upgrading}
            />
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>

    {showAvailability && (
      <SetAvailabilitySheet
        user={user}
        onClose={() => { setShowAvailability(false); onClose(); }}
      />
    )}
    </>
  );
}

function ActionRow({ icon, label, desc, pro, locked, highlight, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3.5 p-3.5 rounded-2xl border transition-all text-left active:scale-[0.98] ${
        locked
          ? "bg-muted/30 border-border opacity-75"
          : highlight
          ? "bg-accent/10 border-accent/30 hover:bg-accent/15"
          : "bg-card border-border hover:border-primary/40 hover:bg-primary/5"
      }`}
    >
      <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0 text-xl">
        {typeof icon === "string" ? icon : icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-heading font-semibold text-sm">{label}</p>
          {pro && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full">
              <Crown className="w-2.5 h-2.5" /> PRO
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      {locked ? (
        <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      ) : (
        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      )}
    </button>
  );
}

function PaywallPanel({ onClose, onUpgrade, upgrading }) {
  return (
    <>
      <div className="flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 bg-border rounded-full" />
      </div>
      <div className="px-5 pt-3 pb-8">
        <button onClick={onClose} className="text-muted-foreground text-sm flex items-center gap-1 mb-4">
          ← Back
        </button>

        <div className="text-center mb-6">
          <div className="text-5xl mb-3">🏆</div>
          <h2 className="font-heading font-bold text-xl mb-1">Go Pro to Host Competitions</h2>
          <p className="text-muted-foreground text-sm">Unlock powerful hosting features</p>
        </div>

        <div className="space-y-2.5 mb-6">
          {[
            { icon: "🏆", text: "Create tournaments & leagues" },
            { icon: "💰", text: "Collect entry fees from participants" },
            { icon: "📊", text: "Run brackets & leaderboards" },
            { icon: "🎯", text: "Priority visibility in competition feed" },
            { icon: "⚙️", text: "Advanced scoring & rules engine" },
          ].map((item) => (
            <div key={item.text} className="flex items-center gap-3 p-3 bg-primary/5 rounded-xl">
              <span className="text-lg">{item.icon}</span>
              <p className="text-sm font-medium">{item.text}</p>
            </div>
          ))}
        </div>

        <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-2xl p-4 mb-5 text-center">
          <p className="font-heading font-bold text-amber-800 text-base">FLEX Pro</p>
          <p className="text-amber-700 text-xs mt-0.5">Unlimited competitions · 2.5% platform fee</p>
        </div>

        <Button
          onClick={onUpgrade}
          disabled={upgrading}
          className="w-full h-12 rounded-2xl font-heading font-bold text-base shadow-lg shadow-primary/20 gap-2"
        >
          {upgrading ? (
            <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
          ) : (
            <>
              <Zap className="w-5 h-5" /> Start Subscription
            </>
          )}
        </Button>
        <button onClick={onClose} className="w-full mt-3 text-sm text-muted-foreground py-1">
          Maybe Later
        </button>
      </div>
    </>
  );
}