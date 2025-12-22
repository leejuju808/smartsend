import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: sets, error: setsErr } = await supabase
    .from("ai_eval_sets")
    .select("id,name,is_frozen,created_at,notes")
    .order("created_at", { ascending: false });

  if (setsErr) {
    return Response.json({ error: setsErr }, { status: 400 });
  }

  const { data: leakRows, error: leakErr } = await supabase
    .from("ai_eval_leakage")
    .select("eval_set_id");

  if (leakErr) {
    return Response.json({ error: leakErr }, { status: 400 });
  }

  const leaks = (leakRows ?? []).reduce<Record<string, number>>((acc, row: any) => {
    const id = row.eval_set_id as string | null;
    if (!id) return acc;
    acc[id] = (acc[id] ?? 0) + 1;
    return acc;
  }, {});

  return Response.json({ sets: sets ?? [], leaks });
}
















