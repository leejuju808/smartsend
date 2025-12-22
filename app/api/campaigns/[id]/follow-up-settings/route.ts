import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });

  const campaignId = params.id;
  const body = await req.json();

  try {
    const {
      data: campaign,
      error: campaignError,
    } = await supabase
      .from("campaigns")
      .select("id, company_id, workspace_id, org_id, user_id")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Derive company_id from campaign (prefer company_id, then org_id, then workspace_id, then user_id)
    const companyId = campaign.company_id || campaign.org_id || campaign.workspace_id || campaign.user_id;
    
    if (!companyId) {
      return NextResponse.json(
        { error: "Could not determine company_id from campaign" },
        { status: 400 }
      );
    }

    // Company policy: follow-ups are mandatory when institutional policy is locked for the workspace.
    // Best-effort: if the column doesn't exist in a given DB, this becomes a no-op.
    try {
      const wsId = String(campaign.workspace_id || "");
      if (wsId) {
        const { data: ws } = await supabase
          .from("workspaces")
          .select("institutional_policy_locked")
          .eq("id", wsId)
          .maybeSingle();
        const locked = String((ws as any)?.institutional_policy_locked || "false").toLowerCase() === "true";
        if (locked) {
          if (body?.enabled === false) {
            return NextResponse.json(
              { error: "Company policy: Follow-ups are mandatory." },
              { status: 423 }
            );
          }
          if (typeof body?.max_follow_ups === "number" && body.max_follow_ups < 1) {
            return NextResponse.json(
              { error: "Company policy: max_follow_ups cannot be < 1." },
              { status: 423 }
            );
          }
        }
      }
    } catch {
      // best-effort
    }

    const payload = {
      company_id: companyId,
      campaign_id: campaign.id,
      enabled: body.enabled ?? true,
      max_follow_ups: Math.min(Math.max(body.max_follow_ups ?? 4, 0), 4),
      fu_1_delay_hours: body.fu_1_delay_hours ?? 48,
      fu_2_delay_hours: body.fu_2_delay_hours ?? 96,
      fu_3_delay_hours: body.fu_3_delay_hours ?? 168,
      fu_4_delay_hours: body.fu_4_delay_hours ?? 336,
      stop_on_reply: body.stop_on_reply ?? true,
      auto_send_warm: body.auto_send_warm ?? true,
      auto_send_hot: body.auto_send_hot ?? true,
    };

    const { data, error } = await supabase
      .from("campaign_follow_up_settings")
      .upsert(payload, {
        onConflict: "campaign_id",
      })
      .select("*")
      .single();

    if (error) {
      console.error(error);
      return NextResponse.json(
        { error: "Failed to save follow-up settings" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "Unexpected error saving follow-up settings" },
      { status: 500 }
    );
  }
}

