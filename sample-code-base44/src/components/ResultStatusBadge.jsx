import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle, AlertTriangle, Shield, Send, Calendar } from "lucide-react";

const config = {
  scheduled: { label: "Scheduled", icon: Calendar, className: "bg-gray-100 text-gray-600 border-gray-200" },
  check_in_open: { label: "Check-In Open", icon: Clock, className: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  in_progress: { label: "In Progress", icon: Send, className: "bg-blue-100 text-blue-700 border-blue-200" },
  awaiting_score: { label: "Awaiting Score", icon: Send, className: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  pending_validation: { label: "Pending Validation", icon: Clock, className: "bg-amber-100 text-amber-700 border-amber-200" },
  confirmed: { label: "Confirmed", icon: CheckCircle, className: "bg-green-100 text-green-700 border-green-200" },
  disputed: { label: "Disputed", icon: AlertTriangle, className: "bg-red-100 text-red-700 border-red-200" },
  admin_review: { label: "Admin Review", icon: Shield, className: "bg-purple-100 text-purple-700 border-purple-200" },
};

export default function ResultStatusBadge({ status, size = "sm" }) {
  const c = config[status] || config.scheduled;
  const Icon = c.icon;
  return (
    <Badge
      variant="outline"
      className={`gap-1 font-medium ${c.className} ${size === "lg" ? "text-sm px-3 py-1" : "text-[11px] px-2 py-0"}`}
    >
      <Icon className={size === "lg" ? "w-3.5 h-3.5" : "w-3 h-3"} />
      {c.label}
    </Badge>
  );
}