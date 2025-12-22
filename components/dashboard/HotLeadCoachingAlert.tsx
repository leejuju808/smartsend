// components/dashboard/HotLeadCoachingAlert.tsx
// Block 97000 — Instant Coaching Alert for Hot Leads
// Shows a banner when a hot lead is detected

"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { X, MessageSquare } from "lucide-react";
import Link from "next/link";

type HotLeadAlert = {
  lead_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
};

export function HotLeadCoachingAlert() {
  const [alert, setAlert] = useState<HotLeadAlert | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Poll for new hot leads every 10 seconds
    const interval = setInterval(async () => {
      try {
        const response = await fetch("/api/hot-leads?limit=1");
        if (response.ok) {
          const leads = await response.json();
          if (leads.length > 0) {
            const latestLead = leads[0];
            // Only show if it's very recent (within last 2 minutes)
            const leadTime = new Date(latestLead.last_updated).getTime();
            const now = Date.now();
            const twoMinutesAgo = now - 2 * 60 * 1000;

            if (leadTime > twoMinutesAgo && !dismissed) {
              setAlert({
                lead_id: latestLead.lead_id,
                email: latestLead.email,
                first_name: latestLead.first_name,
                last_name: latestLead.last_name,
                created_at: latestLead.last_updated,
              });
            }
          }
        }
      } catch (error) {
        console.error("Error checking for hot leads:", error);
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [dismissed]);

  if (!alert || dismissed) {
    return null;
  }

  const name = alert.first_name || alert.last_name
    ? `${alert.first_name || ""} ${alert.last_name || ""}`.trim()
    : alert.email.split("@")[0];

  return (
    <Alert className="border-red-500 bg-red-50 dark:bg-red-950/20 mb-4 animate-in slide-in-from-top">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <AlertTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
            🔥 You Have a HOT Lead
          </AlertTitle>
          <AlertDescription className="mt-2">
            <p className="font-medium text-sm">
              {name} just replied with high intent. Respond within 60 seconds — this is how roofers win jobs.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <Link href={`/dashboard/hot-leads/${alert.lead_id}`}>
                <Button size="sm" variant="default" className="gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Open Lead
                </Button>
              </Link>
            </div>
          </AlertDescription>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDismissed(true)}
          className="h-6 w-6 p-0"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </Alert>
  );
}


























