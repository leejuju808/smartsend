import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getActiveOrg } from "@/lib/org";

/**
 * GET /api/settings/followup/events
 * List follow-up events (execution logs) for the current organization
 */
export async function GET(req: NextRequest) {
  try {
    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const ruleId = searchParams.get("rule_id");
    const contactId = searchParams.get("contact_id");
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = parseInt(searchParams.get("offset") || "0");

    let query = supabase
      .from("follow_up_events")
      .select(
        `
        *,
        follow_up_rules (
          id,
          name,
          trigger_type,
          action_type
        )
      `
      )
      .eq("org_id", org.id)
      .order("executed_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (ruleId) {
      query = query.eq("rule_id", ruleId);
    }

    if (contactId) {
      query = query.eq("contact_id", contactId);
    }

    const { data: events, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: events });
  } catch (error: any) {
    console.error("Error fetching follow-up events:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





























































