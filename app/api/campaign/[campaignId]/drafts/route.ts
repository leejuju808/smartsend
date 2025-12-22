import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { assertViewer } from "@/lib/acl";

export async function GET(req: NextRequest, { params }: { params: { campaignId: string } }) {
  try {
    await assertViewer(params.campaignId);
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const threadId = (url.searchParams.get("threadId") || "").trim();

  let query = supabase
    .from("send_queue")
    .select(
      "id,lead_id,thread_id,subject,body,headers,queued_at,updated_at,provider,account_id,source"
    )
    .eq("campaign_id", params.campaignId)
    .eq("status", "draft")
    .order("updated_at", { ascending: false })
    .limit(threadId ? 20 : 200);

  if (threadId) {
    query = query.eq("thread_id", threadId);
  }

  if (q) {
    const like = `%${q.replace(/[%_,]/g, (char) => `\\${char}`)}%`;
    const orFilters = [
      `subject.ilike.${like}`,
      `body.ilike.${like}`,
      `headers->>to.ilike.${like}`,
    ].join(",");
    query = query.or(orFilters);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

