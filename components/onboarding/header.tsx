"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { OnboardingStepId, OnboardingStepMeta } from "@/lib/onboardingSteps";

type StatusResponse = {
  currentStep: OnboardingStepId;
  steps: OnboardingStepMeta[];
  currentIndex: number;
  total: number;
  completedCount: number;
  isLive: boolean;
};

export function OnboardingHeader() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/onboarding/status");
        if (!res.ok) throw new Error("Failed to load onboarding status");
        const data = (await res.json()) as StatusResponse;
        if (!cancelled) setStatus(data);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !status) {
    return (
      <div className="w-full border-b bg-muted/30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="h-4 w-40 rounded-full bg-muted animate-pulse" />
          <div className="h-2 w-24 rounded-full bg-muted animate-pulse" />
        </div>
      </div>
    );
  }

  const { steps, currentIndex, total, completedCount, isLive, currentStep } = status;
  const progressPercent = (completedCount / total) * 100;

  return (
    <div className="w-full border-b bg-background/80 backdrop-blur">
      <div className="max-w-5xl mx-auto px-4 py-3 space-y-3">
        {/* Top row: title + live badge */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {isLive ? "Onboarding complete" : "Onboarding in progress"}
            </span>
            {isLive ? (
              <Badge className="text-xs">You're live ⚡</Badge>
            ) : (
              <Badge variant="outline" className="text-xs">
                Step {Math.min(currentIndex + 1, total)} of {total}
              </Badge>
            )}
          </div>
          <div className="w-32 hidden sm:block">
            <Progress value={progressPercent} />
          </div>
        </div>

        {/* Step dots */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {steps.map((step, index) => {
            const isCompleted = completedCount > index;
            const isCurrent = currentIndex === index && !isLive;
            const isLast = index === steps.length - 1;

            return (
              <div
                key={step.id}
                className={cn(
                  "flex items-center gap-2",
                  !isLast && "flex-1 min-w-[0]"
                )}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium border",
                      isCompleted
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : isCurrent
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground border-muted-foreground/30"
                    )}
                  >
                    {isCompleted ? "✓" : index + 1}
                  </div>
                  <div className="flex flex-col">
                    <span
                      className={cn(
                        "text-xs font-medium",
                        isCurrent && "text-foreground",
                        isCompleted && "text-emerald-700"
                      )}
                    >
                      {step.label}
                    </span>
                    {step.description && (
                      <span className="text-[0.65rem] text-muted-foreground line-clamp-1">
                        {step.description}
                      </span>
                    )}
                  </div>
                </div>
                {!isLast && (
                  <div className="hidden sm:block flex-1 h-px bg-border/70" />
                )}
              </div>
            );
          })}
        </div>

        {/* Optional message bar when live */}
        {isLive && (
          <div className="text-xs text-muted-foreground">
            Your workspace is ready. Next up: create your first campaign and start sending.
          </div>
        )}

        {/* Optional: show current step helper */}
        {!isLive && (
          <div className="text-xs text-muted-foreground">
            You're on:{" "}
            <span className="font-medium">
              {steps.find((s) => s.id === currentStep)?.label ?? "Onboarding"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}










