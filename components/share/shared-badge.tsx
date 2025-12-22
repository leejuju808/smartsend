"use client";

import { Badge } from "@/components/ui/Badge";

interface SharedBadgeProps {
  className?: string;
}

export function SharedBadge({ className }: SharedBadgeProps) {
  return (
    <Badge variant="secondary" className={className}>
      Shared
    </Badge>
  );
}










