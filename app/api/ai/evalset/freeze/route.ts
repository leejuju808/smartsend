import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  const { eval_set_id, force_holdout = true } = await req.json();
  if (!eval_set_id) {
    return Response.json({ error: "eval_set_id required" }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const { error } = await supabase.rpc("freeze_eval_set", {
    _eval_set_id: eval_set_id,
    _force_holdout: force_holdout,
  });

  if (error) {
    return Response.json({ error }, { status: 400 });
  }

  return Response.json({ ok: true });
}
















