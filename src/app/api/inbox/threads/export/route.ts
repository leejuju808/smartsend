import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

function toCSV(rows: any[]) {
  const hdr = ["thread_id","first_name","last_name","email","company","domain","label","intent","replied_at"];
  const lines = [hdr.join(",")];
  for (const r of rows) {
    const lead = r.leads || {};
    const vals = [
      r.id, lead.first_name||"", lead.last_name||"", lead.email||"",
      lead.company||"", lead.domain||"",
      r.last_ai_label||"", r.last_ai_intent||"", r.replied_at||""
    ].map(v => `"${String(v).replace(/"/g,'""')}"`);
    lines.push(vals.join(","));
  }
  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { thread_ids } = await req.json();
  if (!Array.isArray(thread_ids) || thread_ids.length === 0) {
    return NextResponse.json({ error: "thread_ids required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("inbox_threads")
    .select("id, last_ai_label, last_ai_intent, replied_at, leads:lead_id (first_name,last_name,email,company,domain)")
    .in("id", thread_ids)
    .eq("user_id", user.id); // Security: only export own threads

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const csv = toCSV(data || []);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="inbox_export_${new Date().toISOString().slice(0,10)}.csv"`
    }
  });
}



