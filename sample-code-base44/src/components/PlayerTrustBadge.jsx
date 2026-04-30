import { Star, ShieldAlert, ShieldX, Crown, Award } from "lucide-react";
import { Badge } from "@/components/ui/badge";

function StarDisplay({ rating }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`w-4 h-4 ${s <= Math.round(rating) ? "fill-accent text-accent" : "text-border"}`}
        />
      ))}
    </div>
  );
}

export function RatingDisplay({ avgRating, totalRatings, size = "md" }) {
  if (!avgRating || !totalRatings) {
    return <span className="text-muted-foreground text-sm">No ratings yet</span>;
  }
  return (
    <div className={`flex items-center gap-2 ${size === "lg" ? "" : "text-sm"}`}>
      <StarDisplay rating={avgRating} />
      <span className="font-heading font-bold text-foreground">{avgRating.toFixed(1)}</span>
      <span className="text-muted-foreground text-xs">({totalRatings} ratings)</span>
    </div>
  );
}

export function RestrictionBanner({ avgRating }) {
  if (!avgRating || avgRating >= 3.5) return null;

  if (avgRating < 2.5) {
    return (
      <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/20 rounded-xl p-3">
        <ShieldX className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-destructive">Account Restricted</p>
          <p className="text-xs text-destructive/80 mt-0.5">
            Rating below 2.5 ★ — restricted from joining leagues and paid tournaments.
          </p>
        </div>
      </div>
    );
  }

  if (avgRating < 3.0) {
    return (
      <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl p-3">
        <ShieldAlert className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-orange-700">Reduced Visibility</p>
          <p className="text-xs text-orange-600 mt-0.5">
            Rating below 3.0 ★ — lower priority in match discovery.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
      <ShieldAlert className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-amber-700">Low Rating Warning</p>
        <p className="text-xs text-amber-600 mt-0.5">
          Rating below 3.5 ★ — improve your score to unlock all features.
        </p>
      </div>
    </div>
  );
}

export function PlayerBadges({ avgRating, totalRatings, tagSummary }) {
  const badges = [];

  if (totalRatings >= 10 && avgRating >= 4.5) {
    badges.push({ icon: Crown, label: "Top Player", className: "bg-accent/20 text-accent border-accent/30" });
  }
  if (totalRatings >= 5 && (tagSummary?.showed_up_on_time || 0) >= 3) {
    badges.push({ icon: Award, label: "Most Reliable", className: "bg-green-100 text-green-700 border-green-200" });
  }
  if (totalRatings >= 5 && avgRating >= 4.0) {
    badges.push({ icon: Star, label: "Highly Rated", className: "bg-purple-100 text-purple-700 border-purple-200" });
  }

  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map(({ icon: Icon, label, className }) => (
        <Badge key={label} variant="outline" className={`gap-1 text-xs ${className}`}>
          <Icon className="w-3 h-3" /> {label}
        </Badge>
      ))}
    </div>
  );
}