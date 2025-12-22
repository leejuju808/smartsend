/**
 * Inbox Icon System
 * Standardized icons for inbox components
 * All icons use 2px stroke width for consistency
 */

import React from "react";
import { 
  Flame, 
  Sun, 
  RotateCcw, 
  X, 
  Phone, 
  CheckCircle2, 
  ClipboardList, 
  FileText, 
  Star, 
  Settings,
  Mail,
  Clock,
  ThermometerSun
} from "lucide-react";
import { cn } from "@/lib/utils";

interface IconProps {
  size?: 16 | 20 | 24;
  className?: string;
}

const iconSizes = {
  16: "h-4 w-4",
  20: "h-5 w-5",
  24: "h-6 w-6",
};

// Hot Lead Icon
export function HotLeadIcon({ size = 16, className }: IconProps) {
  return (
    <Flame 
      className={cn(iconSizes[size], className)} 
      strokeWidth={2}
      fill="currentColor"
    />
  );
}

// Warm Lead Icon
export function WarmLeadIcon({ size = 16, className }: IconProps) {
  return (
    <Sun 
      className={cn(iconSizes[size], className)} 
      strokeWidth={2}
      fill="currentColor"
    />
  );
}

// Follow-Up Icon
export function FollowUpIcon({ size = 16, className }: IconProps) {
  return (
    <RotateCcw 
      className={cn(iconSizes[size], className)} 
      strokeWidth={2}
    />
  );
}

// Dead Lead Icon
export function DeadLeadIcon({ size = 16, className }: IconProps) {
  return (
    <X 
      className={cn(iconSizes[size], className)} 
      strokeWidth={2}
    />
  );
}

// Call Icon
export function CallIcon({ size = 16, className }: IconProps) {
  return (
    <Phone 
      className={cn(iconSizes[size], className)} 
      strokeWidth={2}
    />
  );
}

// Booked Icon
export function BookedIcon({ size = 16, className }: IconProps) {
  return (
    <CheckCircle2 
      className={cn(iconSizes[size], className)} 
      strokeWidth={2}
    />
  );
}

// Task Icon
export function TaskIcon({ size = 16, className }: IconProps) {
  return (
    <ClipboardList 
      className={cn(iconSizes[size], className)} 
      strokeWidth={2}
    />
  );
}

// Estimate Icon
export function EstimateIcon({ size = 16, className }: IconProps) {
  return (
    <FileText 
      className={cn(iconSizes[size], className)} 
      strokeWidth={2}
    />
  );
}

// CRM Add Icon
export function CRMIcon({ size = 16, className }: IconProps) {
  return (
    <Star 
      className={cn(iconSizes[size], className)} 
      strokeWidth={2}
      fill="currentColor"
    />
  );
}

// System Messages Icon
export function SystemIcon({ size = 16, className }: IconProps) {
  return (
    <Settings 
      className={cn(iconSizes[size], className)} 
      strokeWidth={2}
    />
  );
}

// Mail/Envelope Icon
export function MailIcon({ size = 16, className }: IconProps) {
  return (
    <Mail 
      className={cn(iconSizes[size], className)} 
      strokeWidth={2}
    />
  );
}

// Clock Icon
export function ClockIcon({ size = 16, className }: IconProps) {
  return (
    <Clock 
      className={cn(iconSizes[size], className)} 
      strokeWidth={2}
    />
  );
}

// Thermometer Icon (for empty states)
export function ThermometerIcon({ size = 16, className }: IconProps) {
  return (
    <ThermometerSun 
      className={cn(iconSizes[size], className)} 
      strokeWidth={2}
    />
  );
}

// Helper function to get icon by intent
export function getIntentIcon(intent: string | null, size: 16 | 20 | 24 = 16) {
  if (!intent) return null;
  
  const intentLower = intent.toLowerCase();
  
  switch (intentLower) {
    case "hot":
      return <HotLeadIcon size={size} />;
    case "warm":
      return <WarmLeadIcon size={size} />;
    case "follow_up":
    case "follow-up":
      return <FollowUpIcon size={size} />;
    case "dead":
    case "cold":
      return <DeadLeadIcon size={size} />;
    default:
      return null;
  }
}



















































