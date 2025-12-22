// app/api/campaigns/create/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();

  try {
    const body = (await req.json()) as {
      name?: string;
      description?: string | null;
      fromName?: string | null;
      fromEmail?: string | null;
      dailySendLimit?: number | null;
    };

    if (!body.name || !body.name.trim()) {
      return NextResponse.json(
        { error: "Campaign name is required" },
        { status: 400 }
      );
    }

    // 1) Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 2) Get a workspace for this user
    const { data: wsRows, error: wsError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1);

    if (wsError || !wsRows || wsRows.length === 0) {
      console.error("No workspace available for user:", wsError);
      return NextResponse.json(
        { error: "No workspace found for this user" },
        { status: 400 }
      );
    }

    const workspaceId = wsRows[0].workspace_id as string;

    // 2) Get plan limits
    const { data: limits, error: limitsError } = await supabase.rpc(
      "get_workspace_plan_limits",
      { p_workspace_id: workspaceId }
    );

    if (limitsError) {
      console.error("get_workspace_plan_limits error:", limitsError);
    }

    const currentPlan = Array.isArray(limits) && limits.length > 0
      ? limits[0]
      : null;

    // 3) If max_campaigns is set, enforce it
    if (currentPlan?.max_campaigns != null) {
      const { count, error: countError } = await supabase
        .from("campaigns")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId);

      if (countError) {
        console.error("Error counting campaigns:", countError);
      }

      const currentCount = count ?? 0;

      if (currentCount >= currentPlan.max_campaigns) {
        return NextResponse.json(
          {
            error: "campaign_limit_reached",
            message:
              "You have reached the maximum number of campaigns for your plan. Upgrade to create more campaigns.",
            maxCampaigns: currentPlan.max_campaigns,
          },
          { status: 402 } // payment required-ish
        );
      }
    }

    // 4) Create campaign
    const { data, error } = await supabase
      .from("campaigns")
      .insert({
        workspace_id: workspaceId,
        name: body.name.trim(),
        description: body.description ?? null,
        from_name: body.fromName ?? null,
        from_email: body.fromEmail ?? null,
        daily_send_limit:
          typeof body.dailySendLimit === "number"
            ? body.dailySendLimit
            : 50,
        status: "active",
      })
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("Error creating campaign:", error);
      return NextResponse.json(
        { error: "Failed to create campaign", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: true, campaignId: data?.id },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("POST /api/campaigns/create error:", err);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}

