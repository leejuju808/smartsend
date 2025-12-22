// Block 20310 — Behavioral Insight Chips API

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Insight = {
  key: string;
  label: string;
  severity: "low" | "medium" | "high";
  group?: "engagement" | "timing" | "pricing" | "insurance" | "job";
};

function daysSince(iso?: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const diffMs = Date.now() - d.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
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

  // Prefer the profile view if you created it
  const { data: convo, error } = await supabase
    .from("inbox_conversation_profile_view")
    .select("*")
    .eq("id", conversation_id)
    .single();

  if (error || !convo) {
    console.error("Behavioral insights convo error", error);
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  const insights: Insight[] = [];

  const openCount = convo.email_open_count ?? 0;
  const clickCount = convo.email_click_count ?? 0;
  const replyCount = convo.reply_count ?? 0;
  const callCount = convo.call_count ?? 0;

  const lastContactDays = daysSince(convo.last_contact_at);
  const lastOpenDays = daysSince(convo.last_open_at);
  const lastClickDays = daysSince(convo.last_click_at);

  const stage = convo.lead_stage;
  const lostReason = convo.lost_reason_category;
  const isInsurance = !!convo.is_insurance_claim;

  const tags = (convo.tags || []) as {
    id: string;
    label: string;
    category?: string | null;
  }[];

  // ========== ENGAGEMENT INSIGHTS ==========

  if (replyCount > 0 && (lastContactDays ?? 999) <= 2) {
    insights.push({
      key: "recent_reply",
      label: "Recently replied",
      severity: "high",
      group: "engagement",
    });
  } else if (openCount > 0 && (lastOpenDays ?? 999) <= 2 && replyCount === 0) {
    insights.push({
      key: "opened_no_reply",
      label: "Opened but no reply yet",
      severity: "medium",
      group: "engagement",
    });
  }

  if (clickCount >= 1 && (lastClickDays ?? 999) <= 3) {
    insights.push({
      key: "clicked_links",
      label: "Clicked links recently",
      severity: "high",
      group: "engagement",
    });
  }

  if ((lastContactDays ?? 999) >= 5 && stage !== "won" && stage !== "lost") {
    insights.push({
      key: "ghosting_risk",
      label: "No contact in 5+ days",
      severity: "high",
      group: "timing",
    });
  }

  if (openCount === 0 && replyCount === 0 && (lastContactDays ?? 999) > 3) {
    insights.push({
      key: "cold_lead",
      label: "Cold / no engagement yet",
      severity: "medium",
      group: "engagement",
    });
  }

  if (callCount >= 2 && replyCount === 0) {
    insights.push({
      key: "calls_no_reply",
      label: "Multiple calls with no reply",
      severity: "medium",
      group: "engagement",
    });
  }

  // ========== STAGE & PIPELINE INSIGHTS ==========

  if (stage === "estimate_sent" && replyCount === 0 && (lastContactDays ?? 999) >= 2) {
    insights.push({
      key: "estimate_needs_followup",
      label: "Estimate sent — follow-up due",
      severity: "high",
      group: "timing",
    });
  }

  if (stage === "inspection_scheduled" && (lastContactDays ?? 999) > 3) {
    insights.push({
      key: "inspection_at_risk",
      label: "Inspection scheduled — no recent contact",
      severity: "medium",
      group: "timing",
    });
  }

  if (stage === "negotiation" && replyCount >= 2) {
    insights.push({
      key: "active_negotiation",
      label: "Active negotiation",
      severity: "high",
      group: "engagement",
    });
  }

  // ========== PRICING INSIGHTS ==========

  if (stage === "lost" && lostReason === "price") {
    insights.push({
      key: "lost_on_price",
      label: "Lost on price",
      severity: "high",
      group: "pricing",
    });
  }

  const priceSensitiveTag = tags.find(
    (t) =>
      t.label.toLowerCase().includes("price") ||
      t.label.toLowerCase().includes("budget")
  );
  if (priceSensitiveTag) {
    insights.push({
      key: "price_sensitive",
      label: "Price-sensitive lead",
      severity: "medium",
      group: "pricing",
    });
  }

  // ========== INSURANCE INSIGHTS ==========

  if (isInsurance) {
    const insStatus = convo.insurance_status || "";
    if (insStatus === "filed" || insStatus === "inspection_scheduled") {
      insights.push({
        key: "claim_in_motion",
        label: "Insurance claim in motion",
        severity: "medium",
        group: "insurance",
      });
    } else if (insStatus === "approved") {
      insights.push({
        key: "claim_approved",
        label: "Insurance claim approved",
        severity: "high",
        group: "insurance",
      });
    } else if (insStatus === "denied") {
      insights.push({
        key: "claim_denied",
        label: "Insurance claim denied",
        severity: "medium",
        group: "insurance",
      });
    }
  }

  // ========== JOB / PROPERTY INSIGHTS ==========

  const sqft = convo.property_sqft ?? null;
  const roofAge = convo.roof_age_estimated ?? null;
  const homeValue = convo.property_estimated_value ?? null;

  if (sqft && sqft >= 2500) {
    insights.push({
      key: "large_home",
      label: "Large home (2500+ sqft)",
      severity: "medium",
      group: "job",
    });
  }

  if (roofAge && roofAge >= 15) {
    insights.push({
      key: "aging_roof",
      label: `Aging roof (${roofAge}+ yrs)`,
      severity: "high",
      group: "job",
    });
  }

  if (homeValue && homeValue >= 600000) {
    insights.push({
      key: "high_value_property",
      label: "Higher-value property",
      severity: "medium",
      group: "job",
    });
  }

  // De-duplicate by key
  const unique: Record<string, Insight> = {};
  for (const ins of insights) {
    if (!unique[ins.key]) unique[ins.key] = ins;
  }

  const finalInsights = Object.values(unique);

  return NextResponse.json({
    insights: finalInsights,
  });
}

















































