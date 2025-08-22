import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";

/** Replace with real auth */
function getUserId(req: Request) {
  const url = new URL(req.url);
  return url.searchParams.get("userId");
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [seq, steps, metrics] = await Promise.all([
    supabaseAdmin.from("sequences")
      .select("id,name,status,stop_on_reply,created_at")
      .eq("id", params.id).eq("owner", userId).single(),
    supabaseAdmin.from("sequence_steps")
      .select("id,step_no,subject,body,delay_days")
      .eq("sequence_id", params.id).order("step_no", { ascending: true }),
    supabaseAdmin.rpc("metrics_for_sequence_steps", { p_owner: userId, p_sequence: params.id })
  ]);

  if (seq.error || !seq.data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    sequence: seq.data,
    steps: steps.data ?? [],
    metrics: (metrics.data ?? []) as Array<{step_no:number;sent:number;open:number;reply:number}>
  });
}

