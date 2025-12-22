import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  let query = supabase
    .from("v_my_queue")
    .select("*")
    .order("last_inbound_at", { ascending: false })
    .limit(200);

  if (q) {
    const like = `%${q}%`;
    query = query.or(
      [
        `lead_name.ilike.${like}`,
        `lead_company.ilike.${like}`,
        `lead_email.ilike.${like}`,
        `id.ilike.${like}`,
      ].join(","),
    );
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: countsData } = await supabase.from("v_my_queue_counts").select("*").maybeSingle();

  return NextResponse.json({
    items: data ?? [],
    counts: countsData ?? null,
  });
}



