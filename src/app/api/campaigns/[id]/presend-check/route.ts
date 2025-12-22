import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaignId = params.id;

  // Load campaign and get workspace_id
  const { data: campaign, error: cErr } = await supabase
    .from("campaigns_new")
    .select("user_id, workspace_id")
    .eq("id", campaignId)
    .eq("user_id", user.id)
    .maybeSingle();
  
  if (cErr || !campaign) {
    return NextResponse.json({ error: cErr?.message || "Campaign not found" }, { status: 404 });
  }

  // Get all pending recipients for this campaign
  const { data: recipients, error: rErr } = await supabase
    .from("campaign_recipients_new")
    .select("id, email, status")
    .eq("campaign_id", campaignId)
    .eq("user_id", user.id)
    .eq("status", "pending");

  if (rErr) {
    return NextResponse.json({ error: rErr.message }, { status: 500 });
  }

  if (!recipients || recipients.length === 0) {
    return NextResponse.json({
      total: 0,
      suppressed_global: 0,
      suppressed_campaign: 0,
      invalid: 0,
      final_sendable: 0,
      blocked: []
    });
  }

  // Check each recipient for suppression and validity
  const blockedContacts: Array<{
    id: string;
    email: string;
    reason: 'suppressed_global' | 'suppressed_campaign' | 'invalid';
    details: string;
  }> = [];

  let suppressedGlobal = 0;
  let suppressedCampaign = 0;
  let invalid = 0;

  // Basic email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  for (const recipient of recipients) {
    // Check email format validity
    if (!emailRegex.test(recipient.email) || recipient.email.length > 254) {
      invalid++;
      blockedContacts.push({
        id: recipient.id,
        email: recipient.email,
        reason: 'invalid',
        details: 'Invalid email format'
      });
      continue;
    }

    // Check if email is suppressed using the existing function
    const { data: isSuppressed } = await supabase.rpc('is_suppressed', {
      p_workspace: campaign.workspace_id || user.id, // fallback to user.id if no workspace_id
      p_email: recipient.email,
      p_campaign: campaignId
    });

    if (isSuppressed) {
      // Try to determine if it's global or campaign-specific suppression
      // Check global suppressions first
      const { data: globalSuppression } = await supabase
        .from("suppressions")
        .select("id")
        .eq("workspace_id", campaign.workspace_id || user.id)
        .eq("email", recipient.email.toLowerCase())
        .limit(1);

      if (globalSuppression && globalSuppression.length > 0) {
        suppressedGlobal++;
        blockedContacts.push({
          id: recipient.id,
          email: recipient.email,
          reason: 'suppressed_global',
          details: 'Email is globally suppressed'
        });
      } else {
        suppressedCampaign++;
        blockedContacts.push({
          id: recipient.id,
          email: recipient.email,
          reason: 'suppressed_campaign',
          details: 'Email is suppressed for this campaign'
        });
      }
    }
  }

  const total = recipients.length;
  const finalSendable = total - suppressedGlobal - suppressedCampaign - invalid;

  return NextResponse.json({
    total,
    suppressed_global: suppressedGlobal,
    suppressed_campaign: suppressedCampaign,
    invalid,
    final_sendable,
    blocked: blockedContacts
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaignId = params.id;
  const { exclude_contact_ids } = await req.json().catch(() => ({}));

  if (!exclude_contact_ids || !Array.isArray(exclude_contact_ids)) {
    return NextResponse.json({ error: "exclude_contact_ids array is required" }, { status: 400 });
  }

  // Get the pre-send check data to log accurate metrics
  const presendCheck = await supabase.rpc('is_suppressed', {
    p_workspace: user.id,
    p_email: 'dummy@example.com', // This will be replaced with actual check
    p_campaign: campaignId
  });

  // Update the status of excluded contacts to 'cancelled'
  if (exclude_contact_ids.length > 0) {
    const { error: updateErr } = await supabase
      .from("campaign_recipients_new")
      .update({ status: "cancelled" })
      .eq("campaign_id", campaignId)
      .eq("user_id", user.id)
      .in("id", exclude_contact_ids);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
  }

  // Get final counts after exclusion for accurate metrics
  const { data: finalCounts } = await supabase
    .from("campaign_recipients_new")
    .select("status", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("user_id", user.id);

  const pendingCount = finalCounts?.find(c => c.status === "pending")?.count || 0;
  const cancelledCount = finalCounts?.find(c => c.status === "cancelled")?.count || 0;
  const totalAttempted = pendingCount + cancelledCount;

  // Log the send attempt metrics with detailed breakdown
  try {
    // Get the original pre-send check data to determine suppression types
    const originalCheckResponse = await fetch(`${req.url.replace('/presend-check', '/presend-check')}`, {
      method: 'GET',
      headers: {
        'Cookie': req.headers.get('cookie') || '',
      }
    });
    
    let originalData = null;
    if (originalCheckResponse.ok) {
      originalData = await originalCheckResponse.json();
    }

    await supabase
      .from("send_attempts")
      .insert({
        campaign_id: campaignId,
        attempted: totalAttempted,
        blocked_suppressed: originalData?.suppressed_global + originalData?.suppressed_campaign || 0,
        blocked_invalid: originalData?.invalid || 0,
        final_sendable: pendingCount,
        metadata: {
          excluded_contact_ids: exclude_contact_ids,
          suppressed_global: originalData?.suppressed_global || 0,
          suppressed_campaign: originalData?.suppressed_campaign || 0,
          invalid: originalData?.invalid || 0,
          timestamp: new Date().toISOString(),
          user_action: 'exclude_blocked'
        }
      });
  } catch (error) {
    console.error("Error logging send attempt metrics:", error);
    // Don't fail the request if metrics logging fails
  }

  return NextResponse.json({ 
    success: true, 
    excluded_count: exclude_contact_ids.length,
    final_sendable: pendingCount
  });
}