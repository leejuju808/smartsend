// Block 16500 — Visual Indicators & Color-Coded Badges
"use client";

import { Badge } from "@/components/ui/badge";
import { 
  Flame, 
  Shield, 
  CloudLightning, 
  DollarSign, 
  Calendar,
  XCircle
} from "lucide-react";

interface VisualBadgeProps {
  type: "hot" | "insurance" | "storm" | "quote" | "appointment" | "not_interested";
  label: string;
  size?: "sm" | "md" | "lg";
}

export function VisualBadge({ type, label, size = "md" }: VisualBadgeProps) {
  const config = {
    hot: {
      icon: <Flame className="h-3 w-3" />,
      className: "bg-red-500 text-white border-red-600",
    },
    insurance: {
      icon: <Shield className="h-3 w-3" />,
      className: "bg-purple-500 text-white border-purple-600",
    },
    storm: {
      icon: <CloudLightning className="h-3 w-3" />,
      className: "bg-blue-500 text-white border-blue-600",
    },
    quote: {
      icon: <DollarSign className="h-3 w-3" />,
      className: "bg-green-500 text-white border-green-600",
    },
    appointment: {
      icon: <Calendar className="h-3 w-3" />,
      className: "bg-teal-500 text-white border-teal-600",
    },
    not_interested: {
      icon: <XCircle className="h-3 w-3" />,
      className: "bg-gray-400 text-white border-gray-500",
    },
  };

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-1",
    lg: "text-base px-3 py-1.5",
  };

  const badgeConfig = config[type];

  return (
    <Badge
      className={`${badgeConfig.className} ${sizeClasses[size]} flex items-center gap-1.5 font-semibold`}
    >
      {badgeConfig.icon}
      {label}
    </Badge>
  );
}

// Helper function to determine badge type from contact data
export function getContactBadges(contact: any, heatScore: any, insuranceMeta: any, weatherEvents: any[]) {
  const badges: Array<{ type: VisualBadgeProps["type"]; label: string }> = [];

  // HOT badge
  if (heatScore?.heat_level === "hot" || heatScore?.heat_score >= 70) {
    badges.push({ type: "hot", label: "HOT" });
  }

  // Insurance badge
  if (insuranceMeta?.has_insurance_claim || insuranceMeta?.storm_related) {
    badges.push({ type: "insurance", label: "Insurance" });
  }

  // Storm badge
  if (weatherEvents && weatherEvents.length > 0) {
    badges.push({ type: "storm", label: "Storm" });
  }

  // Quote badge
  if (contact.estimated_job_value || contact.estimated_value_min) {
    badges.push({ type: "quote", label: "Quote" });
  }

  // Appointment badge
  if (contact.next_appointment_at) {
    badges.push({ type: "appointment", label: "Appointment" });
  }

  // Not Interested badge
  if (contact.status === "Not Interested") {
    badges.push({ type: "not_interested", label: "Not Interested" });
  }

  return badges;
}





















































