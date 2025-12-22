import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  const { eval_set_id, label, since, until, limit } = await req.json();
  if (!eval_set_id) {
    return Response.json({ error: "eval_set_id required" }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase.rpc("add_to_eval_set", {
    _eval_set_id: eval_set_id,
    _label: label ?? null,
    _since: since ? new Date(since).toISOString() : null,
    _until: until ? new Date(until).toISOString() : null,
    _limit: limit ?? 500,
  });

  if (error) {
    return Response.json({ error }, { status: 400 });
  }

  return Response.json({ ok: true, added: data });
}
















