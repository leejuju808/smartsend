"use client";

// Briefing Status Badge Component
// Shows readiness status with color coding

interface BriefingStatusBadgeProps {
  readiness: string;
}

export function BriefingStatusBadge({ readiness }: BriefingStatusBadgeProps) {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case "ready":
        return {
          label: "Ready",
          className: "bg-green-600/20 text-green-400 border-green-600/40",
        };
      case "blocked_no_materials":
        return {
          label: "Not Ready",
          className: "bg-red-600/20 text-red-400 border-red-600/40",
        };
      case "material_delayed":
        return {
          label: "Delayed",
          className: "bg-red-600/20 text-red-400 border-red-600/40",
        };
      case "cutting_it_close":
        return {
          label: "Cutting Close",
          className: "bg-yellow-600/20 text-yellow-400 border-yellow-600/40",
        };
      default:
        return {
          label: "Unknown",
          className: "bg-zinc-600/20 text-zinc-400 border-zinc-600/40",
        };
    }
  };

  const config = getStatusConfig(readiness);

  return (
    <span
      className={`px-2 py-1 rounded text-xs font-medium border ${config.className}`}
    >
      {config.label}
    </span>
  );
}







































