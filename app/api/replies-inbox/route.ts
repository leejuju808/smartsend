import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getActiveOrg } from "@/lib/org";

export async function GET(req: Request) {
  try {
    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const assigneeId = searchParams.get("assignee_id"); // filter by assignee
    const showSnoozed = searchParams.get("show_snoozed") === "true"; // show snoozed items

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let query = supabase
      .from("campaign_logs")
      .select(`
        id as log_id,
        org_id,
        campaign_id,
        lead_id,
        assignee_id,
        snoozed_until,
        is_done,
        details,
        created_at as replied_at,
        leads:lead_id(email, first_name, last_name, company),
        campaigns:campaign_id(name as campaign_name)
      `)
      .eq("org_id", org.id)
      .eq("event_type", "reply_detected")
      .eq("is_done", false)
      .order("created_at", { ascending: false })
      .limit(50);

    // Filter snoozed items: only show if snoozed_until is null or <= now
    if (!showSnoozed) {
      query = query.or("snoozed_until.is.null,snoozed_until.lte." + new Date().toISOString());
    }

    // Filter by assignee
    if (assigneeId) {
      query = query.eq("assignee_id", assigneeId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Transform data to match expected format
    const transformed = (data || []).map((row: any) => ({
      log_id: row.log_id,
      org_id: row.org_id,
      campaign_id: row.campaign_id,
      lead_id: row.lead_id,
      assignee_id: row.assignee_id,
      snoozed_until: row.snoozed_until,
      is_done: row.is_done,
      email: row.leads?.email || "",
      first_name: row.leads?.first_name,
      last_name: row.leads?.last_name,
      company: row.leads?.company,
      campaign_name: row.campaigns?.campaign_name || "",
      subject: row.details?.subject || "",
      message: row.details?.snippet || row.details?.summary || "",
      from_email: row.details?.from_email || "",
      classification: row.details?.classification,
      summary: row.details?.summary,
      replied_at: row.replied_at,
    }));

    return NextResponse.json(transformed, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
