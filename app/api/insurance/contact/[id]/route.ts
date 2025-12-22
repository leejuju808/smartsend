import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentWorkspaceId } from "@/lib/workspace";

/**
 * GET /api/insurance/contact/{id}
 * Get comprehensive insurance intelligence for a contact
 * 
 * Block 19000 — SmartSend AI Insurance Brain v1
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const contactId = params.id;

    // Verify contact belongs to workspace
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, workspace_id")
      .eq("id", contactId)
      .eq("workspace_id", workspaceId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Get comprehensive insurance intelligence
    const { data: intelligence, error: intelError } = await supabase
      .from("insurance_intelligence")
      .select("*")
      .eq("contact_id", contactId)
      .single();

    // Get insurance claim data
    const { data: claim, error: claimError } = await supabase
      .from("insurance_claims")
      .select("*")
      .eq("contact_id", contactId)
      .single();

    // Get insurance metadata (from Block 17400)
    const { data: metadata, error: metadataError } = await supabase
      .from("insurance_metadata")
      .select("*")
      .eq("contact_id", contactId)
      .single();

    // Get insurance scores
    const { data: scores, error: scoresError } = await supabase
      .from("insurance_scores")
      .select("*")
      .eq("contact_id", contactId)
      .single();

    // Get insurance timeline
    const { data: timeline, error: timelineError } = await supabase
      .from("insurance_timeline")
      .select("*")
      .eq("contact_id", contactId)
      .order("stage_date", { ascending: false });

    // Get insurance events
    const { data: events, error: eventsError } = await supabase
      .from("insurance_events")
      .select("*")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(20);

    // Get state rules if state_code available
    let stateRules = null;
    if (contact.state) {
      const { data: rules } = await supabase
        .from("state_insurance_rules")
        .select("*")
        .eq("state_code", contact.state)
        .single();
      stateRules = rules;
    }

    return NextResponse.json({
      ok: true,
      contact_id: contactId,
      intelligence: intelligence || null,
      claim: claim || null,
      metadata: metadata || null,
      scores: scores || null,
      timeline: timeline || [],
      events: events || [],
      state_rules: stateRules,
    });
  } catch (error: any) {
    console.error("Error in GET /api/insurance/contact/[id]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
