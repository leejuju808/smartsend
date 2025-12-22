import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";

const q = z.object({
  queueId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(500).optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = q.safeParse({
    queueId: url.searchParams.get("queueId") ?? undefined,
    leadId: url.searchParams.get("leadId") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Invalid query" }, { status: 400 });

  const { queueId, leadId, limit = 100 } = parsed.data;
  const supabase = createServiceClient();

  let qy = supabase
    .from("campaign_logs_view")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (queueId) qy = qy.eq("meta->>queue_id", queueId);
  if (leadId) qy = qy.eq("lead_id", leadId);

  const { data, error } = await qy;
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, rows: data ?? [] });
}


