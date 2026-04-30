import { Globe, Lock } from "lucide-react";

/**
 * Reusable visibility picker for matches, competitions, etc.
 * value: "public" | "invite_only"
 * onChange: (value) => void
 */
export default function VisibilityPicker({ value, onChange }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Who can see this event?</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange("public")}
          className={`flex flex-col items-start gap-1.5 p-3.5 rounded-2xl border-2 transition-all text-left ${
            value === "public"
              ? "border-primary bg-primary/8 text-primary"
              : "border-border bg-card text-foreground"
          }`}
        >
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4" />
            <span className="font-semibold text-sm">Public</span>
          </div>
          <p className="text-xs text-muted-foreground leading-snug">
            Anyone eligible can find and join this event
          </p>
        </button>

        <button
          type="button"
          onClick={() => onChange("invite_only")}
          className={`flex flex-col items-start gap-1.5 p-3.5 rounded-2xl border-2 transition-all text-left ${
            value === "invite_only"
              ? "border-primary bg-primary/8 text-primary"
              : "border-border bg-card text-foreground"
          }`}
        >
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4" />
            <span className="font-semibold text-sm">Invite Only</span>
          </div>
          <p className="text-xs text-muted-foreground leading-snug">
            Only invited users can view and join this event
          </p>
        </button>
      </div>
    </div>
  );
}