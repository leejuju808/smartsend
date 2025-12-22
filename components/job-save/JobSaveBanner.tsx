// Block 22073 — SmartSend Roofing Job Save Engine v1
// Job Save Banner Component
// Displays when a job is at risk and needs immediate attention

"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, X, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JobSaveRecoveryModal } from "./JobSaveRecoveryModal";

interface JobSaveEvent {
  id: string;
  event_type: string;
  severity: "low" | "medium" | "high" | "critical";
  reason: string | null;
  recovery_message_draft: string | null;
  created_at: string;
}

interface JobSaveBannerProps {
  leadId: string;
}

export function JobSaveBanner({ leadId }: JobSaveBannerProps) {
  const [saveEvent, setSaveEvent] = useState<JobSaveEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    async function fetchSaveEvent() {
      try {
        const res = await fetch(`/api/job-save/events?lead_id=${leadId}&status=active`);
        if (res.ok) {
          const data = await res.json();
          if (data.events && data.events.length > 0) {
            setSaveEvent(data.events[0]);
          }
        }
      } catch (error) {
        console.error("Error fetching job save event:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchSaveEvent();
  }, [leadId]);

  const handleDismiss = async () => {
    if (!saveEvent) return;
    
    try {
      const res = await fetch(`/api/job-save/events/${saveEvent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed" }),
      });
      
      if (res.ok) {
        setDismissed(true);
      }
    } catch (error) {
      console.error("Error dismissing save event:", error);
    }
  };

  if (loading || dismissed || !saveEvent) {
    return null;
  }

  const severityColors = {
    critical: "bg-red-600 border-red-500 text-red-50",
    high: "bg-red-500/90 border-red-400 text-red-50",
    medium: "bg-orange-500/80 border-orange-400 text-orange-50",
    low: "bg-yellow-500/70 border-yellow-400 text-yellow-50",
  };

  const severityLabels = {
    critical: "Critical",
    high: "High Risk",
    medium: "At Risk",
    low: "Low Risk",
  };

  return (
    <>
      <div
        className={`p-4 rounded-xl border ${severityColors[saveEvent.severity]} animate-pulse`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h2 className="text-lg font-bold mb-1">
                ⚠️ Job At Risk — {severityLabels[saveEvent.severity]}
              </h2>
              <p className="text-sm opacity-90 mb-3">
                SmartSend detected declining health and momentum. Take action now to save this job.
              </p>
              {saveEvent.reason && (
                <p className="text-xs opacity-75 mb-3">{saveEvent.reason}</p>
              )}
              <div className="flex gap-2">
                <Button
                  onClick={() => setModalOpen(true)}
                  className="bg-white text-red-600 hover:bg-red-50"
                  size="sm"
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  View Recovery Plan
                </Button>
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="text-white hover:bg-white/20 h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {saveEvent && (
        <JobSaveRecoveryModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          saveEvent={saveEvent}
          leadId={leadId}
        />
      )}
    </>
  );
}









































