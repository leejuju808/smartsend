import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(_req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase
    .from("v_suppression_export")
    .select("email, reason, last_seen")
    .limit(50000);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const header = "email,reason,last_seen\n";
  const body = (data ?? [])
    .map(r => `${r.email},${r.reason},${new Date(r.last_seen).toISOString()}`)
    .join("\n");
  const csv = header + body;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="suppressed_${new Date().toISOString().slice(0,10)}.csv"`
    }
  });
}


