"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface PipelineStageSelectorProps {
  threadId: string;
  currentStage: string;
  onUpdate?: () => void;
}

const PIPELINE_STAGES = [
  { value: "new_lead", label: "New Lead" },
  { value: "contacted", label: "Contacted" },
  { value: "estimate_scheduled", label: "Estimate Scheduled" },
  { value: "estimate_completed", label: "Estimate Completed" },
  { value: "pending_decision", label: "Pending Decision" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

export function PipelineStageSelector({
  threadId,
  currentStage,
  onUpdate,
}: PipelineStageSelectorProps) {
  const [loading, setLoading] = useState(false);

  const handleChange = async (newStage: string) => {
    if (newStage === currentStage) return;

    setLoading(true);
    try {
      const response = await fetch(
        `/api/inbox/revenue/threads/${threadId}/pipeline`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ pipeline_stage: newStage }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update pipeline stage");
      }

      toast.success("Pipeline stage updated");
      onUpdate?.();
    } catch (error) {
      console.error("Error updating pipeline stage:", error);
      toast.error("Failed to update pipeline stage");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Select
      value={currentStage}
      onValueChange={handleChange}
      disabled={loading}
    >
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Select stage" />
      </SelectTrigger>
      <SelectContent>
        {PIPELINE_STAGES.map((stage) => (
          <SelectItem key={stage.value} value={stage.value}>
            {stage.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}



















































