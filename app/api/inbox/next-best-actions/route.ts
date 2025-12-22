// Block 20330 — Next Best Action API

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type NextBestAction = {
  key: string;
  label: string; // short text
  description: string; // 1–2 sentence explanation
  priority: "low" | "medium" | "high";
  suggested_channel: "call" | "email" | "sms" | "internal";
  due_in_days: number; // 0 = today
};

function daysSince(iso?: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const conversation_id = searchParams.get("conversation_id");

  if (!conversation_id) {
    return NextResponse.json(
      { error: "conversation_id required" },
      { status: 400 }
    );
  }

  // Load convo from profile view
  const { data: convo, error } = await supabase
    .from("inbox_conversation_profile_view")
    .select(
      `
      id,
      homeowner_name,
      homeowner_email,
      homeowner_phone,
      lead_stage,
      engagement_score,
      engagement_level,
      last_contact_at,
      is_insurance_claim,
      insurance_status,
      property_sqft,
      roof_age_estimated,
      property_estimated_value,
      tags
    `
    )
    .eq("id", conversation_id)
    .single();

  if (error || !convo) {
    console.error("Next best actions convo error", error);
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  const actions: NextBestAction[] = [];

  const stage = convo.lead_stage;
  const engagementLevel = convo.engagement_level as
    | "cold"
    | "warm"
    | "hot"
    | null;
  const lastContactDays = daysSince(convo.last_contact_at) ?? 999;
  const isInsurance = !!convo.is_insurance_claim;
  const insuranceStatus = convo.insurance_status || "";
  const sqft = convo.property_sqft ?? null;
  const roofAge = convo.roof_age_estimated ?? null;
  const homeValue = convo.property_estimated_value ?? null;

  const tags = (convo.tags || []) as {
    id: string;
    label: string;
    category?: string | null;
  }[];

  const hasPhone = !!convo.homeowner_phone;
  const hasEmail = !!convo.homeowner_email;

  // Helper to prioritize a call if we have a phone
  function preferredChannel(): "call" | "email" {
    if (hasPhone) return "call";
    return "email";
  }

  // ========= RULES: INSURANCE JOBS =========
  if (isInsurance) {
    if (insuranceStatus === "approved") {
      actions.push({
        key: "schedule_install_insurance",
        label: "Schedule roof install",
        description:
          "Insurance claim is approved. Call the homeowner to lock in an install date while momentum is high.",
        priority: "high",
        suggested_channel: preferredChannel(),
        due_in_days: 0,
      });
    } else if (
      insuranceStatus === "filed" ||
      insuranceStatus === "inspection_scheduled"
    ) {
      actions.push({
        key: "check_in_claim",
        label: "Check in on insurance claim",
        description:
          "Follow up with the homeowner or adjuster to confirm the status of the claim and keep the job moving.",
        priority: "medium",
        suggested_channel: preferredChannel(),
        due_in_days: 1,
      });
    }
  }

  // ========= RULES: ESTIMATE SENT =========
  if (stage === "estimate_sent" && engagementLevel !== "hot") {
    if (lastContactDays >= 2 && lastContactDays < 7) {
      actions.push({
        key: "estimate_follow_up",
        label: "Follow up on estimate",
        description:
          "You sent the estimate but haven't had recent contact. A quick follow-up can save this job.",
        priority: "high",
        suggested_channel: preferredChannel(),
        due_in_days: 0,
      });
    } else if (lastContactDays >= 7) {
      actions.push({
        key: "final_ping_before_close",
        label: "Send final check-in",
        description:
          "It's been over a week since contact. Send a final check-in before marking the lead as lost.",
        priority: "medium",
        suggested_channel: hasEmail ? "email" : preferredChannel(),
        due_in_days: 0,
      });
    }
  }

  // ========= RULES: HOT LEADS =========
  if (engagementLevel === "hot" && stage !== "won" && stage !== "lost") {
    actions.push({
      key: "call_hot_lead",
      label: "Call this hot lead",
      description:
        "This homeowner is highly engaged. Call today to push them toward booking or signing.",
      priority: "high",
      suggested_channel: preferredChannel(),
      due_in_days: 0,
    });
  }

  // ========= RULES: OLD / HIGH-VALUE ROOFS =========
  const isBigRoof = sqft && sqft >= 2500;
  const isAgingRoof = roofAge && roofAge >= 15;
  const isHighValueHome = homeValue && homeValue >= 600000;

  if (
    (isBigRoof || isAgingRoof || isHighValueHome) &&
    stage !== "won" &&
    stage !== "lost"
  ) {
    actions.push({
      key: "prioritize_high_value",
      label: "Prioritize this high-value roof",
      description:
        "This home looks like a larger or higher-value roof. Make sure it's on your priority follow-up list.",
      priority: "medium",
      suggested_channel: preferredChannel(),
      due_in_days: 1,
    });
  }

  // ========= RULES: STALLED LEADS =========
  if (stage === "contacted" && lastContactDays >= 5) {
    actions.push({
      key: "book_inspection",
      label: "Try to book an inspection",
      description:
        "Lead has gone quiet after first contact. Call to book an on-site inspection before they forget you.",
      priority: "medium",
      suggested_channel: preferredChannel(),
      due_in_days: 0,
    });
  }

  // ========= RULES: LOST ON PRICE =========
  const lostOnPriceTag = tags.find(
    (t) =>
      t.label.toLowerCase().includes("lost on price") ||
      t.label.toLowerCase().includes("price-sensitive")
  );
  if (stage === "lost" && lostOnPriceTag) {
    actions.push({
      key: "add_price_feedback",
      label: "Capture pricing feedback",
      description:
        "This lead was lost on price. Add notes about their feedback so you can improve future quotes.",
      priority: "low",
      suggested_channel: "internal",
      due_in_days: 2,
    });
  }

  // ========= FALLBACK ACTIONS =========
  if (actions.length === 0 && stage !== "won" && stage !== "lost") {
    if (lastContactDays >= 3) {
      actions.push({
        key: "simple_check_in",
        label: "Send a simple check-in",
        description:
          "No clear recent action. Send a friendly check-in to keep the conversation alive.",
        priority: "medium",
        suggested_channel: hasEmail ? "email" : preferredChannel(),
        due_in_days: 0,
      });
    } else {
      actions.push({
        key: "monitor_only",
        label: "Monitor for a few days",
        description:
          "This lead doesn't need immediate action. Monitor their engagement for a few more days.",
        priority: "low",
        suggested_channel: "internal",
        due_in_days: 3,
      });
    }
  }

  // De-duplicate by key
  const unique: Record<string, NextBestAction> = {};
  for (const a of actions) {
    if (!unique[a.key]) unique[a.key] = a;
  }

  const finalActions = Object.values(unique).slice(0, 3); // at most 3

  return NextResponse.json({ actions: finalActions });
}

















































