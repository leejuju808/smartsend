import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { getEntitlements } from "@/lib/entitlements";
import { hasUnresolvedTokens } from "@/src/lib/templating";

function getUserId(req: Request) { return new URL(req.url).searchParams.get("userId"); }

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(()=> ({}));
  const { subject, body: html, delay_days, step_no } = body;

  if (!subject || !html || !/%UNSUB%/i.test(html)) {
    return NextResponse.json({ error: "Subject/body required and must include %UNSUB%" }, { status: 400 });
  }
  const unresolved = hasUnresolvedTokens(subject) || hasUnresolvedTokens(html);
  if (unresolved) {
    return NextResponse.json({ error: "Body must include %UNSUB%. Also found unresolved {{tokens}} — consider adding fallbacks like {{name|there}}." }, { status: 400 });
  }

  // Ensure ownership
  const { data: seq } = await supabaseAdmin.from("sequences").select("id").eq("id", params.id).eq("owner", userId).single();
  if (!seq) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // fetch plan + entitlements
  const { data: prof2 } = await supabaseAdmin.from("profiles")
    .select("subscription_status").eq("id", userId).single();
  const ents = getEntitlements(prof2?.subscription_status);

  // count existing steps for this sequence
  const { count: stepCount } = await supabaseAdmin.from("sequence_steps")
    .select("id", { count: "exact", head: true }).eq("sequence_id", params.id);

  if ((stepCount ?? 0) >= ents.max_steps_per_sequence && ents.plan === "free") {
    return NextResponse.json({
      ok: false, code: "limit_steps",
      upgrade_url: "/dashboard/billing/upgrade",
      message: `Free plan allows ${ents.max_steps_per_sequence} steps per sequence. Upgrade for more.`,
    }, { status: 402 });
  }

  let finalStepNo = step_no;
  if (finalStepNo == null) {
    const { data: last } = await supabaseAdmin.from("sequence_steps")
      .select("step_no").eq("sequence_id", params.id).order("step_no", { ascending: false }).limit(1);
    finalStepNo = (last?.[0]?.step_no ?? 0) + 1;
  }

  const { data, error } = await supabaseAdmin.from("sequence_steps").insert({
    sequence_id: params.id, step_no: finalStepNo, subject, body: html, delay_days: Number(delay_days ?? 0)
  }).select("id,step_no,subject,body,delay_days").single();

  if (error) return NextResponse.json({ error: String(error) }, { status: 500 });
  return NextResponse.json({ ok: true, step: data });
}

