"use client";

import { useState } from "react";
import { LeadTimelineHeader } from "@/components/leads/lead-timeline-header";
import { TimelineFeed } from "@/components/leads/timeline-feed";
import { AiInsightsCard } from "./components/AiInsightsCard";

interface TimelineTabProps {
  leadId: string;
  lead?: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    email: string;
    city?: string | null;
    intent_label?: string | null;
    tags?: string[] | null;
  };
}

/**
 * Block 11200 — SmartSend Lead Timeline v1
 * Main timeline tab component
 */
export function TimelineTab({ leadId, lead }: TimelineTabProps) {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const handleStopFollowUp = async () => {
    if (!confirm("Are you sure you want to stop auto follow-ups for this homeowner?")) {
      return;
    }

    try {
      const response = await fetch(`/api/leads/${leadId}/stop-followup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Manual action" }),
      });

      if (!response.ok) {
        throw new Error("Failed to stop follow-ups");
      }

      handleRefresh();
    } catch (error) {
      console.error("Error stopping follow-ups:", error);
      alert("Failed to stop follow-ups. Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Block 26590 — AI Lead Insights Card */}
      <AiInsightsCard leadId={leadId} />

      {/* Header */}
      {lead && (
        <LeadTimelineHeader
          lead={lead}
          onNoteAdded={handleRefresh}
          onStopFollowUp={handleStopFollowUp}
        />
      )}

      {/* Timeline Feed */}
      <TimelineFeed key={refreshKey} leadId={leadId} onRefresh={handleRefresh} />
    </div>
  );
}



