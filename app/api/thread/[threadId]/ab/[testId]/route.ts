import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(_: NextRequest, { params }: { params: { threadId: string; testId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: t } = await supabase
    .from("inbox_threads")
    .select("id, campaign_id, lead_id")
    .eq("id", params.threadId)
    .maybeSingle();
  if (!t) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const { data: assignId, error: aerr } = await supabase.rpc("assign_ab_variant", {
    p_test: params.testId,
    p_thread: params.threadId,
    p_lead: t.lead_id,
    p_campaign: t.campaign_id,
  });
  if (aerr) {
    return NextResponse.json({ error: aerr.message }, { status: 500 });
  }

  const { data: a } = await supabase
    .from("ab_assignments")
    .select("id, variant_id, test_id, thread_id, campaign_id, lead_id")
    .eq("id", assignId)
    .maybeSingle();

  const { data: v } = await supabase
    .from("ab_variants")
    .select("tag, subject, body_html")
    .eq("id", a?.variant_id)
    .maybeSingle();
  if (!a || !v) {
    return NextResponse.json({ error: "Variant not found" }, { status: 404 });
  }

  // Gather variables
  const { data: varsRow, error: varsError } = await supabase
    .from("v_vars_thread")
    .select("*")
    .eq("thread_id", params.threadId)
    .maybeSingle();
  if (varsError) {
    return NextResponse.json({ error: varsError.message }, { status: 500 });
  }

  const me = await supabase.auth.getUser();
  let senderVars: Record<string, string | null> = {
    sender_name: null,
    sender_email: null,
  };
  if (me.data.user) {
    const { data: senderRow } = await supabase
      .from("v_vars_user")
      .select("*")
      .eq("user_id", me.data.user.id)
      .maybeSingle();
    if (senderRow) {
      senderVars = {
        sender_name: senderRow.sender_name ?? null,
        sender_email: senderRow.sender_email ?? null,
      };
    }
  }

  const vars = { ...(varsRow ?? {}), ...senderVars };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cronSecret = process.env.CRON_SECRET;
  if (!supabaseUrl || !cronSecret) {
    return NextResponse.json({ error: "vars merge config missing" }, { status: 500 });
  }

  const r = await fetch(`${supabaseUrl}/functions/v1/vars-merge`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cron-secret": cronSecret,
    },
    body: JSON.stringify({
      subject: v?.subject ?? "",
      html: v.body_html ?? "",
      vars,
      escape_html: false,
    }),
  });
  if (!r.ok) {
    return NextResponse.json({ error: "vars merge failed" }, { status: 500 });
  }
  const merged = await r.json();

  const { data: draft, error: derr } = await supabase
    .from("reply_drafts")
    .insert({
      campaign_id: t.campaign_id,
      thread_id: t.id,
      lead_id: t.lead_id,
      subject: merged.subject,
      body_html: merged.html,
      source: "ab_test",
    })
    .select("id")
    .maybeSingle();
  if (derr) {
    return NextResponse.json({ error: derr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    assignment_id: assignId,
    draft_id: draft?.id,
    variant: v?.tag ?? "A",
  });
}

