import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json([], { status: 200 });

  const { searchParams } = new URL(req.url);
  const intentFilter = searchParams.get("intent"); // hot|warm|question|not_interested
  const stageFilter = searchParams.get("stage");   // pipeline stage
  const unreadOnly = searchParams.get("unread") === "1";

  let query = supabase
    .from("email_threads")
    .select(`
      id,
      lead_id,
      primary_email,
      subject,
      last_message_at,
      last_intent,
      unread_count,
      leads (
        first_name,
        pipeline_stage,
        job_health_score
      ),
      job_value_estimates (
        base_amount
      )
    `)
    .eq("user_id", user.id)
    .order("last_message_at", { ascending: false });

  if (unreadOnly) {
    query = query.gt("unread_count", 0);
  }

  if (intentFilter && intentFilter !== "all") {
    query = query.eq("last_intent", intentFilter);
  }

  // Stage filter uses join; easiest is to filter client-side OR add a view later.
  const { data, error } = await query;

  if (error) {
    console.error("threads fetch error:", error);
    return NextResponse.json([], { status: 200 });
  }

  let threads = data ?? [];

  if (stageFilter && stageFilter !== "all") {
    threads = threads.filter((t: any) => t.leads?.pipeline_stage === stageFilter);
  }

  return NextResponse.json(threads);
}
