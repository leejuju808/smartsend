"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { 
  Wrench, 
  Home, 
  AlertTriangle, 
  CloudRain, 
  Shield, 
  Droplets,
  Search,
  HelpCircle,
  X
} from "lucide-react"

export type JobType = 
  | "roof_repair"
  | "roof_replacement"
  | "emergency_leak_repair"
  | "storm_damage"
  | "insurance_driven_claim"
  | "gutter_repair_replacement"
  | "inspection_only"
  | "general_question"
  | "not_roofing"

export type SeverityLevel = "low" | "medium" | "high"
export type InsuranceVsRetail = "insurance" | "retail" | "unclear"

interface JobTypeBadgesProps {
  jobType?: JobType | null
  jobSubcategory?: string | null
  severityLevel?: SeverityLevel | null
  insuranceVsRetail?: InsuranceVsRetail | null
  className?: string
  size?: "sm" | "md" | "lg"
}

const JOB_TYPE_CONFIG: Record<JobType, { label: string; icon: typeof Wrench; color: string; bgColor: string }> = {
  roof_repair: {
    label: "Repair",
    icon: Wrench,
    color: "text-blue-700",
    bgColor: "bg-blue-50 border-blue-200"
  },
  roof_replacement: {
    label: "Replacement",
    icon: Home,
    color: "text-purple-700",
    bgColor: "bg-purple-50 border-purple-200"
  },
  emergency_leak_repair: {
    label: "Emergency Leak",
    icon: AlertTriangle,
    color: "text-red-700",
    bgColor: "bg-red-50 border-red-200"
  },
  storm_damage: {
    label: "Storm Damage",
    icon: CloudRain,
    color: "text-yellow-700",
    bgColor: "bg-yellow-50 border-yellow-200"
  },
  insurance_driven_claim: {
    label: "Insurance Claim",
    icon: Shield,
    color: "text-indigo-700",
    bgColor: "bg-indigo-50 border-indigo-200"
  },
  gutter_repair_replacement: {
    label: "Gutter",
    icon: Droplets,
    color: "text-cyan-700",
    bgColor: "bg-cyan-50 border-cyan-200"
  },
  inspection_only: {
    label: "Inspection",
    icon: Search,
    color: "text-gray-700",
    bgColor: "bg-gray-50 border-gray-200"
  },
  general_question: {
    label: "Question",
    icon: HelpCircle,
    color: "text-gray-600",
    bgColor: "bg-gray-50 border-gray-200"
  },
  not_roofing: {
    label: "Not Roofing",
    icon: X,
    color: "text-gray-500",
    bgColor: "bg-gray-50 border-gray-200"
  }
}

const SEVERITY_CONFIG: Record<SeverityLevel, { label: string; color: string }> = {
  low: { label: "Low", color: "text-green-700 bg-green-50 border-green-200" },
  medium: { label: "Medium", color: "text-yellow-700 bg-yellow-50 border-yellow-200" },
  high: { label: "High", color: "text-red-700 bg-red-50 border-red-200" }
}

const INSURANCE_CONFIG: Record<InsuranceVsRetail, { label: string; color: string }> = {
  insurance: { label: "Insurance", color: "text-purple-700 bg-purple-50 border-purple-200" },
  retail: { label: "Retail", color: "text-blue-700 bg-blue-50 border-blue-200" },
  unclear: { label: "Unclear", color: "text-gray-600 bg-gray-50 border-gray-200" }
}

const SIZE_CLASSES = {
  sm: "text-[10px] px-1.5 py-0.5",
  md: "text-xs px-2 py-1",
  lg: "text-sm px-2.5 py-1.5"
}

export function JobTypeBadges({
  jobType,
  jobSubcategory,
  severityLevel,
  insuranceVsRetail,
  className,
  size = "sm"
}: JobTypeBadgesProps) {
  if (!jobType) return null

  const jobConfig = JOB_TYPE_CONFIG[jobType]
  const JobIcon = jobConfig.icon

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {/* Primary Job Type Badge */}
      <Badge
        variant="outline"
        className={cn(
          SIZE_CLASSES[size],
          jobConfig.bgColor,
          jobConfig.color,
          "border font-medium flex items-center gap-1"
        )}
      >
        <JobIcon className="h-3 w-3" />
        {jobConfig.label}
      </Badge>

      {/* Subcategory Badge */}
      {jobSubcategory && (
        <Badge
          variant="outline"
          className={cn(
            SIZE_CLASSES[size],
            "bg-gray-50 border-gray-200 text-gray-700 font-normal"
          )}
        >
          {formatSubcategory(jobSubcategory)}
        </Badge>
      )}

      {/* Severity Badge */}
      {severityLevel && (
        <Badge
          variant="outline"
          className={cn(
            SIZE_CLASSES[size],
            SEVERITY_CONFIG[severityLevel].color,
            "border font-medium"
          )}
        >
          {SEVERITY_CONFIG[severityLevel].label}
        </Badge>
      )}

      {/* Insurance vs Retail Badge */}
      {insuranceVsRetail && insuranceVsRetail !== "unclear" && (
        <Badge
          variant="outline"
          className={cn(
            SIZE_CLASSES[size],
            INSURANCE_CONFIG[insuranceVsRetail].color,
            "border font-medium"
          )}
        >
          {INSURANCE_CONFIG[insuranceVsRetail].label}
        </Badge>
      )}
    </div>
  )
}

function formatSubcategory(subcategory: string): string {
  // Convert snake_case to Title Case
  return subcategory
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

// Compact version for thread lists
export function JobTypeBadgeCompact({
  jobType,
  severityLevel,
  insuranceVsRetail,
  className
}: {
  jobType?: JobType | null
  severityLevel?: SeverityLevel | null
  insuranceVsRetail?: InsuranceVsRetail | null
  className?: string
}) {
  if (!jobType) return null

  const jobConfig = JOB_TYPE_CONFIG[jobType]
  const JobIcon = jobConfig.icon

  // Determine color based on priority
  let badgeColor = jobConfig.bgColor
  if (severityLevel === "high") {
    badgeColor = "bg-red-50 border-red-200 text-red-700"
  } else if (insuranceVsRetail === "insurance") {
    badgeColor = "bg-purple-50 border-purple-200 text-purple-700"
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] px-1.5 py-0 border font-medium flex items-center gap-1",
        badgeColor,
        className
      )}
      title={`${jobConfig.label}${severityLevel ? ` - ${severityLevel} severity` : ""}${insuranceVsRetail && insuranceVsRetail !== "unclear" ? ` - ${INSURANCE_CONFIG[insuranceVsRetail].label}` : ""}`}
    >
      <JobIcon className="h-3 w-3" />
      {jobConfig.label}
    </Badge>
  )
}



















































