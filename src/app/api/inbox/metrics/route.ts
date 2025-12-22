import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getActiveOrg } from "@/lib/org";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  try {
    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sb = createSupabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const now = new Date().toISOString();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // My Inbox: replies where assignee_id = me and (snoozed_until is null or <= now)
    const { count: myInboxCount } = await supa
      .from("campaign_logs")
      .select("*", { count: "exact", head: true })
      .eq("org_id", org.id)
      .eq("event_type", "reply_detected")
      .eq("is_done", false)
      .eq("assignee_id", user.id)
      .or(`snoozed_until.is.null,snoozed_until.lte.${now}`);

    // Snoozed: replies where snoozed_until > now
    const { count: snoozedCount } = await supa
      .from("campaign_logs")
      .select("*", { count: "exact", head: true })
      .eq("org_id", org.id)
      .eq("event_type", "reply_detected")
      .eq("is_done", false)
      .gt("snoozed_until", now);

    // Tasks Due Today: tasks where status='open' and date(due_at)=current_date
    const { count: tasksDueTodayCount } = await supa
      .from("inbox_tasks")
      .select("*", { count: "exact", head: true })
      .eq("org_id", org.id)
      .eq("status", "open")
      .gte("due_at", todayStart.toISOString())
      .lte("due_at", todayEnd.toISOString());

    return NextResponse.json(
      {
        myInbox: myInboxCount || 0,
        snoozed: snoozedCount || 0,
        tasksDueToday: tasksDueTodayCount || 0,
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

