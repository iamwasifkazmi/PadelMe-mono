import { useState } from "react";
import { getScoreEntryStatus } from "../utils/scoreEntryRules";
import { Upload, ImageIcon, Edit2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";

export default function SubmitScoreModal({ open, onClose, match, currentUserEmail, currentUserName, onSubmitted }) {
  const isPlayer1 = currentUserEmail === match?.player1_email;
  const myName = isPlayer1 ? match?.player1_name : match?.player2_name;
  const opponentName = isPlayer1 ? match?.player2_name : match?.player1_name;

  // Pre-fill if editing existing submission
  const existingP1 = match?.submitted_score_p1 || "";
  const existingP2 = match?.submitted_score_p2 || "";

  const [score1, setScore1] = useState(isPlayer1 ? existingP1 : existingP2);
  const [score2, setScore2] = useState(isPlayer1 ? existingP2 : existingP1);
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isEdit = match?.submitted_by === currentUserEmail && match?.status === "pending_validation";

  // Re-check timing rules at submission time as a safety guard
  const { allowed: timingAllowed, reason: timingReason } = getScoreEntryStatus(match);

  const handleFileChange = (e) => {
    if (e.target.files[0]) setEvidenceFile(e.target.files[0]);
  };

  const handleSubmit = async () => {
    if (!score1 || !score2) return;
    if (!isEdit && !timingAllowed) return; // timing guard
    setSubmitting(true);

    let evidenceUrl = match?.evidence_url || null;
    if (evidenceFile) {
      setUploading(true);
      const { file_url } = await base44.integrations.Core.UploadFile({ file: evidenceFile });
      evidenceUrl = file_url;
      setUploading(false);
    }

    const p1Score = isPlayer1 ? score1 : score2;
    const p2Score = isPlayer1 ? score2 : score1;

    await base44.entities.CompetitionMatch.update(match.id, {
      submitted_score_p1: p1Score,
      submitted_score_p2: p2Score,
      submitted_by: currentUserEmail,
      status: "pending_validation",
      evidence_url: evidenceUrl,
    });

    // Audit log
    await base44.entities.ScoreAuditLog.create({
      competition_match_id: match.id,
      competition_id: match.competition_id,
      action: isEdit ? "edited" : "submitted",
      actor_email: currentUserEmail,
      actor_name: currentUserName || currentUserEmail,
      score_p1: p1Score,
      score_p2: p2Score,
      player1_name: match.player1_name,
      player2_name: match.player2_name,
      timestamp: new Date().toISOString(),
    });

    onSubmitted?.();
    onClose();
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm mx-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            {isEdit && <Edit2 className="w-4 h-4 text-accent" />}
            {isEdit ? "Edit Submitted Score" : "Submit Match Result"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-muted-foreground text-sm">
            {isEdit
              ? "You can edit this score until the opposing captain responds."
              : !timingAllowed && timingReason
              ? timingReason
              : "Enter the final score. The opposing captain will need to confirm it."}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm font-medium mb-1.5 block">{myName} (You)</Label>
              <Input
                placeholder="e.g. 6"
                value={score1}
                onChange={(e) => setScore1(e.target.value)}
                className="rounded-xl h-11 text-center font-heading font-bold text-lg"
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">{opponentName}</Label>
              <Input
                placeholder="e.g. 4"
                value={score2}
                onChange={(e) => setScore2(e.target.value)}
                className="rounded-xl h-11 text-center font-heading font-bold text-lg"
              />
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium mb-1.5 block">Evidence (optional)</Label>
            <label className="flex items-center gap-2 p-3 border border-dashed border-border rounded-xl cursor-pointer hover:border-primary transition-colors">
              <ImageIcon className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {evidenceFile ? evidenceFile.name : match?.evidence_url ? "Replace existing evidence" : "Upload screenshot or photo"}
              </span>
              <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            </label>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!score1 || !score2 || submitting}
            className="w-full h-11 rounded-xl font-heading font-semibold"
          >
            {uploading ? "Uploading evidence..." : submitting ? "Submitting..." : isEdit ? "Save Changes" : "Submit Score"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}