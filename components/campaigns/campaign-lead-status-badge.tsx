"use client";

import { Badge } from "@/components/ui/badge";

export type CampaignLeadStatus =
  | "active"
  | "completed"
  | "replied"
  | "unsubscribed"
  | "bounced"
  | "error"
  | null
  | undefined;

interface CampaignLeadStatusBadgeProps {
  status: CampaignLeadStatus;
  className?: string;
}

const statusLabelMap: Record<Exclude<CampaignLeadStatus, null | undefined>, string> =
  {
    active: "Active",
    completed: "Completed",
    replied: "Replied",
    unsubscribed: "Unsubscribed",
    bounced: "Bounced",
    error: "Error",
  };

export function CampaignLeadStatusBadge({
  status,
  className,
}: CampaignLeadStatusBadgeProps) {
  if (!status) {
    return (
      <Badge variant="outline" className={className}>
        Unknown
      </Badge>
    );
  }

  const label = statusLabelMap[status] ?? status;

  let variant: "default" | "outline" | "destructive" | "secondary" = "outline";

  switch (status) {
    case "active":
      variant = "default";
      break;
    case "replied":
      variant = "secondary";
      break;
    case "unsubscribed":
    case "bounced":
    case "error":
      variant = "destructive";
      break;
    case "completed":
      variant = "outline";
      break;
  }

  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}































































