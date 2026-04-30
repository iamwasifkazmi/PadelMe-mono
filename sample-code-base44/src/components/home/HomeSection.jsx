import { Link } from "react-router-dom";

export default function HomeSection({ title, subtitle, link, extra, children }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between px-5 mb-3 gap-2">
        <div className="min-w-0">
          <h2 className="font-heading font-semibold text-base">{title}</h2>
          {subtitle && <p className="text-muted-foreground text-[11px]">{subtitle}</p>}
        </div>
        {extra || (link && (
          <Link to={link} className="text-primary text-xs font-medium whitespace-nowrap">See all →</Link>
        ))}
      </div>
      {children}
    </div>
  );
}