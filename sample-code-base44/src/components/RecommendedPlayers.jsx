import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PlayerAvatar from "./PlayerAvatar";
import SkillBadge from "./SkillBadge";
import VerificationBadge from "./VerificationBadge";
import { Star, MapPin, Zap } from "lucide-react";
import { motion } from "framer-motion";

export default function RecommendedPlayers({ limit = 6, onInvite, onViewProfile }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  const { data: response = {}, isLoading } = useQuery({
    queryKey: ["recommended-users", user?.email],
    queryFn: () => base44.functions.invoke("getRecommendedUsers", { limit }),
    enabled: !!user?.email,
  });

  const recommendations = response.data?.recommendations || [];

  if (!user) return null;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 bg-card rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <div className="text-center p-6 bg-card rounded-2xl border border-border">
        <p className="text-muted-foreground text-sm">No players nearby yet. Check back soon!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {recommendations.map((player, idx) => (
        <motion.div
          key={player.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.05 }}
          className="p-4 bg-card rounded-2xl border border-border hover:border-primary/50 transition-all"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <PlayerAvatar name={player.full_name} avatarUrl={player.photo_url} size="md" />
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-heading font-semibold text-sm truncate">{player.full_name}</h3>
                  <VerificationBadge
                    photoVerified={player.photo_verified}
                    idVerified={player.id_verified}
                    size="sm"
                  />
                </div>

                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                  <MapPin className="w-3 h-3" />
                  <span>{player.location || "Location unknown"}</span>
                </div>

                <div className="flex flex-wrap gap-1 mb-2">
                  {player.sports?.slice(0, 2).map((sport) => (
                    <Badge key={sport} variant="outline" className="text-xs">
                      {sport}
                    </Badge>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <SkillBadge level={player.skill_label || "intermediate"} />
                  {player.average_rating > 0 && (
                    <div className="flex items-center gap-0.5 text-xs">
                      <Star className="w-3 h-3 fill-accent text-accent" />
                      <span className="font-medium">{player.average_rating.toFixed(1)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              {player.notify_instant_play && (
                <Badge variant="default" className="text-xs gap-1 whitespace-nowrap">
                  <Zap className="w-3 h-3" /> Play Now
                </Badge>
              )}
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-8 rounded-lg"
                onClick={() => onViewProfile?.(player)}
              >
                View
              </Button>
              {onInvite && (
                <Button
                  size="sm"
                  className="text-xs h-8 rounded-lg"
                  onClick={() => onInvite?.(player)}
                >
                  Invite
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}