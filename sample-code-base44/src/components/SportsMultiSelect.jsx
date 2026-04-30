export default function SportsMultiSelect({ value = [], onChange }) {
  const sports = ["Padel", "Tennis", "Pickleball"];

  const toggle = (sport) => {
    const newValue = value.includes(sport)
      ? value.filter((s) => s !== sport)
      : [...value, sport];
    if (newValue.length > 0) {
      onChange(newValue);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {sports.map((sport) => (
        <button
          key={sport}
          onClick={() => toggle(sport)}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all border-2 ${
            value.includes(sport)
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground hover:border-primary/30"
          }`}
        >
          {sport === "Padel" && "🎾 "}
          {sport === "Tennis" && "🎾 "}
          {sport === "Pickleball" && "🏓 "}
          {sport}
        </button>
      ))}
    </div>
  );
}