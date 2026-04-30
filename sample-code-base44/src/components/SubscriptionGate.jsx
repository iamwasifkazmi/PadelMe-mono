import { useState } from "react";
import { Crown, Zap, Trophy, DollarSign, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

export default function SubscriptionGate({ onSubscribed }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubscribe = async () => {
    setLoading(true);
    // Simulate subscription activation (real payments need Stripe integration)
    await base44.auth.updateMe({
      is_subscribed: true,
      subscription_since: new Date().toISOString(),
    });
    toast({ title: "Welcome to MatchPoint Premium! 👑", description: "You can now create tournaments and leagues." });
    setLoading(false);
    onSubscribed?.();
  };

  const features = [
    { icon: Trophy, text: "Create & host tournaments" },
    { icon: Zap, text: "Run weekly leagues" },
    { icon: DollarSign, text: "Collect entry fees & prize pools" },
  ];

  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-accent to-amber-400 flex items-center justify-center mb-5 shadow-lg shadow-accent/30">
        <Crown className="w-10 h-10 text-white" />
      </div>

      <h2 className="font-heading font-bold text-2xl mb-2">MatchPoint Premium</h2>
      <p className="text-muted-foreground text-sm max-w-xs mb-6">
        Unlock tournament hosting, league management, and prize pools. Only £4.99/month.
      </p>

      <div className="w-full max-w-xs space-y-3 mb-8">
        {features.map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-center gap-3 bg-card rounded-xl p-3 border border-border text-left">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <span className="text-sm font-medium">{text}</span>
          </div>
        ))}
      </div>

      <div className="w-full max-w-xs space-y-2">
        <Button
          onClick={handleSubscribe}
          disabled={loading}
          className="w-full h-12 rounded-xl font-heading font-semibold bg-gradient-to-r from-accent to-amber-400 text-white hover:opacity-90 shadow-lg shadow-accent/30"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <><Crown className="w-4 h-4 mr-2" /> Subscribe — £4.99/month</>
          )}
        </Button>
        <p className="text-muted-foreground text-xs">
          2.5% platform fee applies to all entry fees collected
        </p>
      </div>
    </div>
  );
}