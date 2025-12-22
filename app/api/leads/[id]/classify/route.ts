// app/api/leads/[id]/classify/route.ts
// Block 8790 — Inbox v1: Unified Roofing Reply Center
// Update lead classification (hot/warm/not_interested)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ActivityLogger } from "@/lib/activity-log";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const leadId = id;

  let body: { classification?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { classification } = body;

  if (!classification) {
    return NextResponse.json(
      { error: "Missing classification" },
      { status: 400 }
    );
  }

  // Block 11500: Get old classification before update
  const { data: oldLead } = await supabase
    .from("leads")
    .select("classification, email, first_name, last_name, workspace_id, campaign_id")
    .eq("id", leadId)
    .maybeSingle();

  const oldClassification = oldLead?.classification || null;

  // Update lead classification
  const { error: updateError } = await supabase
    .from("leads")
    .update({ classification })
    .eq("id", leadId);

  if (updateError) {
    console.error("Classification update error:", updateError);
    return NextResponse.json(
      { error: "Failed to update classification" },
      { status: 500 }
    );
  }

  // Also update classification on inbound_emails for this lead
  await supabase
    .from("inbound_emails")
    .update({ classification })
    .eq("lead_id", leadId)
    .eq("owner_id", user.id);

  // Block 8840 — Hot Lead Events
  // Create hot_lead_event when lead is classified as hot
  if (classification === "hot") {
    // Get lead with owner_id
    const { data: leadRow } = await supabase
      .from("leads")
      .select("id, owner_id")
      .eq("id", leadId)
      .maybeSingle();

    if (leadRow) {
      // Try to get owner_id from lead, fallback to current user
      const ownerId = leadRow.owner_id || user.id;

      // Try to find most recent inbound_email for this lead
      const { data: inboundEmail } = await supabase
        .from("inbound_emails")
        .select("id")
        .eq("lead_id", leadId)
        .eq("owner_id", user.id)
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Insert hot_lead_event
      await supabase
        .from("hot_lead_events")
        .insert({
          owner_id: ownerId,
          lead_id: leadRow.id,
          inbound_email_id: inboundEmail?.id ?? null,
        })
        .catch((err) => {
          console.error("Failed to create hot_lead_event:", err);
          // Don't fail the request if event creation fails
        });

      // Block 21734: Create call task for hot leads
      await supabase
        .rpc("create_call_task_if_needed", {
          p_lead_id: leadId,
          p_source: "hot_lead",
        })
        .catch((err) => {
          console.error("Failed to create call task:", err);
          // Don't fail the request if call task creation fails
        });
    }
  }

  // Log classification activity
  try {
    if (oldLead?.workspace_id) {
      await ActivityLogger.leadClassified({
        workspace_id: oldLead.workspace_id,
        user_id: user.id,
        campaign_id: oldLead.campaign_id || null,
        lead_id: leadId,
        lead_email: oldLead.email || "",
        lead_name: oldLead.first_name || oldLead.last_name
          ? `${oldLead.first_name || ""} ${oldLead.last_name || ""}`.trim()
          : null,
        classification: classification,
        old_classification: oldClassification !== classification ? oldClassification : null,
        reason: classification === "hot" ? "Manual classification" : null,
      });
    }
  } catch (logError) {
    console.warn("Failed to log classification activity:", logError);
  }

  return NextResponse.json({ success: true }, { status: 200 });
}

