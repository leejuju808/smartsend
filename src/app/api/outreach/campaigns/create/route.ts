import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export const runtime = "nodejs";

type TemplateType =
  | "storm_damage_check"
  | "roof_age_replacement"
  | "missed_insurance_followup";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const name = String(body?.name || "").trim();
    const template_type = body?.template_type as TemplateType | undefined;

    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    if (
      !template_type ||
      !["storm_damage_check", "roof_age_replacement", "missed_insurance_followup"].includes(
        template_type
      )
    ) {
      return NextResponse.json({ error: "template_type invalid" }, { status: 400 });
    }

    // Pick a default sender_account_id for the user (tick sender engine expects this)
    const { data: sender } = await supabase
      .from("sender_accounts")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!sender?.id) {
      return NextResponse.json(
        { error: "No active sender account connected" },
        { status: 400 }
      );
    }

    const { data: campaign, error: insertError } = await supabase
      .from("campaigns")
      .insert({
        workspace_id: workspaceId,
        user_id: user.id,
        name,
        status: "draft",
        objective: "roofing_homeowner_outreach",
        template_type,
        sender_account_id: sender.id,
      } as any)
      .select("id,name,template_type,status,created_at")
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, campaign });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}










