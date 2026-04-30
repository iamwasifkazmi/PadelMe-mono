import { getELOTier } from "@/lib/elo";
import { Star } from "lucide-react";

/**
 * Display player ELO rating with tier and progress bar.
 * Sizes: "sm" (compact), "md" (default), "lg" (detailed)
 */
export default function ELODisplay({ elo = 1000, size = "md", showBar = true, peak = null, className = "" }) {
  const tier = getELOTier(elo);
  
  const sizes = {
    sm: {
      container: "gap-1.5",
      text: "text-xs",
      tier: "text-[10px]",
      bar: "h-1.5",
    },
    md: {
      container: "gap-2",
      text: "text-sm",
      tier: "text-xs",
      bar: "h-2",
    },
    lg: {
      container: "gap-3",
      text: "text-base",
      tier: "text-sm",
      bar: "h-3",
    },
  };

  const s = sizes[size] || sizes.md;

  // Calculate progress within tier
  const tierWidth = tier.max - tier.min;
  const progress = Math.min(100, ((elo - tier.min) / tierWidth) * 100);

  return (
    <div className={`flex flex-col ${s.container} ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`font-heading font-bold ${s.text} text-foreground`}>{Math.round(elo)}</span>
        <span className={`font-medium ${s.tier} text-muted-foreground`}>{tier.label}</span>
      </div>

      {showBar && (
        <div className={`w-full bg-secondary rounded-full overflow-hidden ${s.bar}`}>
          <div
            className={`${s.bar} transition-all duration-300 rounded-full`}
            style={{
              width: `${progress}%`,
              backgroundColor: tier.color,
            }}
          />
        </div>
      )}

      {peak && peak > elo && size !== "sm" && (
        <p className="text-[10px] text-muted-foreground">Peak: {Math.round(peak)}</p>
      )}
    </div>
  );
}

/**
 * Display star rating with count.
 */
export function RatingDisplay({ rating = 0, count = 0, size = "md", className = "" }) {
  const sizes = { sm: "w-3.5 h-3.5", md: "w-4 h-4", lg: "w-5 h-5" };
  const textSizes = { sm: "text-xs", md: "text-sm", lg: "text-base" };

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <Star className={`${sizes[size]} fill-accent text-accent`} />
      <span className={`font-semibold ${textSizes[size]} text-foreground`}>
        {rating.toFixed(1)}
      </span>
      {count > 0 && (
        <span className="text-[10px] text-muted-foreground">({count})</span>
      )}
    </div>
  );
}

/**
 * Combined ELO + Star Rating card for player preview.
 */
export function PlayerSkillCard({ elo = 1000, rating = 0, ratingCount = 0, peak = null, className = "" }) {
  const tier = getELOTier(elo);

  return (
    <div className={`flex flex-col gap-2 p-3 rounded-xl bg-card/50 border border-border ${className}`}>
      {/* ELO Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="font-heading font-bold text-sm">{Math.round(elo)}</span>
          <span className="text-[10px] font-medium text-muted-foreground">{tier.label}</span>
        </div>
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: `${tier.color}20`, color: tier.color }}>
          {tier.icon}
        </span>
      </div>

      {/* ELO Bar */}
      <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-1.5 rounded-full transition-all"
          style={{
            width: `${Math.min(100, ((elo - tier.min) / (tier.max - tier.min)) * 100)}%`,
            backgroundColor: tier.color,
          }}
        />
      </div>

      {/* Star Rating */}
      {rating > 0 && (
        <div className="flex items-center gap-1">
          <Star className="w-3.5 h-3.5 fill-accent text-accent" />
          <span className="text-xs font-semibold text-foreground">{rating.toFixed(1)}</span>
          {ratingCount > 0 && (
            <span className="text-[10px] text-muted-foreground">from {ratingCount}</span>
          )}
        </div>
      )}
    </div>
  );
}