const STEPS = ["Basics", "Play Style", "Availability", "Preferences"];

export default function ProfileProgressBar({ activeStep }) {
  return (
    <div className="w-full">
      <div className="flex justify-between mb-2">
        {STEPS.map((step, i) => (
          <span
            key={step}
            className={`text-[10px] font-medium transition-colors ${
              i <= activeStep ? "text-primary" : "text-muted-foreground"
            }`}
          >
            {step}
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              i <= activeStep ? "bg-primary" : "bg-secondary"
            }`}
          />
        ))}
      </div>
    </div>
  );
}