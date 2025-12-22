"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export type CallOutcome =
  | "booked_estimate"
  | "left_voicemail"
  | "no_answer"
  | "wrong_number"
  | "needs_follow_up"
  | "not_interested"
  | "job_closed_won"
  | "job_lost";

interface CallOutcomeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  threadId: string;
  onOutcomeSelected: (outcome: CallOutcome) => void;
}

const OUTCOME_OPTIONS: Array<{
  value: CallOutcome;
  label: string;
  description: string;
  color: string;
}> = [
  {
    value: "booked_estimate",
    label: "Booked Estimate",
    description: "Homeowner agreed to schedule an estimate",
    color: "bg-green-50 border-green-200 text-green-800 hover:bg-green-100",
  },
  {
    value: "left_voicemail",
    label: "Left Voicemail",
    description: "Left a voicemail message",
    color: "bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100",
  },
  {
    value: "no_answer",
    label: "No Answer",
    description: "Call went unanswered",
    color: "bg-yellow-50 border-yellow-200 text-yellow-800 hover:bg-yellow-100",
  },
  {
    value: "wrong_number",
    label: "Wrong Number",
    description: "Reached wrong person or disconnected number",
    color: "bg-gray-50 border-gray-200 text-gray-800 hover:bg-gray-100",
  },
  {
    value: "needs_follow_up",
    label: "Needs Follow-Up",
    description: "Need to address a question or provide more info",
    color: "bg-orange-50 border-orange-200 text-orange-800 hover:bg-orange-100",
  },
  {
    value: "not_interested",
    label: "Not Interested",
    description: "Homeowner declined the service",
    color: "bg-red-50 border-red-200 text-red-800 hover:bg-red-100",
  },
  {
    value: "job_closed_won",
    label: "Job Closed (Won)",
    description: "Successfully closed the job",
    color: "bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100",
  },
  {
    value: "job_lost",
    label: "Job Lost",
    description: "Lost the job to competitor or other reason",
    color: "bg-red-50 border-red-200 text-red-800 hover:bg-red-100",
  },
];

export function CallOutcomeModal({
  open,
  onOpenChange,
  contactId,
  threadId,
  onOutcomeSelected,
}: CallOutcomeModalProps) {
  const [selectedOutcome, setSelectedOutcome] = useState<CallOutcome | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!selectedOutcome) return;

    setSaving(true);
    try {
      const response = await fetch("/api/inbox/call-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contactId,
          thread_id: threadId,
          call_type: "completed",
          outcome: selectedOutcome,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to log call outcome");
      }

      onOutcomeSelected(selectedOutcome);
      onOpenChange(false);
      setSelectedOutcome(null);
    } catch (err) {
      console.error("Failed to log call outcome", err);
      alert("Failed to save call outcome. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>How did the call go?</DialogTitle>
          <DialogDescription>
            Select the outcome to update the CRM and create follow-up tasks.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 mt-4">
          {OUTCOME_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setSelectedOutcome(option.value)}
              className={`p-4 rounded-lg border-2 text-left transition-colors ${
                selectedOutcome === option.value
                  ? option.color + " border-2 border-primary"
                  : option.color
              }`}
            >
              <div className="font-semibold">{option.label}</div>
              <div className="text-sm mt-1 opacity-80">{option.description}</div>
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!selectedOutcome || saving}>
            {saving ? "Saving..." : "Save Outcome"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



















































