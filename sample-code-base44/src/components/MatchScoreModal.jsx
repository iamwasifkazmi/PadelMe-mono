import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";
import { ImageIcon } from "lucide-react";

export default function MatchScoreModal({ open, onClose, match, currentUserEmail, currentUserName, onSubmitted }) {
  const isDoubles = match?.match_type === "doubles" || match?.match_type === "mixed_doubles";
  const numSets = match?.num_sets || 1;
  const scoringMode = match?.scoring_mode || "simple";
  const isSetBased = scoringMode === "sets";

  const teamALabel = isDoubles ? "Team A" : (match?.players?.[0] === currentUserEmail ? "You" : "Player 1");
  const teamBLabel = isDoubles ? "Team B" : "Opponent";

  const initialSets = Array.from({ length: numSets }, () => ({ a: "", b: "" }));
  const [sets, setSets] = useState(initialSets);
  const [simpleA, setSimpleA] = useState("");
  const [simpleB, setSimpleB] = useState("");
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const isEdit = match?.submitted_by === currentUserEmail && match?.status === "pending_validation";

  const updateSet = (i, side, val) => {
    setSets((prev) => prev.map((s, idx) => idx === i ? { ...s, [side]: val } : s));
  };

  const getScoreStrings = () => {
    if (isSetBased) {
      return {
        scoreA: sets.map((s) => s.a).join(","),
        scoreB: sets.map((s) => s.b).join(","),
      };
    }
    return { scoreA: simpleA, scoreB: simpleB };
  };

  const isValid = () => {
    if (isSetBased) return sets.every((s) => s.a !== "" && s.b !== "");
    return simpleA !== "" && simpleB !== "";
  };

  const handleSubmit = async () => {
    if (!isValid()) return;
    setSubmitting(true);

    let evidenceUrl = match?.evidence_url || null;
    if (evidenceFile) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: evidenceFile });
      evidenceUrl = file_url;
    }

    const { scoreA, scoreB } = getScoreStrings();

    // Determine winner
    let winnerTeam = null;
    let winnerEmail = null;
    if (isSetBased) {
      const setsWonA = sets.filter((s) => Number(s.a) > Number(s.b)).length;
      const setsWonB = sets.filter((s) => Number(s.b) > Number(s.a)).length;
      winnerTeam = setsWonA > setsWonB ? "team_a" : "team_b";
    } else {
      winnerTeam = Number(simpleA) > Number(simpleB) ? "team_a" : "team_b";
    }

    if (!isDoubles) {
      const teamA = match?.team_a || [];
      const teamB = match?.team_b || [];
      winnerEmail = winnerTeam === "team_a" ? (teamA[0] || match?.players?.[0]) : (teamB[0] || match?.players?.[1]);
    }

    await base44.entities.Match.update(match.id, {
      submitted_score_a: scoreA,
      submitted_score_b: scoreB,
      submitted_by: currentUserEmail,
      status: "pending_validation",
      evidence_url: evidenceUrl,
    });

    onSubmitted?.();
    onClose();
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm mx-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {isEdit ? "Edit Score" : "Submit Match Score"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {match?.scoring_mode === "sets" && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              Best of {match.num_sets} sets · First to {match.games_per_set} games
            </p>
          )}

          {isSetBased ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center text-xs font-medium text-muted-foreground">
                <span className="text-left">Set</span>
                <span>{teamALabel}</span>
                <span>{teamBLabel}</span>
              </div>
              {sets.map((s, i) => (
                <div key={i} className="grid grid-cols-3 gap-2 items-center">
                  <span className="text-sm text-muted-foreground font-medium">Set {i + 1}</span>
                  <Input
                    value={s.a}
                    onChange={(e) => updateSet(i, "a", e.target.value)}
                    placeholder="0"
                    className="rounded-xl h-11 text-center font-heading font-bold text-lg"
                  />
                  <Input
                    value={s.b}
                    onChange={(e) => updateSet(i, "b", e.target.value)}
                    placeholder="0"
                    className="rounded-xl h-11 text-center font-heading font-bold text-lg"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium mb-1.5 block">{teamALabel}</Label>
                <Input
                  value={simpleA}
                  onChange={(e) => setSimpleA(e.target.value)}
                  placeholder="e.g. 6"
                  className="rounded-xl h-11 text-center font-heading font-bold text-lg"
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block">{teamBLabel}</Label>
                <Input
                  value={simpleB}
                  onChange={(e) => setSimpleB(e.target.value)}
                  placeholder="e.g. 4"
                  className="rounded-xl h-11 text-center font-heading font-bold text-lg"
                />
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 p-3 border border-dashed border-border rounded-xl cursor-pointer hover:border-primary transition-colors">
            <ImageIcon className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {evidenceFile ? evidenceFile.name : "Upload screenshot (optional)"}
            </span>
            <input type="file" accept="image/*" onChange={(e) => setEvidenceFile(e.target.files[0])} className="hidden" />
          </label>

          <p className="text-xs text-muted-foreground">
            The opposing captain will need to confirm this result before the match is completed.
          </p>

          <Button
            onClick={handleSubmit}
            disabled={!isValid() || submitting}
            className="w-full h-11 rounded-xl font-heading font-semibold"
          >
            {submitting ? "Submitting..." : isEdit ? "Save Changes" : "Submit Score"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}