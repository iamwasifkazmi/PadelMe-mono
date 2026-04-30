import PlayerAvatar from "./PlayerAvatar";
import { format } from "date-fns";

export default function ChatBubble({ message, isOwn }) {
  return (
    <div className={`flex gap-2 ${isOwn ? "flex-row-reverse" : ""}`}>
      {!isOwn && (
        <PlayerAvatar name={message.sender_name} size="sm" />
      )}
      <div className={`max-w-[75%] ${isOwn ? "items-end" : "items-start"}`}>
        {!isOwn && (
          <span className="text-[11px] text-muted-foreground font-medium ml-1 mb-0.5 block">
            {message.sender_name}
          </span>
        )}
        <div
          className={`px-3.5 py-2 rounded-2xl text-sm ${
            isOwn
              ? "bg-primary text-primary-foreground rounded-br-md"
              : "bg-secondary text-secondary-foreground rounded-bl-md"
          }`}
        >
          {message.message}
        </div>
        <span className={`text-[10px] text-muted-foreground mt-0.5 block ${isOwn ? "text-right mr-1" : "ml-1"}`}>
          {message.created_date ? format(new Date(message.created_date), "h:mm a") : ""}
        </span>
      </div>
    </div>
  );
}