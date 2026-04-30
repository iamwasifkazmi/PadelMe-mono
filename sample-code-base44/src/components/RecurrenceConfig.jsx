import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

"use client";

export default function RecurrenceConfig({ value, onChange }) {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  const updatePattern = (field, val) => {
    const pattern = value?.pattern || {};
    onChange({ ...value, pattern: { ...pattern, [field]: val } });
  };

  const toggleDay = (day) => {
    const pattern = value?.pattern || {};
    const days = pattern.days || [];
    const newDays = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
    updatePattern("days", newDays);
  };

  if (!value?.enabled) {
    return (
      <div className="flex items-center justify-between p-3 bg-card rounded-xl border border-border">
        <p className="text-sm font-medium">Repeat this match</p>
        <Switch checked={false} onCheckedChange={(v) => onChange({ enabled: v, pattern: {} })} />
      </div>
    );
  }

  const pattern = value.pattern || {};

  return (
    <div className="space-y-4 p-4 bg-primary/5 rounded-2xl border border-primary/20">
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold">🔄 Recurring Match</h3>
        <Switch checked={true} onCheckedChange={(v) => onChange({ enabled: v, pattern: {} })} />
      </div>

      {/* Frequency */}
      <div>
        <Label className="text-sm font-medium mb-2 block">Frequency</Label>
        <Select value={pattern.frequency || "weekly"} onValueChange={(v) => updatePattern("frequency", v)}>
          <SelectTrigger className="rounded-xl h-11 bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="biweekly">Every 2 Weeks</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Days of Week (for weekly/biweekly) */}
      {(pattern.frequency === "weekly" || pattern.frequency === "biweekly") && (
        <div>
          <Label className="text-sm font-medium mb-2 block">Days of Week</Label>
          <div className="grid grid-cols-7 gap-2">
            {days.map((day) => (
              <button
                key={day}
                onClick={() => toggleDay(day)}
                className={`py-2 rounded-lg text-xs font-medium transition-all ${
                  (pattern.days || []).includes(day)
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                }`}
              >
                {day.slice(0, 2)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* End Rule */}
      <div>
        <Label className="text-sm font-medium mb-2 block">When Should This Series End?</Label>
        <Select value={pattern.end_rule || "never"} onValueChange={(v) => updatePattern("end_rule", v)}>
          <SelectTrigger className="rounded-xl h-11 bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="never">Never (Keep Running)</SelectItem>
            <SelectItem value="on_date">End on a Specific Date</SelectItem>
            <SelectItem value="after_count">End After X Occurrences</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* End Date */}
      {pattern.end_rule === "on_date" && (
        <div>
          <Label className="text-sm font-medium mb-2 block">End Date</Label>
          <Input
            type="date"
            value={pattern.end_date || ""}
            onChange={(e) => updatePattern("end_date", e.target.value)}
            className="rounded-xl h-11 bg-card"
          />
        </div>
      )}

      {/* End Count */}
      {pattern.end_rule === "after_count" && (
        <div>
          <Label className="text-sm font-medium mb-2 block">Number of Occurrences</Label>
          <Input
            type="number"
            min="1"
            placeholder="10"
            value={pattern.end_count || ""}
            onChange={(e) => updatePattern("end_count", Number(e.target.value))}
            className="rounded-xl h-11 bg-card"
          />
        </div>
      )}

      {/* Player Mode */}
      <div>
        <Label className="text-sm font-medium mb-2 block">Player Group</Label>
        <Select value={value.player_mode || "open"} onValueChange={(v) => onChange({ ...value, player_mode: v })}>
          <SelectTrigger className="rounded-xl h-11 bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open Slots Each Time</SelectItem>
            <SelectItem value="fixed">Fixed Player Group</SelectItem>
            <SelectItem value="hybrid">Hybrid (Some Fixed + Open)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1.5">
          {value.player_mode === "open" && "New occurrence published each time with open spaces"}
          {value.player_mode === "fixed" && "Same players in every occurrence"}
          {value.player_mode === "hybrid" && "Some fixed players + remaining slots open each time"}
        </p>
      </div>
    </div>
  );
}