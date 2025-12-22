"use client";

import { useState, useCallback, useEffect } from "react";
import { createClientComponentClient } from "@supabase/ssr";
import { useLeadIntentStream, LeadIntentEvent } from "@/lib/realtime/useLeadIntentStream";

type IntentCounts = {
  HOT: number;
  WARM: number;
  FOLLOW_UP: number;
  NOT_INTERESTED: number;
};

const initialCounts: IntentCounts = {
  HOT: 0,
  WARM: 0,
  FOLLOW_UP: 0,
  NOT_INTERESTED: 0,
};

// Map database intent values to display categories
function mapIntentToCategory(intent: string): keyof IntentCounts | null {
  const upperIntent = intent.toUpperCase();
  
  // Map positive/interested intents to HOT
  if (upperIntent === "POSITIVE" || upperIntent === "INTERESTED" || upperIntent === "BOOKED") {
    return "HOT";
  }
  
  // Map neutral/question intents to WARM
  if (upperIntent === "NEUTRAL" || upperIntent === "AMBIGUOUS" || upperIntent === "NOT_SURE") {
    return "WARM";
  }
  
  // Map referral/forward to FOLLOW_UP
  if (upperIntent === "REFERRAL" || upperIntent === "WRONG_PERSON") {
    return "FOLLOW_UP";
  }
  
  // Map negative/unsubscribe to NOT_INTERESTED
  if (upperIntent === "NEGATIVE" || upperIntent === "NOT_INTERESTED" || upperIntent === "UNSUBSCRIBE") {
    return "NOT_INTERESTED";
  }
  
  // Default: don't count OOO, bounce, spam
  return null;
}

export function LeadIntentCounters({ workspaceId }: { workspaceId: string | null }) {
  const supabase = createClientComponentClient();
  const [intentCounts, setIntentCounts] = useState<IntentCounts>(initialCounts);
  const [accountId, setAccountId] = useState<string | null>(null);

  // Get account_id from workspace or user's team membership
  useEffect(() => {
    if (!workspaceId) return;

    async function fetchAccountId() {
      try {
        // Try to get account_id from workspace
        const { data: workspace } = await supabase
          .from("workspaces")
          .select("account_id")
          .eq("id", workspaceId)
          .maybeSingle();

        if (workspace?.account_id) {
          setAccountId(workspace.account_id);
          return;
        }

        // Fallback: get account_id from team_members via user
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: membership } = await supabase
            .from("team_members")
            .select("account_id")
            .eq("user_id", user.id)
            .limit(1)
            .maybeSingle();

          if (membership?.account_id) {
            setAccountId(membership.account_id);
            return;
          }

          // Another fallback: get account_id from account_members
          const { data: accountMember } = await supabase
            .from("account_members")
            .select("account_id")
            .eq("user_id", user.id)
            .eq("is_active", true)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

          if (accountMember?.account_id) {
            setAccountId(accountMember.account_id);
          }
        }
      } catch (error) {
        console.error("Failed to fetch account_id:", error);
      }
    }

    fetchAccountId();
  }, [workspaceId, supabase]);

  // Load initial counts from database
  useEffect(() => {
    if (!accountId) return;

    async function loadInitialCounts() {
      try {
        const { data: events } = await supabase
          .from("lead_intent_events")
          .select("intent")
          .eq("account_id", accountId);

        if (events) {
          const counts: IntentCounts = { ...initialCounts };
          events.forEach((event) => {
            const category = mapIntentToCategory(event.intent);
            if (category) {
              counts[category]++;
            }
          });
          setIntentCounts(counts);
        }
      } catch (error) {
        console.error("Failed to load initial intent counts:", error);
      }
    }

    loadInitialCounts();
  }, [accountId, supabase]);

  const handleEvent = useCallback((event: LeadIntentEvent) => {
    const category = mapIntentToCategory(event.intent);
    
    if (category) {
      setIntentCounts((prev) => ({
        ...prev,
        [category]: prev[category] + 1,
      }));

      // Optional: show a toast notification
      // toast.success(`New ${category} lead detected`);
    }
  }, []);

  useLeadIntentStream({
    supabase,
    accountId,
    onEvent: handleEvent,
  });

  if (!workspaceId || !accountId) {
    return null;
  }

  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="rounded-2xl border border-zinc-800 p-4">
        <p className="text-xs text-zinc-400">Hot Leads</p>
        <p className="mt-1 text-3xl font-semibold text-emerald-400">
          {intentCounts.HOT}
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800 p-4">
        <p className="text-xs text-zinc-400">Warm Leads</p>
        <p className="mt-1 text-3xl font-semibold text-amber-300">
          {intentCounts.WARM}
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800 p-4">
        <p className="text-xs text-zinc-400">Follow-Up Required</p>
        <p className="mt-1 text-3xl font-semibold text-sky-300">
          {intentCounts.FOLLOW_UP}
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800 p-4">
        <p className="text-xs text-zinc-400">Not Interested</p>
        <p className="mt-1 text-3xl font-semibold text-zinc-300">
          {intentCounts.NOT_INTERESTED}
        </p>
      </div>
    </section>
  );
}

