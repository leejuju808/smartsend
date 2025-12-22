import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { assertViewer } from "@/lib/acl";

export async function GET(
  _req: NextRequest,
  { params }: { params: { campaignId: string } }
) {
  try {
    await assertViewer(params.campaignId);
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase
    .from("send_queue")
    .select(
      "id,status,provider,account_id,subject,queued_at,next_attempt_at,fail_count,last_error,backoff_exp,last_status"
    )
    .eq("campaign_id", params.campaignId)
    .order("next_attempt_at", { ascending: true })
    .limit(200);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [] });
}



