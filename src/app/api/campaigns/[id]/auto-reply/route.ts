import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { allow_auto_reply, auto_reply_confidence_threshold } = await req.json();

    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify campaign ownership
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, user_id")
      .eq("id", id)
      .maybeSingle();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Update auto-reply settings
    const updateData: any = {};
    if (allow_auto_reply !== undefined) {
      updateData.allow_auto_reply = allow_auto_reply;
      if (allow_auto_reply) {
        updateData.auto_reply_enabled_at = new Date().toISOString();
        updateData.auto_reply_enabled_by = user.id;
      }
    }
    if (auto_reply_confidence_threshold !== undefined) {
      updateData.auto_reply_confidence_threshold = auto_reply_confidence_threshold;
    }

    const { data, error } = await supabase
      .from("campaigns")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, campaign: data });
  } catch (error) {
    console.error("Error updating auto-reply settings:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: campaign, error } = await supabase
      .from("campaigns")
      .select("allow_auto_reply, auto_reply_confidence_threshold, auto_reply_enabled_at")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ campaign });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

