import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

function toCsvRow(vals: (string|number|null|undefined)[]) {
  return vals.map(v => {
    const s = (v ?? "").toString();
    // Escape quotes, wrap if needed
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }).join(",");
}

export async function GET(req: NextRequest, { params }: { params: { id: string }}) {
  const sb = createRouteHandlerClient({ cookies });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new NextResponse("unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const fromStep = Number(searchParams.get("from_step") ?? "1");
  const limit = Number(searchParams.get("limit") ?? "50");

  const { data, error } = await sb.rpc("preview_followups_for_campaign", {
    p_campaign: params.id,
    p_from_step: fromStep,
    p_limit: limit
  });
  if (error) return new NextResponse(error.message, { status: 400 });

  const rows = Array.isArray(data) ? data : [];
  const header = ["lead_id","email","first_name","last_name","company","step_no","subject","scheduled_at"];
  const lines = [toCsvRow(header)];
  for (const r of rows) {
    lines.push(toCsvRow([
      r.lead_id, r.email, r.first_name, r.last_name, r.company,
      r.step_no, r.subject, r.scheduled_at
    ]));
  }
  const csv = lines.join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="dry-run-step${fromStep+1}.csv"`
    }
  });
}
