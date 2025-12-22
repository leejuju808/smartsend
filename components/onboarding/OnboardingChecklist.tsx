// components/onboarding/OnboardingChecklist.tsx
// Block 8780 — First-Time Roofing Onboarding Flow
"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";

type OnboardingState = {
  onboarding_email_connected: boolean;
  onboarding_contact_set: boolean;
  onboarding_campaign_created: boolean;
  onboarding_leads_imported: boolean;
  onboarding_campaign_queued: boolean;
};

type Step = {
  key: keyof OnboardingState;
  label: string;
  link: string;
};

const steps: Step[] = [
  {
    key: "onboarding_email_connected",
    label: "Connect your sending email",
    link: "/settings/sending",
  },
  {
    key: "onboarding_contact_set",
    label: "Set company info & booking link",
    link: "/settings/contact",
  },
  {
    key: "onboarding_campaign_created",
    label: "Create your first roofing campaign",
    link: "/campaigns/roofing-quickstart",
  },
  {
    key: "onboarding_leads_imported",
    label: "Import a list of homeowners",
    link: "/leads/import",
  },
  {
    key: "onboarding_campaign_queued",
    label: "Queue your campaign to start sending",
    link: "/campaigns",
  },
];

export function OnboardingChecklist() {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/onboarding/state", { cache: "no-store" });
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const data = await res.json();
        setState(data);
      } catch (e) {
        console.error("Onboarding state error:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const completedCount = useMemo(() => {
    if (!state) return 0;
    return steps.filter((s) => state[s.key]).length;
  }, [state]);

  const totalSteps = steps.length;
  const progressPercent = (completedCount / totalSteps) * 100;

  if (loading || !state) {
    return null;
  }

  // If all done -> hide banner
  if (completedCount === totalSteps) return null;

  return (
    <section className="rounded-2xl border border-emerald-600/60 bg-emerald-900/10 p-4 text-xs text-neutral-100">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[0.7rem] uppercase tracking-wide text-emerald-300">
            Get SmartSend live in 5 steps
          </div>
          <p className="text-[0.75rem] text-neutral-200">
            Follow this checklist to go from zero to a live roofing campaign
            filling your calendar.
          </p>
        </div>
        <div className="hidden md:flex flex-col items-end gap-1">
          <span className="text-[0.7rem] text-neutral-300">
            {completedCount} / {totalSteps} complete
          </span>
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full bg-emerald-400"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-5">
        {steps.map((step) => {
          const done = state[step.key];
          return (
            <Link
              key={step.key}
              href={step.link}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[0.7rem] ${
                done
                  ? "border-emerald-500/70 bg-emerald-900/40 text-emerald-100"
                  : "border-neutral-700 bg-neutral-950/80 text-neutral-100 hover:border-emerald-400/80"
              }`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[0.6rem] ${
                  done
                    ? "bg-emerald-500 text-neutral-950"
                    : "bg-neutral-800 text-neutral-300"
                }`}
              >
                {done ? "✓" : "•"}
              </span>
              <span>{step.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

