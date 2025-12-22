import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = params.id;

  async function countStatus(status: string) {
    const { count, error } = await supabase
      .from("campaign_recipients_new")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id)
      .eq("user_id", user!.id)
      .eq("status", status);
    if (error) throw error;
    return count || 0;
  }

  const statuses = ["pending","suppressed","sent","failed","cancelled","skipped"];
  const results = await Promise.all(statuses.map(s => countStatus(s)));
  const [pending, suppressed, sent, failed, cancelled, skipped] = results;

  const { data: c } = await supabase
    .from("campaigns_new")
    .select("total_recipients,status")
    .eq("id", id)
    .eq("user_id", user!.id)
    .maybeSingle();
  
  const total = c?.total_recipients ?? (pending + suppressed + sent + failed + cancelled + skipped);

  return NextResponse.json({
    total, pending, suppressed, sent, failed, cancelled, skipped, status: c?.status ?? "unknown"
  });
} 