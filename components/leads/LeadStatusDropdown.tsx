"use client";

import * as React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LeadStatusBadge, RoofingLeadStatus } from "./LeadStatusBadge";
import { Loader2 } from "lucide-react";

interface LeadStatusDropdownProps {
  leadId: string;
  currentStatus: RoofingLeadStatus;
  onStatusChange?: (status: RoofingLeadStatus) => void;
  className?: string;
  disabled?: boolean;
}

const statusOptions: Array<{ value: RoofingLeadStatus; label: string }> = [
  { value: "NEW", label: "New" },
  { value: "HOT", label: "Hot" },
  { value: "WARM", label: "Warm" },
  { value: "FOLLOW_UP", label: "Follow Up" },
  { value: "NOT_INTERESTED", label: "Not Interested" },
  { value: "OUT_OF_SCOPE", label: "Out of Scope" },
];

export function LeadStatusDropdown({
  leadId,
  currentStatus,
  onStatusChange,
  className,
  disabled = false,
}: LeadStatusDropdownProps) {
  const [loading, setLoading] = React.useState(false);
  const [status, setStatus] = React.useState<RoofingLeadStatus>(currentStatus);

  React.useEffect(() => {
    setStatus(currentStatus);
  }, [currentStatus]);

  const handleStatusChange = async (newStatus: string) => {
    const typedStatus = newStatus as RoofingLeadStatus;
    setLoading(true);
    
    try {
      const response = await fetch(`/api/leads/${leadId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: typedStatus }),
      });

      if (!response.ok) {
        throw new Error("Failed to update status");
      }

      setStatus(typedStatus);
      onStatusChange?.(typedStatus);
    } catch (error) {
      console.error("Failed to update lead status:", error);
      // Revert on error
      setStatus(currentStatus);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={className}>
      <Select
        value={status || "NEW"}
        onValueChange={handleStatusChange}
        disabled={disabled || loading}
      >
        <SelectTrigger className="h-8 w-[160px] text-xs">
          {loading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Updating...</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <LeadStatusBadge status={status} size="sm" />
            </div>
          )}
        </SelectTrigger>
        <SelectContent>
          {statusOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <div className="flex items-center gap-2">
                <LeadStatusBadge status={option.value} size="sm" />
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}























































