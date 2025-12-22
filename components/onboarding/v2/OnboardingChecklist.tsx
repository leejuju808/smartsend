"use client";

// Block 16800 — SmartSend Trials & Onboarding v2
// Gamified onboarding checklist component (top-right corner)

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Lock, Sparkles } from "lucide-react";
import Link from "next/link";
import { Progress } from "@/components/ui/progress";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  href?: string;
  locked?: boolean;
}

export function OnboardingChecklistV2() {
  const [checklist, setChecklist] = useState<{
    percent: number;
    items: ChecklistItem[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadChecklist() {
      try {
        const res = await fetch("/api/onboarding/v2/checklist");
        if (res.ok) {
          const data = await res.json();
          setChecklist(data.checklist);
        }
      } catch (error) {
        console.error("Error loading checklist:", error);
      } finally {
        setLoading(false);
      }
    }

    loadChecklist();

    // Refresh every 30 seconds
    const interval = setInterval(loadChecklist, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading || !checklist) {
    return null;
  }

  // Hide if completed
  if (checklist.percent >= 100) {
    return null;
  }

  const itemHrefs: Record<string, string> = {
    company_setup: "/onboarding/v2/step-1",
    email_connected: "/onboarding/v2/step-2",
    import_list: "/onboarding/v2/step-3",
    send_campaign: "/onboarding/v2/step-4",
    book_appointment: "/onboarding/v2/step-5",
    complete_pipeline: "/dashboard/pipeline",
  };

  return (
    <Card className="fixed top-4 right-4 z-50 w-80 rounded-xl border bg-card shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-semibold">
              Your SmartSend Setup
            </CardTitle>
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {checklist.percent}%
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="space-y-1.5">
          {checklist.items.map((item) => {
            const href = item.href || itemHrefs[item.id];
            const content = (
              <div
                className={`flex items-center gap-2.5 p-2 rounded-lg transition-colors ${
                  item.completed
                    ? "opacity-60"
                    : item.locked
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-muted/50 cursor-pointer"
                }`}
              >
                {item.completed ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                ) : item.locked ? (
                  <Lock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
                <span
                  className={`text-xs ${
                    item.completed
                      ? "line-through text-muted-foreground"
                      : "text-foreground"
                  }`}
                >
                  {item.label}
                </span>
              </div>
            );

            if (href && !item.locked && !item.completed) {
              return (
                <Link key={item.id} href={href}>
                  {content}
                </Link>
              );
            }

            return <div key={item.id}>{content}</div>;
          })}
        </div>

        <div className="pt-2 border-t">
          <Progress value={checklist.percent} className="h-1.5" />
        </div>
      </CardContent>
    </Card>
  );
}





















































