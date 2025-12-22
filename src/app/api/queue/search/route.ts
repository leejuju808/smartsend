import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";

const q = z.object({
  status: z.enum(["queued", "sending", "sent", "failed", "replied", "canceled"]).optional(),
  campaignId: z.string().optional(),
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(1000).optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = q.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    campaignId: url.searchParams.get("campaignId") ?? undefined,
    start: url.searchParams.get("start") ?? undefined,
    end: url.searchParams.get("end") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success)
    return NextResponse.json({ ok: false, message: "Invalid query" }, { status: 400 });

  const { status, campaignId, start, end, limit = 200 } = parsed.data;
  const supabase = createServiceClient();

  // Use rich view for joins to lead/campaign and include last_error
  let qy = supabase
    .from("send_queue_view")
    .select("id,status,attempt_count,max_attempts,updated_at,campaign_id,campaign_name,lead_id,lead_email,last_error")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (status) qy = qy.eq("status", status);
  if (campaignId) qy = qy.eq("campaign_id", campaignId);
  if (start) qy = qy.gte("updated_at", start);
  if (end) qy = qy.lte("updated_at", end);

  const { data, error } = await qy;
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, rows: data ?? [] });
}


