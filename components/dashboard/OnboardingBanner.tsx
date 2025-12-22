// Block 15600 — Roofer Fast-Start Onboarding v1
// Dashboard Banner Until Onboarding Is Done

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function OnboardingBanner() {
  const [state, setState] = useState<null | {
    profile_done: boolean;
    contacts_done: boolean;
    first_campaign_done: boolean;
  }>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/onboarding");
        if (res.ok) {
          const data = await res.json();
          setState(data.onboarding_state);
        }
      } catch (error) {
        console.error("Error loading onboarding state:", error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading || !state) return null;

  const doneCount =
    (state.profile_done ? 1 : 0) +
    (state.contacts_done ? 1 : 0) +
    (state.first_campaign_done ? 1 : 0);

  if (doneCount === 3) return null;

  return (
    <div className="mb-4 border rounded-2xl p-3 bg-slate-50 flex items-center justify-between">
      <div>
        <div className="text-xs font-semibold">
          Finish getting SmartSend set up
        </div>
        <div className="text-[11px] text-gray-600">
          {doneCount}/3 steps completed. Set up profile, import contacts, and launch your first campaign.
        </div>
      </div>
      <Link
        href="/onboarding"
        className="text-[11px] px-3 py-1.5 rounded-xl bg-black text-white hover:bg-gray-800"
      >
        Continue setup
      </Link>
    </div>
  );
}



























































