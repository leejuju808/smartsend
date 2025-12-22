import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; stepNo: string } },
) {
  const supabase = createRouteHandlerClient({ cookies });
  const { tone = "professional", goal = "nudge", length = "short" } =
    await req.json().catch(() => ({}));

  const { data: vars, error } = await supabase
    .from("campaign_step_variants")
    .select("id,subject_template,body_html_template")
    .eq("campaign_id", params.id)
    .eq("step_no", Number(params.stepNo))
    .eq("enabled", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: any[] = [];

  for (const v of vars ?? []) {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/rewrite`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-cron-secret": process.env.NEXT_PUBLIC_CRON_SECRET ?? "",
        },
        body: JSON.stringify({
          subject: v.subject_template,
          body_html: v.body_html_template,
          tone,
          goal,
          length,
          variants: 1,
        }),
      },
    );

    const j = await res.json().catch(() => ({}));

    if (res.ok && j.variants?.[0]) {
      const nv = j.variants[0];
      await supabase
        .from("campaign_step_variants")
        .update({
          subject_template: nv.subject,
          body_html_template: nv.html,
        })
        .eq("id", v.id);
      results.push({ id: v.id, ok: true });
    } else {
      results.push({ id: v.id, ok: false, error: j?.error });
    }
  }

  return NextResponse.json({ ok: true, results });
}



