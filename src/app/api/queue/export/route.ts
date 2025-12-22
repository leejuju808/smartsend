import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";

const q = z.object({
  status: z.enum(["queued","sending","sent","failed","replied","canceled"]).optional(),
  campaignId: z.string().optional(),
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(10000).optional()
});

function toCsv(rows: any[]) {
  const header = [
    "id","status","attempt_count","max_attempts","updated_at",
    "campaign_id","campaign_name","lead_email"
  ];
  const lines = rows.map(r => [
    r.id, r.status, r.attempt_count, r.max_attempts, r.updated_at,
    r.campaign_id, r.campaign_name, r.lead_email
  ].map(v => `"${String(v ?? "").replaceAll(`"`,`""`)}"`).join(","));
  return [header.join(","), ...lines].join("\n");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = q.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    campaignId: url.searchParams.get("campaignId") ?? undefined,
    start: url.searchParams.get("start") ?? undefined,
    end: url.searchParams.get("end") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined
  });
  if (!parsed.success) {
    return new NextResponse("Invalid query", { status: 400 });
  }
  const { status, campaignId, start, end, limit = 5000 } = parsed.data;

  const supabase = createServiceClient();
  let qy = supabase
    .from("send_queue_view")
    .select("id,status,attempt_count,max_attempts,updated_at,campaign_id,campaign_name,lead_email")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (status) qy = qy.eq("status", status);
  if (campaignId) qy = qy.eq("campaign_id", campaignId);
  if (start) qy = qy.gte("updated_at", start);
  if (end) qy = qy.lte("updated_at", end);

  const { data, error } = await qy;
  if (error) return new NextResponse(error.message, { status: 500 });

  const csv = toCsv(data ?? []);
  const filename = `queue_export_${new Date().toISOString().slice(0,10)}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}


