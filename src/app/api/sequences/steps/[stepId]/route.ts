import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { hasUnresolvedTokens } from "@/src/lib/templating";

function getUserId(req: Request) { return new URL(req.url).searchParams.get("userId"); }

export async function PATCH(req: Request, { params }: { params: { stepId: string } }) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await req.json().catch(()=> ({}));
  if (payload.body && !/%UNSUB%/i.test(payload.body)) {
    return NextResponse.json({ error: "Body must include %UNSUB%" }, { status: 400 });
  }
  const unresolved = (payload.subject && hasUnresolvedTokens(payload.subject)) || (payload.body && hasUnresolvedTokens(payload.body));
  if (unresolved) {
    return NextResponse.json({ error: "Body must include %UNSUB%. Also found unresolved {{tokens}} — consider adding fallbacks like {{name|there}}." }, { status: 400 });
  }

  // Ensure ownership via join
  const { data: step } = await supabaseAdmin
    .from("sequence_steps").select("id, sequence_id").eq("id", params.stepId).single();
  if (!step) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: seq } = await supabaseAdmin
    .from("sequences").select("owner").eq("id", step.sequence_id).single();
  if (!seq || seq.owner !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("sequence_steps").update(payload).eq("id", params.stepId)
    .select("id,step_no,subject,body,delay_days").single();

  if (error) return NextResponse.json({ error: String(error) }, { status: 500 });
  return NextResponse.json({ ok: true, step: data });
}

export async function DELETE(req: Request, { params }: { params: { stepId: string } }) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Ownership check
  const { data: step } = await supabaseAdmin.from("sequence_steps").select("id, sequence_id").eq("id", params.stepId).single();
  if (!step) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: seq } = await supabaseAdmin.from("sequences").select("owner").eq("id", step.sequence_id).single();
  if (!seq || seq.owner !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabaseAdmin.from("sequence_steps").delete().eq("id", params.stepId);
  if (error) return NextResponse.json({ error: String(error) }, { status: 500 });
  return NextResponse.json({ ok: true });
}

