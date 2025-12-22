"use client";

interface SuppressedBadgeProps {
  suppressed?: {
    reason: string;
  } | null;
}

export function SuppressedBadge({ suppressed }: SuppressedBadgeProps) {
  if (!suppressed) return null;

  return (
    <div className="text-xs rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
      Sending disabled — recipient is <span className="font-medium">{suppressed.reason}</span>.
    </div>
  );
}





