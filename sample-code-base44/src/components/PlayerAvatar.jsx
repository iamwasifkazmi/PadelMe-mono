import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function PlayerAvatar({ name, avatarUrl, size = "md" }) {
  const sizes = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-14 h-14 text-lg",
    xl: "w-20 h-20 text-2xl",
  };

  const initials = (name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Avatar className={`${sizes[size]} bg-primary/10`}>
      <AvatarImage src={avatarUrl} alt={name} />
      <AvatarFallback className="bg-primary/10 text-primary font-heading font-semibold">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}