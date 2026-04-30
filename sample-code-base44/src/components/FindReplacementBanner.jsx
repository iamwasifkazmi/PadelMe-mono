/**
 * FindReplacementBanner — shown to the organiser after a player withdraws.
 * Offers quick actions: invite players, share match link, or browse the find-match page.
 */
import { useNavigate } from "react-router-dom";
import { UserPlus, Share2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function FindReplacementBanner({ match }) {
  const navigate = useNavigate();

  const handleShare = async () => {
    const url = `${window.location.origin}/match/${match.id}`;
    if (navigator.share) {
      await navigator.share({ title: match.title, url });
    } else {
      await navigator.clipboard.writeText(url);
    }
  };

  const handleInvite = () => {
    const params = new URLSearchParams({
      type: "match",
      id: match.id,
      name: match.title,
      ...(match.date ? { date: match.date } : {}),
      ...(match.time ? { time: match.time } : {}),
      ...(match.location_name ? { location: match.location_name } : {}),
    });
    navigate(`/invite?${params.toString()}`);
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
          <Search className="w-4 h-4 text-amber-600" />
        </div>
        <div>
          <p className="font-heading font-semibold text-sm text-amber-800">A player has withdrawn</p>
          <p className="text-xs text-amber-700 mt-0.5">Find a replacement to fill the open slot.</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          className="h-9 rounded-xl text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
          onClick={handleInvite}
        >
          <UserPlus className="w-3.5 h-3.5" /> Invite Replacement
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-9 rounded-xl text-xs gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-100"
          onClick={handleShare}
        >
          <Share2 className="w-3.5 h-3.5" /> Share Match Link
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-9 rounded-xl text-xs gap-1.5 text-amber-700 hover:bg-amber-100"
          onClick={() => navigate("/players")}
        >
          Browse Players
        </Button>
      </div>
    </div>
  );
}