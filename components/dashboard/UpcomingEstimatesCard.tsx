"use client";

import { useEffect, useState } from "react";
import { Calendar, Clock } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";

interface Estimate {
  id: string;
  lead_id: string;
  start_time: string;
  location: string | null;
  lead: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
  } | null;
}

export function UpcomingEstimatesCard() {
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEstimates() {
      try {
        const res = await fetch("/api/estimates/upcoming");
        if (res.ok) {
          const data = await res.json();
          setEstimates(data.estimates || []);
        }
      } catch (error) {
        console.error("Failed to fetch upcoming estimates:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchEstimates();
  }, []);

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="h-5 w-5 text-blue-600" />
          <h3 className="text-sm font-semibold">Estimates in next 3 days</h3>
        </div>
        <div className="text-sm text-muted-foreground">Loading...</div>
      </Card>
    );
  }

  const estimateCount = estimates.length;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-600" />
          <h3 className="text-sm font-semibold">Estimates in next 3 days</h3>
        </div>
        <span className="text-xs text-muted-foreground">{estimateCount}</span>
      </div>

      {estimateCount === 0 ? (
        <div className="text-sm text-muted-foreground py-4">
          No estimates scheduled
        </div>
      ) : (
        <div className="space-y-2">
          {estimates.slice(0, 5).map((estimate) => {
            const leadName =
              estimate.lead?.first_name && estimate.lead?.last_name
                ? `${estimate.lead.first_name} ${estimate.lead.last_name}`
                : estimate.lead?.email || "Unknown Lead";
            const startTime = new Date(estimate.start_time);
            const timeStr = startTime.toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            });

            return (
              <Link
                key={estimate.id}
                href={`/leads/${estimate.lead_id}`}
                className="block p-2 rounded-md hover:bg-muted transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{leadName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {timeStr}
                      </span>
                    </div>
                    {estimate.location && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {estimate.location}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
          {estimateCount > 5 && (
            <Link
              href="/leads?filter=upcoming_estimates"
              className="block text-xs text-blue-600 hover:underline pt-2"
            >
              View all {estimateCount} estimates →
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}














































