"use client";

// Block 16800 — SmartSend Trials & Onboarding v2
// Milestone tracker component (shows the 6 wins)

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Trophy, Sparkles } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface Milestone {
  id: string;
  label: string;
  description: string;
  achieved: boolean;
  achievedAt?: string;
}

const MILESTONES: Omit<Milestone, "achieved" | "achievedAt">[] = [
  {
    id: "win_1_email_connected",
    label: "Email Connected",
    description: "Instant credibility",
  },
  {
    id: "win_2_list_imported",
    label: "First List Imported",
    description: "Pipeline fills up",
  },
  {
    id: "win_3_campaign_sent",
    label: "First Campaign Sent",
    description: "You feel power",
  },
  {
    id: "win_4_email_opened",
    label: "First Homeowner Opens Email",
    description: "Progress",
  },
  {
    id: "win_5_first_reply",
    label: "First Reply",
    description: "You trust the system",
  },
  {
    id: "win_6_first_booking",
    label: "First Booking",
    description: "This is when you decide to PAY",
  },
];

export function MilestoneTracker() {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadMilestones() {
      try {
        const res = await fetch("/api/onboarding/v2/milestones");
        if (res.ok) {
          const data = await res.json();
          const wins = data.wins || {};
          
          const milestoneData = MILESTONES.map((m) => ({
            ...m,
            achieved: wins[m.id] || false,
          }));

          // Merge with achieved milestones for timestamps
          if (data.milestones) {
            data.milestones.forEach((m: any) => {
              const idx = milestoneData.findIndex((md) => md.id === m.milestone_type);
              if (idx >= 0) {
                milestoneData[idx].achieved = true;
                milestoneData[idx].achievedAt = m.achieved_at;
              }
            });
          }

          setMilestones(milestoneData);
        }
      } catch (error) {
        console.error("Error loading milestones:", error);
      } finally {
        setLoading(false);
      }
    }

    loadMilestones();

    // Refresh every 30 seconds
    const interval = setInterval(loadMilestones, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return null;
  }

  const achievedCount = milestones.filter((m) => m.achieved).length;
  const totalCount = milestones.length;

  return (
    <Card className="rounded-xl border bg-card shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-500" />
            <CardTitle className="text-base font-semibold">
              Your First 48-Hour Wins
            </CardTitle>
          </div>
          <span className="text-xs text-muted-foreground">
            {achievedCount}/{totalCount}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {milestones.map((milestone, index) => (
          <div
            key={milestone.id}
            className={`flex items-start gap-3 p-2 rounded-lg transition-colors ${
              milestone.achieved
                ? "bg-green-50 dark:bg-green-950/20"
                : "hover:bg-muted/50"
            }`}
          >
            {milestone.achieved ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm font-medium ${
                    milestone.achieved
                      ? "text-green-700 dark:text-green-400"
                      : "text-foreground"
                  }`}
                >
                  {milestone.label}
                </span>
                {milestone.achieved && (
                  <Sparkles className="h-3 w-3 text-yellow-500" />
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {milestone.description}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}





















































