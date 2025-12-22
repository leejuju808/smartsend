import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  const { batch_size = 10, strategy = "quota_mix" } = await req.json();
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase.rpc("allocate_label_batch", {
    _assigned_to: user?.id ?? null,
    _batch_size: batch_size,
    _strategy: strategy,
  });

  if (error) {
    return Response.json({ error }, { status: 400 });
  }

  const ids = (data ?? []).map((x: any) => x);

  if (!ids.length) {
    return Response.json([]);
  }

  const { data: items, error: qErr } = await supabase
    .from("ai_live_inferences")
    .select("id,created_at,text_preview,predicted_label,score,threshold")
    .in("id", ids);

  if (qErr) {
    return Response.json({ error: qErr }, { status: 400 });
  }

  return Response.json(items);
}
















