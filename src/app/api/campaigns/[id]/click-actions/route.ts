import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify user owns this campaign
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("user_id")
      .eq("id", params.id)
      .single();

    if (!campaign || campaign.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("click_actions")
      .select("*")
      .eq("campaign_id", params.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (error) {
    console.error("Error fetching click actions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify user owns this campaign
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("user_id")
      .eq("id", params.id)
      .single();

    if (!campaign || campaign.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const { match_url, action, value } = body;

    if (!match_url || !action) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate action type
    if (!["tag", "followup_campaign", "suppress"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action type" },
        { status: 400 }
      );
    }

    // If action is followup_campaign, verify the campaign exists and user owns it
    if (action === "followup_campaign" && value) {
      const { data: followupCampaign } = await supabase
        .from("campaigns")
        .select("user_id")
        .eq("id", value)
        .single();

      if (!followupCampaign || followupCampaign.user_id !== user.id) {
        return NextResponse.json(
          { error: "Invalid followup campaign" },
          { status: 400 }
        );
      }
    }

    const { data, error } = await supabase
      .from("click_actions")
      .insert({
        campaign_id: params.id,
        match_url,
        action,
        value,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error creating click action:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const actionId = searchParams.get("actionId");

    if (!actionId) {
      return NextResponse.json(
        { error: "Missing actionId" },
        { status: 400 }
      );
    }

    // Verify user owns this click action
    const { data: clickAction } = await supabase
      .from("click_actions")
      .select("campaign_id")
      .eq("id", actionId)
      .single();

    if (!clickAction) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: campaign } = await supabase
      .from("campaigns")
      .select("user_id")
      .eq("id", clickAction.campaign_id)
      .single();

    if (!campaign || campaign.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await supabase.from("click_actions").delete().eq("id", actionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting click action:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 