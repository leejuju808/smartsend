import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getActiveOrg } from "@/lib/org";

export async function POST(req: NextRequest) {
  try {
    const { log_id, assignee_id } = await req.json();
    if (!log_id) {
      return NextResponse.json({ error: "log_id is required" }, { status: 400 });
    }

    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get the original log to copy org_id, campaign_id, lead_id
    const { data: log, error: logError } = await supa
      .from("campaign_logs")
      .select("org_id, campaign_id, lead_id")
      .eq("id", log_id)
      .single();

    if (logError || !log) {
      return NextResponse.json({ error: "Log not found" }, { status: 404 });
    }

    // Verify org access
    if (log.org_id !== org.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Update assignee
    const { error } = await supa
      .from("campaign_logs")
      .update({ assignee_id: assignee_id || null })
      .eq("id", log_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Log the assignment action
    await supa.from("campaign_logs").insert({
      org_id: log.org_id,
      campaign_id: log.campaign_id,
      lead_id: log.lead_id,
      action: "inbox_assigned",
      message: assignee_id ? `Assigned to ${assignee_id}` : "Unassigned",
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

