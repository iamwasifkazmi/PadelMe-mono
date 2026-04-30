import { useNavigate } from "react-router-dom";
import PlayerAvatar from "../PlayerAvatar";

export default function FriendStrip({ friends }) {
  const navigate = useNavigate();

  if (!friends.length) return null;

  return (
    <div className="flex gap-3 px-5 overflow-x-auto pb-1 no-scrollbar">
      {friends.map((friend) => (
        <button
          key={friend.id}
          onClick={() => navigate(`/player/${friend.id}`)}
          className="flex-shrink-0 flex flex-col items-center gap-1 w-16"
        >
          <div className="relative">
            <PlayerAvatar name={friend.full_name} avatarUrl={friend.photo_url} size="md" />
            {/* Online indicator placeholder */}
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-card" />
          </div>
          <p className="text-[10px] font-medium text-center leading-tight truncate w-full">
            {(friend.name || friend.full_name)?.split(" ")[0]}
          </p>
        </button>
      ))}
    </div>
  );
}