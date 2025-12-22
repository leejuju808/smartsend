// Block 22073 — SmartSend Roofing Job Save Engine v1
// Hook to check if a lead has an active job save event

"use client";

import { useState, useEffect } from "react";

interface JobSaveStatus {
  hasActiveSave: boolean;
  severity: "low" | "medium" | "high" | "critical" | null;
  eventId: string | null;
}

export function useJobSaveStatus(leadId: string | null): JobSaveStatus {
  const [status, setStatus] = useState<JobSaveStatus>({
    hasActiveSave: false,
    severity: null,
    eventId: null,
  });

  useEffect(() => {
    if (!leadId) {
      setStatus({ hasActiveSave: false, severity: null, eventId: null });
      return;
    }

    async function checkStatus() {
      try {
        const res = await fetch(`/api/job-save/events?lead_id=${leadId}&status=active`);
        if (res.ok) {
          const data = await res.json();
          if (data.events && data.events.length > 0) {
            const event = data.events[0];
            setStatus({
              hasActiveSave: true,
              severity: event.severity,
              eventId: event.id,
            });
          } else {
            setStatus({ hasActiveSave: false, severity: null, eventId: null });
          }
        }
      } catch (error) {
        console.error("Error checking job save status:", error);
        setStatus({ hasActiveSave: false, severity: null, eventId: null });
      }
    }

    checkStatus();
    
    // Poll every 30 seconds for updates
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, [leadId]);

  return status;
}









































