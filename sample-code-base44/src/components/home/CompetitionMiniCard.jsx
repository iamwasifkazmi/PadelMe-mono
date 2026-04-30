import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CompetitionMiniCard({ competition, onClick }) {
  const joined = competition.participants?.length || 0;
  const pct = competition.max_players ? Math.round((joined / competition.max_players) * 100) : 0;

  return (
    <div
      className="bg-card rounded-2xl border border-border p-4 flex items-center gap-4 cursor-pointer hover:border-primary/40 transition-all active:scale-[0.99]"
      onClick={onClick}
    >
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Trophy className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-heading font-semibold text-sm truncate">{competition.name}</p>
        <p className="text-xs text-muted-foreground capitalize">{competition.type} · {competition.skill_level}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[10px] text-muted-foreground">{joined}/{competition.max_players}</span>
        </div>
      </div>
      <Button size="sm" className="rounded-xl h-8 text-xs flex-shrink-0" onClick={(e) => { e.stopPropagation(); onClick(); }}>
        View
      </Button>
    </div>
  );
}