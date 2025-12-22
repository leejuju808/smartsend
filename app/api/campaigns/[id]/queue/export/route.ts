import { NextResponse } from "next/server";
import { listQueueItems } from "@/lib/data/queue";

function toCsv(rows: any[]) {
  const headers = ["id","lead_id","status","attempts","variant_key","subject","scheduled_at","next_attempt_at","fail_code","fail_kind","created_at","canceled_at"];
  
  const esc = (v: any) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  };
  
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map(h => esc(r[h as keyof typeof r])).join(","));
  }
  return lines.join("\n");
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const state = (url.searchParams.get("state") ?? "any") as any;
  const q = url.searchParams.get("q") ?? undefined;
  const variant = url.searchParams.get("variant") ?? undefined;
  const attempts = (url.searchParams.get("attempts") ?? "any") as any;

  // fetch up to reasonable limit for support export
  const { rows } = await listQueueItems({
    campaignId: params.id, state, q, variant, attempts, limit: 5000, offset: 0
  });

  const body = toCsv(rows);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="queue_${params.id}.csv"`,
      "Cache-Control": "no-store",
    }
  });
}

