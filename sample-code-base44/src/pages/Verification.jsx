import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import {
  ArrowLeft, Camera, ShieldCheck, Upload, CheckCircle,
  Clock, XCircle, ChevronRight, AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { motion } from "framer-motion";
import PlayerAvatar from "../components/PlayerAvatar";

const ID_TYPES = [
  { value: "passport", label: "Passport" },
  { value: "drivers_license", label: "Driver's Licence" },
  { value: "national_id", label: "National ID Card" },
];

export default function Verification() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [step, setStep] = useState("overview"); // overview | photo | id_type | id_upload | submitted
  const [idType, setIdType] = useState("passport");
  const [frontFile, setFrontFile] = useState(null);
  const [backFile, setBackFile] = useState(null);
  const [selfieFile, setSelfieFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [existingRequest, setExistingRequest] = useState(null);

  useEffect(() => {
    const init = async () => {
      const u = await base44.auth.me();
      setUser(u);
      // Check for existing pending ID request
      const reqs = await base44.entities.IDVerification.filter(
        { user_email: u.email },
        "-created_date",
        1
      );
      if (reqs.length) setExistingRequest(reqs[0]);
    };
    init();
  }, []);

  // ── Photo upload ───────────────────────────────────────────────────────────
  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    await base44.auth.updateMe({ avatar_url: file_url, photo_verified: true });
    const updated = await base44.auth.me();
    setUser(updated);
    setUploading(false);
    toast({ title: "Photo verified! ✓", description: "Your green badge is now live" });
    setStep("overview");
  };

  // ── ID submission ──────────────────────────────────────────────────────────
  const handleIDSubmit = async () => {
    if (!frontFile) {
      toast({ title: "Please upload the front of your ID", variant: "destructive" });
      return;
    }
    if (!selfieFile) {
      toast({ title: "Please upload a selfie holding your ID", variant: "destructive" });
      return;
    }
    setUploading(true);

    const [frontRes, backRes, selfieRes] = await Promise.all([
      base44.integrations.Core.UploadFile({ file: frontFile }),
      backFile ? base44.integrations.Core.UploadFile({ file: backFile }) : Promise.resolve({ file_url: null }),
      base44.integrations.Core.UploadFile({ file: selfieFile }),
    ]);

    await base44.entities.IDVerification.create({
      user_email: user.email,
      user_name: user.full_name,
      id_type: idType,
      id_front_url: frontRes.file_url,
      id_back_url: backRes.file_url || null,
      selfie_url: selfieRes.file_url,
      status: "pending",
    });

    await base44.auth.updateMe({ id_verification_status: "pending" });
    const updated = await base44.auth.me();
    setUser(updated);
    setUploading(false);
    setStep("submitted");
    toast({ title: "ID submitted!", description: "We'll review within 24–48 hours" });
  };

  if (!user) return (
    <div className="flex items-center justify-center h-96">
      <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-lg mx-auto pb-10">
      <div className="px-5 pt-6 pb-2">
        <button onClick={() => step === "overview" ? navigate(-1) : setStep("overview")}
          className="flex items-center gap-1 text-muted-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <h1 className="font-heading font-bold text-xl">Verification</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Build trust with other players</p>
      </div>

      <div className="px-5 mt-2 space-y-4">

        {step === "overview" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">

            {/* Current status */}
            <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
              <div className="flex items-center gap-3">
                <PlayerAvatar name={user.full_name} avatarUrl={user.avatar_url} size="lg" />
                <div>
                  <p className="font-heading font-semibold">{user.full_name}</p>
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    {user.photo_verified && (
                      <Badge className="text-[10px] gap-1 bg-green-100 text-green-700 border-green-200 border">
                        <CheckCircle className="w-3 h-3" /> Photo Verified
                      </Badge>
                    )}
                    {user.id_verified && (
                      <Badge className="text-[10px] gap-1 bg-blue-100 text-blue-700 border-blue-200 border">
                        <ShieldCheck className="w-3 h-3" /> ID Verified
                      </Badge>
                    )}
                    {!user.photo_verified && !user.id_verified && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">Unverified</Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Level 1 — Photo */}
            <VerificationLevel
              icon={<Camera className="w-5 h-5 text-green-600" />}
              title="Level 1 · Photo Verified"
              subtitle="Upload a profile photo to get a green badge"
              iconBg="bg-green-100"
              done={user.photo_verified}
              doneLabel="You have a profile photo ✓"
              actionLabel="Upload Photo"
              onAction={() => setStep("photo")}
            />

            {/* Level 2 — ID */}
            <VerificationLevel
              icon={<ShieldCheck className="w-5 h-5 text-blue-600" />}
              title="Level 2 · ID Verified (Blue Tick)"
              subtitle="Submit a government ID for admin review. Unlocks priority matchmaking."
              iconBg="bg-blue-100"
              done={user.id_verified}
              pending={user.id_verification_status === "pending"}
              rejected={user.id_verification_status === "rejected"}
              rejectedReason={user.id_verification_rejected_reason}
              doneLabel="ID verified — blue tick active ✓"
              pendingLabel="Under review (24–48h)"
              actionLabel="Submit ID"
              onAction={() => setStep("id_type")}
            />

            {/* Info panel */}
            <div className="bg-muted/50 rounded-2xl p-4 text-sm text-muted-foreground space-y-1.5">
              <p className="font-medium text-foreground text-sm">Why verify?</p>
              <p>✓ Verified players are shown first in match discovery</p>
              <p>✓ Some leagues & tournaments require ID verification</p>
              <p>✓ Green badge = profile photo uploaded</p>
              <p>✓ Blue tick = government ID approved by admin</p>
              <p className="text-xs mt-2">Your ID documents are stored securely and only reviewed by MatchPoint admins.</p>
            </div>
          </motion.div>
        )}

        {step === "photo" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="bg-card rounded-2xl border border-border p-6 text-center space-y-4">
              <Camera className="w-12 h-12 text-green-500 mx-auto" />
              <div>
                <h2 className="font-heading font-semibold text-lg">Upload Profile Photo</h2>
                <p className="text-muted-foreground text-sm mt-1">A clear photo of your face earns you the green badge</p>
              </div>
              {user.avatar_url && (
                <PlayerAvatar name={user.full_name} avatarUrl={user.avatar_url} size="xl" />
              )}
              <label className="block">
                <Button disabled={uploading} className="w-full h-12 rounded-xl gap-2" asChild>
                  <span>
                    {uploading ? (
                      <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    ) : (
                      <><Upload className="w-4 h-4" /> Choose Photo</>
                    )}
                  </span>
                </Button>
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              </label>
            </div>
          </motion.div>
        )}

        {step === "id_type" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <p className="text-sm text-muted-foreground">Select the type of ID you'll submit:</p>
            <div className="space-y-2">
              {ID_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setIdType(t.value)}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                    idType === t.value
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border bg-card text-foreground"
                  }`}
                >
                  <span className="font-medium">{t.label}</span>
                  {idType === t.value && <CheckCircle className="w-4 h-4" />}
                </button>
              ))}
            </div>
            <Button className="w-full h-12 rounded-xl font-heading font-semibold" onClick={() => setStep("id_upload")}>
              Continue <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </motion.div>
        )}

        {step === "id_upload" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>Your documents are encrypted and only visible to MatchPoint admins. We never share your data.</p>
            </div>

            <FileUploadBox
              label="Front of ID *"
              file={frontFile}
              onFile={setFrontFile}
            />
            <FileUploadBox
              label="Back of ID (optional)"
              file={backFile}
              onFile={setBackFile}
            />
            <FileUploadBox
              label="Selfie holding your ID *"
              file={selfieFile}
              onFile={setSelfieFile}
            />

            <Button
              className="w-full h-12 rounded-xl font-heading font-semibold shadow-lg shadow-primary/20"
              onClick={handleIDSubmit}
              disabled={uploading || !frontFile || !selfieFile}
            >
              {uploading ? (
                <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : "Submit for Review"}
            </Button>
          </motion.div>
        )}

        {step === "submitted" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center text-center py-10 space-y-4"
          >
            <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center">
              <Clock className="w-10 h-10 text-blue-500" />
            </div>
            <h2 className="font-heading font-bold text-xl">Under Review</h2>
            <p className="text-muted-foreground text-sm max-w-xs">
              We'll review your ID within 24–48 hours and notify you when your blue tick is ready.
            </p>
            <Button variant="outline" className="rounded-xl" onClick={() => navigate("/profile")}>
              Back to Profile
            </Button>
          </motion.div>
        )}

      </div>
    </div>
  );
}

function VerificationLevel({ icon, iconBg, title, subtitle, done, pending, rejected, rejectedReason, doneLabel, pendingLabel, actionLabel, onAction }) {
  return (
    <div className={`bg-card rounded-2xl border p-4 space-y-3 ${done ? "border-green-200" : pending ? "border-amber-200" : rejected ? "border-red-200" : "border-border"}`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-heading font-semibold text-sm">{title}</p>
          <p className="text-muted-foreground text-xs mt-0.5">{subtitle}</p>
        </div>
        {done && <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />}
        {pending && <Clock className="w-5 h-5 text-amber-500 flex-shrink-0" />}
        {rejected && <XCircle className="w-5 h-5 text-destructive flex-shrink-0" />}
      </div>

      {done && <p className="text-xs text-green-600 font-medium">{doneLabel}</p>}
      {pending && <p className="text-xs text-amber-600 font-medium">{pendingLabel}</p>}
      {rejected && (
        <div className="space-y-2">
          <p className="text-xs text-destructive font-medium">Rejected{rejectedReason ? `: ${rejectedReason}` : ""}</p>
          <Button size="sm" variant="outline" className="rounded-lg h-8 text-xs" onClick={onAction}>
            Resubmit
          </Button>
        </div>
      )}
      {!done && !pending && !rejected && (
        <Button size="sm" variant="outline" className="rounded-lg h-8 text-xs gap-1" onClick={onAction}>
          {actionLabel} <ChevronRight className="w-3 h-3" />
        </Button>
      )}
    </div>
  );
}

function FileUploadBox({ label, file, onFile }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      <label className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-xl h-20 cursor-pointer transition-colors ${
        file ? "border-primary bg-primary/5 text-primary" : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40"
      }`}>
        {file ? (
          <><CheckCircle className="w-5 h-5" /><span className="text-sm font-medium truncate max-w-[200px]">{file.name}</span></>
        ) : (
          <><Upload className="w-4 h-4" /><span className="text-sm">Tap to upload</span></>
        )}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files[0] || null)} />
      </label>
    </div>
  );
}