/**
 * LeaveMatchDialog — confirms a player leaving a match.
 * Shows a late-withdrawal warning when the match starts within 2 hours.
 */
import { useState } from "react";
import { AlertTriangle, Clock, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LeaveMatchDialog({ open, onClose, onConfirm, matchTitle, matchDate, matchTime, isLateWithdrawal }) {
  const [leaving, setLeaving] = useState(false);

  if (!open) return null;

  const handleConfirm = async () => {
    setLeaving(true);
    await onConfirm();
    setLeaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-sm mx-4 sm:mx-auto bg-card rounded-3xl shadow-2xl p-6 space-y-4 mb-4 sm:mb-0">

        {/* Icon */}
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto ${isLateWithdrawal ? "bg-amber-100" : "bg-secondary"}`}>
          {isLateWithdrawal
            ? <AlertTriangle className="w-6 h-6 text-amber-500" />
            : <LogOut className="w-6 h-6 text-muted-foreground" />
          }
        </div>

        {/* Heading */}
        <div className="text-center">
          <h2 className="font-heading font-bold text-lg">Leave this match?</h2>
          {matchTitle && <p className="text-sm text-muted-foreground mt-0.5">{matchTitle}</p>}
        </div>

        {/* Late-withdrawal warning */}
        {isLateWithdrawal && (
          <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-700">
            <Clock className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>This match starts soon. Leaving now may affect your <strong>reliability score</strong>.</span>
          </div>
        )}

        {/* Body text */}
        <p className="text-sm text-muted-foreground text-center leading-relaxed">
          You'll be removed from this match and the organiser will be notified so they can find another player.
        </p>

        {/* Buttons */}
        <div className="flex flex-col gap-2 pt-1">
          <Button
            variant="destructive"
            className="w-full h-11 rounded-2xl font-heading font-semibold"
            onClick={handleConfirm}
            disabled={leaving}
          >
            {leaving
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : "Leave Match"
            }
          </Button>
          <Button
            variant="outline"
            className="w-full h-11 rounded-2xl font-heading font-semibold"
            onClick={onClose}
            disabled={leaving}
          >
            Stay In Match
          </Button>
        </div>
      </div>
    </div>
  );
}