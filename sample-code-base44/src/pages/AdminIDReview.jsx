import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, ShieldCheck, CheckCircle, XCircle, Clock,
  ExternalLink, ChevronDown, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";

const STATUS_STYLES = {
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  approved: "bg-green-100 text-green-700 border-green-200",
  rejected: "bg-red-100 text-red-600 border-red-200",
};

export default function AdminIDReview() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [rejectReason, setRejectReason] = useState({});
  const [expanded, setExpanded] = useState({});
  const [actionLoading, setActionLoading] = useState({});

  useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      if (u?.role !== "admin") navigate("/");
    }).catch(() => navigate("/"));
  }, []);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["id-verification-requests"],
    queryFn: () => base44.entities.IDVerification.list("-created_date", 100),
    enabled: !!user && user.role === "admin",
  });

  const handleApprove = async (req) => {
    setActionLoading((p) => ({ ...p, [req.id]: true }));
    await base44.entities.IDVerification.update(req.id, {
      status: "approved",
      reviewed_by: user.email,
      reviewed_at: new Date().toISOString(),
    });
    // Update the user record
    const users = await base44.entities.User.list();
    const target = users.find((u) => u.email === req.user_email);
    if (target) {
      await base44.entities.User.update(target.id, {
        id_verified: true,
        id_verification_status: "approved",
      });
    }
    queryClient.invalidateQueries(["id-verification-requests"]);
    setActionLoading((p) => ({ ...p, [req.id]: false }));
    toast({ title: `${req.user_name} approved ✓`, description: "Blue tick granted" });
  };

  const handleReject = async (req) => {
    const reason = rejectReason[req.id] || "Did not meet requirements";
    setActionLoading((p) => ({ ...p, [req.id]: true }));
    await base44.entities.IDVerification.update(req.id, {
      status: "rejected",
      admin_notes: reason,
      reviewed_by: user.email,
      reviewed_at: new Date().toISOString(),
    });
    const users = await base44.entities.User.list();
    const target = users.find((u) => u.email === req.user_email);
    if (target) {
      await base44.entities.User.update(target.id, {
        id_verified: false,
        id_verification_status: "rejected",
        id_verification_rejected_reason: reason,
      });
    }
    queryClient.invalidateQueries(["id-verification-requests"]);
    setActionLoading((p) => ({ ...p, [req.id]: false }));
    toast({ title: "Rejected", description: `Notified ${req.user_name}`, variant: "destructive" });
  };

  const pending = requests.filter((r) => r.status === "pending");
  const reviewed = requests.filter((r) => r.status !== "pending");

  if (!user || user.role !== "admin") return null;

  return (
    <div className="max-w-lg mx-auto pb-10">
      <div className="px-5 pt-6 pb-4 sticky top-0 bg-background/95 backdrop-blur z-10 border-b border-border">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-muted-foreground mb-3">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <h1 className="font-heading font-bold text-xl flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-blue-500" /> ID Verification Review
        </h1>
        <p className="text-muted-foreground text-xs mt-0.5">{pending.length} pending · {reviewed.length} reviewed</p>
      </div>

      <div className="px-5 pt-4 space-y-3">

        {isLoading && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-card rounded-2xl animate-pulse" />)}
          </div>
        )}

        {!isLoading && pending.length === 0 && (
          <div className="text-center py-12">
            <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
            <p className="font-heading font-semibold">All caught up!</p>
            <p className="text-muted-foreground text-sm">No pending ID reviews</p>
          </div>
        )}

        {pending.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-heading font-semibold text-sm text-amber-600 flex items-center gap-1.5">
              <Clock className="w-4 h-4" /> Pending ({pending.length})
            </h2>
            {pending.map((req) => (
              <ReviewCard
                key={req.id}
                req={req}
                expanded={expanded[req.id]}
                onToggle={() => setExpanded((p) => ({ ...p, [req.id]: !p[req.id] }))}
                rejectReason={rejectReason[req.id] || ""}
                onRejectReason={(v) => setRejectReason((p) => ({ ...p, [req.id]: v }))}
                onApprove={() => handleApprove(req)}
                onReject={() => handleReject(req)}
                loading={actionLoading[req.id]}
              />
            ))}
          </div>
        )}

        {reviewed.length > 0 && (
          <div className="space-y-3 mt-4">
            <h2 className="font-heading font-semibold text-sm text-muted-foreground">
              Previously Reviewed ({reviewed.length})
            </h2>
            {reviewed.map((req) => (
              <div key={req.id} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-sm">{req.user_name}</p>
                  <p className="text-muted-foreground text-xs">{req.user_email}</p>
                  {req.reviewed_at && (
                    <p className="text-xs text-muted-foreground">{format(new Date(req.reviewed_at), "MMM d, yyyy")}</p>
                  )}
                </div>
                <Badge variant="outline" className={`text-[11px] ${STATUS_STYLES[req.status] || ""}`}>
                  {req.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewCard({ req, expanded, onToggle, rejectReason, onRejectReason, onApprove, onReject, loading }) {
  return (
    <div className="bg-card rounded-2xl border border-amber-200 overflow-hidden">
      <button className="w-full flex items-center justify-between p-4" onClick={onToggle}>
        <div className="text-left">
          <p className="font-semibold text-sm">{req.user_name}</p>
          <p className="text-muted-foreground text-xs">{req.user_email} · {req.id_type?.replace("_", " ")}</p>
          {req.created_date && (
            <p className="text-xs text-muted-foreground">{format(new Date(req.created_date), "MMM d, yyyy · h:mm a")}</p>
          )}
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
          {/* Document images */}
          <div className="grid grid-cols-2 gap-2">
            {req.id_front_url && (
              <DocImage label="Front" url={req.id_front_url} />
            )}
            {req.id_back_url && (
              <DocImage label="Back" url={req.id_back_url} />
            )}
            {req.selfie_url && (
              <DocImage label="Selfie w/ ID" url={req.selfie_url} />
            )}
          </div>

          {/* Approve */}
          <Button
            className="w-full h-10 rounded-xl gap-2"
            onClick={onApprove}
            disabled={loading}
          >
            <ShieldCheck className="w-4 h-4" /> Approve — Grant Blue Tick
          </Button>

          {/* Reject */}
          <div className="space-y-2">
            <Input
              placeholder="Rejection reason (optional)"
              value={rejectReason}
              onChange={(e) => onRejectReason(e.target.value)}
              className="rounded-xl text-sm"
            />
            <Button
              variant="outline"
              className="w-full h-10 rounded-xl gap-2 text-destructive border-destructive/30"
              onClick={onReject}
              disabled={loading}
            >
              <XCircle className="w-4 h-4" /> Reject
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function DocImage({ label, url }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <a href={url} target="_blank" rel="noopener noreferrer">
        <div className="relative rounded-xl overflow-hidden border border-border bg-muted h-28">
          <img src={url} alt={label} className="w-full h-full object-cover" />
          <div className="absolute inset-0 flex items-end justify-end p-1">
            <ExternalLink className="w-3 h-3 text-white drop-shadow" />
          </div>
        </div>
      </a>
    </div>
  );
}