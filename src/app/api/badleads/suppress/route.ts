import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/badleads/suppress
 * 
 * Suppress a lead (add to bad leads and suppression list)
 * 
 * Body:
 * - email: Email address to suppress
 * - category: Category of bad lead
 * - reason: Reason for suppression
 * - lead_id: Optional lead ID
 * - campaign_id: Optional campaign ID
 * - suppression_level: 'global', 'list', or 'campaign' (default: 'global')
 * - metadata: Optional metadata object
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
    const { email, category, reason, lead_id, campaign_id, suppression_level = "global", metadata = {} } = body;

    if (!email || !category) {
      return NextResponse.json(
        { error: "email and category are required" },
        { status: 400 }
      );
    }

    // Validate category
    const validCategories = [
      "hard_bounce",
      "soft_bounce",
      "spam_complaint",
      "not_interested",
      "time_waster",
      "duplicate",
      "bad_data",
      "unsubscribed",
      "invalid_email",
      "disposable_email",
      "role_account",
    ];

    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${validCategories.join(", ")}` },
        { status: 400 }
      );
    }

    // Use RPC function to detect and suppress
    const { data: badLeadId, error: rpcError } = await supabaseAdmin.rpc(
      "detect_bad_lead",
      {
        p_workspace_id: workspaceId,
        p_email: email,
        p_category: category,
        p_reason: reason || null,
        p_lead_id: lead_id || null,
        p_campaign_id: campaign_id || null,
        p_metadata: metadata,
      }
    );

    if (rpcError) {
      console.error("Error suppressing lead:", rpcError);
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    // If suppression_level is not global, update it
    if (suppression_level !== "global" && badLeadId) {
      await supabaseAdmin
        .from("bad_leads")
        .update({ suppression_level })
        .eq("id", badLeadId);

      // Also update suppression_list if exists
      await supabaseAdmin
        .from("suppression_list")
        .update({ suppression_level })
        .eq("workspace_id", workspaceId)
        .eq("email", email.toLowerCase());
    }

    return NextResponse.json({
      success: true,
      bad_lead_id: badLeadId,
      message: "Lead suppressed successfully",
    });
  } catch (e: any) {
    console.error("Suppress lead error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}





















































