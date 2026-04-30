import { useNavigate } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Reusable invite button. Pass event info as props.
 * eventType: "match" | "competition" | "app"
 */
export default function InviteButton({
  eventType = "match",
  eventId,
  eventName,
  eventDate,
  eventTime,
  eventLocation,
  variant = "outline",
  className = "",
  size = "default",
}) {
  const navigate = useNavigate();

  const handleInvite = () => {
    const params = new URLSearchParams({
      type: eventType,
      ...(eventId ? { id: eventId } : {}),
      ...(eventName ? { name: eventName } : {}),
      ...(eventDate ? { date: eventDate } : {}),
      ...(eventTime ? { time: eventTime } : {}),
      ...(eventLocation ? { location: eventLocation } : {}),
    });
    navigate(`/invite?${params.toString()}`);
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={`gap-2 rounded-xl ${className}`}
      onClick={handleInvite}
    >
      <UserPlus className="w-4 h-4" />
      Invite Players
    </Button>
  );
}