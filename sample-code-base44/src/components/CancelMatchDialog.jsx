/**
 * CancelMatchDialog — confirmation modal before cancelling a match.
 */
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CancelMatchDialog({ open, onClose, onConfirm, matchTitle }) {
  const [cancelling, setCancelling] = useState(false);

  if (!open) return null;

  const handleConfirm = async () => {
    setCancelling(true);
    await onConfirm();
    setCancelling(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-card rounded-2xl border border-border shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <p className="font-heading font-bold text-base">Cancel this match?</p>
            <p className="text-xs text-muted-foreground mt-0.5">{matchTitle}</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          This will notify all players and remove the match from active games. This action cannot be undone.
        </p>

        <div className="flex gap-3 pt-1">
          <Button
            variant="outline"
            className="flex-1 rounded-xl"
            onClick={onClose}
            disabled={cancelling}
          >
            Go Back
          </Button>
          <Button
            className="flex-1 rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            onClick={handleConfirm}
            disabled={cancelling}
          >
            {cancelling ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              "Cancel Match"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}