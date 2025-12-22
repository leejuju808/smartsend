import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET() {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspace_id = await getCurrentWorkspaceId();
    if (!workspace_id) {
      return NextResponse.json({ error: "No active workspace" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("workspaces")
      .select("sending_timezone, default_sending_window_start, default_sending_window_end, respect_lead_timezone, restrict_to_business_days, global_send_window_start, global_send_window_end, default_daily_send_cap")
      .eq("id", workspace_id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || null);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspace_id = await getCurrentWorkspaceId();
    if (!workspace_id) {
      return NextResponse.json({ error: "No active workspace" }, { status: 400 });
    }

    // Update workspace settings
    const updates: any = {};
    if (body.sending_timezone !== undefined) updates.sending_timezone = body.sending_timezone;
    if (body.default_sending_window_start !== undefined) updates.default_sending_window_start = body.default_sending_window_start;
    if (body.default_sending_window_end !== undefined) updates.default_sending_window_end = body.default_sending_window_end;
    if (body.respect_lead_timezone !== undefined) updates.respect_lead_timezone = body.respect_lead_timezone;
    if (body.restrict_to_business_days !== undefined) updates.restrict_to_business_days = body.restrict_to_business_days;
    if (body.global_send_window_start !== undefined) updates.global_send_window_start = body.global_send_window_start;
    if (body.global_send_window_end !== undefined) updates.global_send_window_end = body.global_send_window_end;
    if (body.default_daily_send_cap !== undefined) updates.default_daily_send_cap = body.default_daily_send_cap;

    const { data, error } = await supabase
      .from("workspaces")
      .update(updates)
      .eq("id", workspace_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}








