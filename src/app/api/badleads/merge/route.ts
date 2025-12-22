import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/badleads/merge
 * 
 * Merge duplicate leads
 * 
 * Body:
 * - primary_lead_id: ID of lead to keep
 * - duplicate_lead_id: ID of lead to merge into primary
 * - detection_method: How duplicate was detected (default: 'manual')
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get workspace_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("current_workspace_id")
      .eq("id", user.id)
      .single();

    const workspaceId = profile?.current_workspace_id;
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const body = await req.json();
    const { primary_lead_id, duplicate_lead_id, detection_method = "manual" } = body;

    if (!primary_lead_id || !duplicate_lead_id) {
      return NextResponse.json(
        { error: "primary_lead_id and duplicate_lead_id are required" },
        { status: 400 }
      );
    }

    if (primary_lead_id === duplicate_lead_id) {
      return NextResponse.json(
        { error: "Cannot merge lead with itself" },
        { status: 400 }
      );
    }

    // Get lead details
    const { data: primaryLead, error: primaryError } = await supabaseAdmin
      .from("leads")
      .select("id, email, workspace_id")
      .eq("id", primary_lead_id)
      .single();

    const { data: duplicateLead, error: duplicateError } = await supabaseAdmin
      .from("leads")
      .select("id, email, workspace_id")
      .eq("id", duplicate_lead_id)
      .single();

    if (primaryError || !primaryLead) {
      return NextResponse.json({ error: "Primary lead not found" }, { status: 404 });
    }

    if (duplicateError || !duplicateLead) {
      return NextResponse.json({ error: "Duplicate lead not found" }, { status: 404 });
    }

    if (primaryLead.workspace_id !== workspaceId || duplicateLead.workspace_id !== workspaceId) {
      return NextResponse.json({ error: "Leads must belong to your workspace" }, { status: 403 });
    }

    // Create duplicate link record
    const { data: duplicateLink, error: linkError } = await supabaseAdmin
      .from("duplicate_links")
      .insert({
        workspace_id: workspaceId,
        primary_lead_id: primary_lead_id,
        primary_email: primaryLead.email,
        duplicate_lead_id: duplicate_lead_id,
        duplicate_email: duplicateLead.email,
        detection_method,
        merged: false,
      })
      .select()
      .single();

    if (linkError) {
      console.error("Error creating duplicate link:", linkError);
      return NextResponse.json({ error: linkError.message }, { status: 500 });
    }

    // Merge logic: Combine timeline, photos, notes, pipeline state
    // This is a simplified version - you may want to add more sophisticated merging
    
    // 1. Update campaign_leads to point to primary
    await supabaseAdmin
      .from("campaign_leads")
      .update({ lead_id: primary_lead_id })
      .eq("lead_id", duplicate_lead_id);

    // 2. Update send_queue to point to primary
    await supabaseAdmin
      .from("send_queue")
      .update({ lead_id: primary_lead_id })
      .eq("lead_id", duplicate_lead_id);

    // 3. Update any other references (customize based on your schema)
    // For example, if you have notes, timeline, etc.

    // 4. Mark duplicate link as merged
    await supabaseAdmin
      .from("duplicate_links")
      .update({
        merged: true,
        merged_at: new Date().toISOString(),
        merge_metadata: {
          merged_at: new Date().toISOString(),
          merged_by: user.id,
        },
      })
      .eq("id", duplicateLink.id);

    // 5. Create bad lead record for duplicate
    await supabaseAdmin.rpc("detect_bad_lead", {
      p_workspace_id: workspaceId,
      p_email: duplicateLead.email,
      p_category: "duplicate",
      p_reason: `Merged into lead ${primary_lead_id}`,
      p_lead_id: duplicate_lead_id,
      p_metadata: {
        primary_lead_id,
        merged_at: new Date().toISOString(),
      },
    });

    // 6. Optionally soft-delete the duplicate lead (or keep it for audit)
    // await supabaseAdmin.from("leads").delete().eq("id", duplicate_lead_id);

    return NextResponse.json({
      success: true,
      duplicate_link_id: duplicateLink.id,
      message: "Leads merged successfully",
    });
  } catch (e: any) {
    console.error("Merge leads error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}





















































