import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: segment, error } = await supabase
    .from("segments")
    .select("id, account_id")
    .eq("id", params.id)
    .single();

  if (error || !segment) {
    return new Response("Not found", { status: 404 });
  }

  await supabase.rpc("recompute_segment", { p_segment_id: segment.id });
  await supabase.rpc("recompute_scores", {
    p_account_id: segment.account_id,
    p_segment_id: segment.id,
  });

  return Response.json({ ok: true });
}

