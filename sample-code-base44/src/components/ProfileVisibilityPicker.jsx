import { Globe, Lock } from "lucide-react";

/**
 * Reusable profile visibility picker.
 * value: "public" | "private"
 * onChange: (value) => void
 */
export default function ProfileVisibilityPicker({ value, onChange }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Who can see your profile?</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange("public")}
          className={`flex flex-col items-start gap-1.5 p-3.5 rounded-2xl border-2 transition-all text-left ${
            value === "public" || !value
              ? "border-primary bg-primary/8 text-primary"
              : "border-border bg-card text-foreground"
          }`}
        >
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4" />
            <span className="font-semibold text-sm">Public</span>
          </div>
          <p className="text-xs text-muted-foreground leading-snug">
            Anyone can find and view your profile
          </p>
        </button>

        <button
          type="button"
          onClick={() => onChange("private")}
          className={`flex flex-col items-start gap-1.5 p-3.5 rounded-2xl border-2 transition-all text-left ${
            value === "private"
              ? "border-primary bg-primary/8 text-primary"
              : "border-border bg-card text-foreground"
          }`}
        >
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4" />
            <span className="font-semibold text-sm">Private</span>
          </div>
          <p className="text-xs text-muted-foreground leading-snug">
            Only approved friends can view your profile
          </p>
        </button>
      </div>
    </div>
  );
}