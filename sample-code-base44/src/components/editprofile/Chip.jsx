export default function Chip({ label, selected, onClick, size = "md" }) {
  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-5 py-3 text-sm font-semibold",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full font-medium transition-all border ${sizes[size]} ${
        selected
          ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20"
          : "bg-background text-foreground border-border hover:border-primary/40"
      }`}
    >
      {label}
    </button>
  );
}