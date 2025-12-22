import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentWorkspaceId } from "@/lib/workspace";

async function checkAdminAccess(supabase: any, workspaceId: string, userId: string): Promise<boolean> {
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  return membership && (membership.role === 'owner' || membership.role === 'admin');
}

// GET /api/campaigns/[id]/sending-window - Get campaign sending window override
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaign_id = params.id;
    if (!campaign_id) {
      return NextResponse.json({ error: "Campaign ID required" }, { status: 400 });
    }

    const { data: campaign, error } = await supabase
      .from("campaigns")
      .select("custom_sending_window, workspace_id")
      .eq("id", campaign_id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      custom_sending_window: campaign.custom_sending_window || null
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/campaigns/[id]/sending-window - Update campaign sending window override
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaign_id = params.id;
    if (!campaign_id) {
      return NextResponse.json({ error: "Campaign ID required" }, { status: 400 });
    }

    // Get campaign to check workspace
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("workspace_id")
      .eq("id", campaign_id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const workspace_id = campaign.workspace_id;
    if (!workspace_id) {
      return NextResponse.json({ error: "Campaign has no workspace" }, { status: 400 });
    }

    // Check admin access
    const isAdmin = await checkAdminAccess(supabase, workspace_id, user.id);
    if (!isAdmin) {
      return NextResponse.json({ error: "Only Owners/Admins can edit campaign settings" }, { status: 403 });
    }

    const body = await req.json();
    const { enabled, allowed_days, start_time, end_time, timezone } = body;

    let custom_sending_window: any = null;

    if (enabled) {
      // Validate inputs
      if (!allowed_days || !start_time || !end_time) {
        return NextResponse.json(
          { error: "allowed_days, start_time, and end_time are required when enabled" },
          { status: 400 }
        );
      }

      if (!Array.isArray(allowed_days) || allowed_days.length === 0) {
        return NextResponse.json(
          { error: "allowed_days must be a non-empty array" },
          { status: 400 }
        );
      }

      // Validate time format (HH:MM)
      const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(start_time) || !timeRegex.test(end_time)) {
        return NextResponse.json(
          { error: "start_time and end_time must be in HH:MM format" },
          { status: 400 }
        );
      }

      custom_sending_window = {
        enabled: true,
        allowed_days,
        start_time,
        end_time,
        timezone: timezone || 'America/Los_Angeles'
      };
    }

    // Update campaign
    const { data, error } = await supabase
      .from("campaigns")
      .update({ custom_sending_window })
      .eq("id", campaign_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



