import { CheckCircle, ShieldCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Shows verification badges.
 * size: "sm" | "md" | "lg"
 * showPhoto: show green camera/check badge (photo verified)
 * showID: show blue tick (ID verified)
 */
export default function VerificationBadge({ photoVerified, idVerified, size = "sm", className = "" }) {
  const sizes = {
    sm: "w-3.5 h-3.5",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };
  const s = sizes[size] || sizes.sm;

  if (!photoVerified && !idVerified) return null;

  return (
    <TooltipProvider>
      <span className={`inline-flex items-center gap-0.5 ${className}`}>
        {idVerified && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <ShieldCheck className={`${s} text-blue-500 fill-blue-500`} />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">ID Verified ✓</p>
            </TooltipContent>
          </Tooltip>
        )}
        {photoVerified && !idVerified && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <CheckCircle className={`${s} text-green-500 fill-green-500`} />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">Photo Verified ✓</p>
            </TooltipContent>
          </Tooltip>
        )}
      </span>
    </TooltipProvider>
  );
}