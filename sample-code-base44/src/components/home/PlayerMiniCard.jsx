import { Star } from "lucide-react";
import PlayerAvatar from "../PlayerAvatar";
import FriendButton from "../FriendButton";

export default function PlayerMiniCard({ player, currentUser, friendRequests, isFriend, onView }) {
  return (
    <div
      className="flex-shrink-0 w-36 bg-card border border-border rounded-2xl p-3 text-center cursor-pointer hover:border-primary/40 transition-all active:scale-[0.98]"
      onClick={onView}
    >
      <div className="flex justify-center mb-2">
        <div className="relative">
          <PlayerAvatar name={player.full_name} avatarUrl={player.photo_url} size="lg" />
          {(player.photo_verified || player.id_verified) && (
            <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
              <span className="text-[8px] text-white">✓</span>
            </span>
          )}
        </div>
      </div>
      <p className="font-heading font-semibold text-xs truncate">{player.name || player.full_name}</p>
      {player.location && (
        <p className="text-[10px] text-muted-foreground truncate mt-0.5">📍 {player.location}</p>
      )}
      <div className="mt-1 flex flex-col items-center gap-0.5">
        {player.skill_label && (
          <span className="text-[10px] capitalize text-muted-foreground font-medium">{player.skill_label}</span>
        )}
        {player.average_rating > 0 && (
          <div className="flex items-center gap-0.5">
            <Star className="w-2.5 h-2.5 fill-accent text-accent" />
            <span className="text-[10px] font-medium">{player.average_rating.toFixed(1)}</span>
          </div>
        )}
      </div>
      <div className="mt-2" onClick={(e) => e.stopPropagation()}>
        {isFriend ? (
          <span className="text-[10px] text-primary font-semibold">✓ Friend</span>
        ) : (
          <FriendButton currentUser={currentUser} targetUser={player} friendRequests={friendRequests} />
        )}
      </div>
    </div>
  );
}