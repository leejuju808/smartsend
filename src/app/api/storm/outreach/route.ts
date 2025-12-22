// Block 40210 — Storm Outreach Campaign API
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { workspace_id, storm_event_id, zip_codes, message_template } =
      await req.json();

    if (!workspace_id || !storm_event_id) {
      return NextResponse.json(
        { error: "workspace_id and storm_event_id are required" },
        { status: 400 }
      );
    }

    // Get storm event
    const { data: stormEvent, error: stormError } = await supabase
      .from("storm_events")
      .select("*")
      .eq("id", storm_event_id)
      .single();

    if (stormError || !stormEvent) {
      return NextResponse.json(
        { error: "Storm event not found" },
        { status: 404 }
      );
    }

    // Find leads in affected zip codes (past leads + customers)
    const zipFilter = zip_codes && zip_codes.length > 0 ? zip_codes : [stormEvent.zip_code];

    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("id, email, name, phone, zip_code")
      .eq("workspace_id", workspace_id)
      .in("zip_code", zipFilter)
      .limit(1000); // Cap at 1000 leads for performance

    if (leadsError) {
      throw leadsError;
    }

    // Default message template
    const defaultMessage =
      message_template ||
      `We hope you're safe. Our roofing team is doing free storm inspections today. Reply INSPECT to book your priority slot.`;

    // Create campaign
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .insert({
        workspace_id,
        name: `Storm Outreach - ${stormEvent.event_type} - ${new Date().toLocaleDateString()}`,
        status: "draft",
        objective: "storm_outreach",
        sequence: [
          {
            step: 1,
            subject: "Free Storm Inspection Available Today",
            body: defaultMessage,
            delayDays: 0,
          },
        ],
        created_by: user.id,
      })
      .select()
      .single();

    if (campaignError) {
      throw campaignError;
    }

    // Log outreach
    await supabase.from("storm_outreach_logs").insert({
      workspace_id,
      storm_event_id,
      campaign_id: campaign.id,
      leads_targeted: leads?.length || 0,
      messages_sent: 0, // Will be updated when campaign launches
    });

    return NextResponse.json({
      ok: true,
      campaign,
      leads_targeted: leads?.length || 0,
      message: `Storm outreach campaign created. ${leads?.length || 0} leads targeted.`,
    });
  } catch (error: any) {
    console.error("Error in POST /api/storm/outreach:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































