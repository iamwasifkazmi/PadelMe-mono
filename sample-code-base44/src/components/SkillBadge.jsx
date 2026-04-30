import { Badge } from "@/components/ui/badge";

const config = {
  beginner: { label: "Beginner", className: "bg-green-100 text-green-700 border-green-200" },
  intermediate: { label: "Intermediate", className: "bg-blue-100 text-blue-700 border-blue-200" },
  advanced: { label: "Advanced", className: "bg-purple-100 text-purple-700 border-purple-200" },
  any: { label: "Any Level", className: "bg-gray-100 text-gray-700 border-gray-200" },
};

export default function SkillBadge({ level }) {
  const { label, className } = config[level] || config.any;
  return (
    <Badge variant="outline" className={`text-xs font-medium ${className}`}>
      {label}
    </Badge>
  );
}