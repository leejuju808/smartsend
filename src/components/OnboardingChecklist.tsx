"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ProgressBar from "./ui/ProgressBar";

const STEPS = [
  { key: "import_contacts", label: "Import your first contacts", href: "/dashboard/contacts/import" },
  { key: "send_campaign",   label: "Send your first campaign",   href: "/dashboard/campaigns/new" },
  { key: "upgrade",         label: "Upgrade to Pro",             href: "/dashboard/billing" },
] as const;

type StepsState = Record<(typeof STEPS)[number]["key"], boolean> | Record<string, boolean>;

export default function OnboardingChecklist() {
  const [done, setDone] = useState<StepsState>({} as StepsState);

  useEffect(() => {
    fetch("/api/onboarding/status")
      .then(r => r.json())
      .then(j => setDone(j.steps || {}))
      .catch(() => setDone({} as StepsState));
  }, []);

  const { total, completed, pct } = useMemo(() => {
    const total = STEPS.length;
    const completed = STEPS.reduce((n, s) => n + (done[s.key] ? 1 : 0), 0);
    const pct = Math.round((completed / total) * 100);
    return { total, completed, pct };
  }, [done]);

  return (
    <div className="border rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Get started</h3>
        <span className="text-sm text-gray-600">{completed}/{total} complete</span>
      </div>

      {/* Progress bar */}
      <ProgressBar value={pct} />

      {/* Steps */}
      <ul className="space-y-2">
        {STEPS.map(s => {
          const isDone = !!done[s.key];
          return (
            <li key={s.key} className="flex items-center gap-2">
              <span aria-hidden className="text-lg">{isDone ? "✅" : "⬜️"}</span>
              <Link
                href={s.href}
                className={`hover:underline ${isDone ? "line-through text-gray-400" : ""}`}
              >
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
} 