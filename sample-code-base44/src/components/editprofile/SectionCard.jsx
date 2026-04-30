export default function SectionCard({ emoji, title, subtitle, children, highlight }) {
  return (
    <div className={`rounded-2xl border p-5 space-y-4 ${highlight ? "border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5" : "border-border bg-card"}`}>
      <div>
        <h2 className="font-heading font-bold text-base flex items-center gap-2">
          <span>{emoji}</span> {title}
        </h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}