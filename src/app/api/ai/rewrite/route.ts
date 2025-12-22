import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rewriteTemplates } from "@/lib/ai/rewrite";

export async function POST(req: Request) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.json();

  const {
    campaign_id,
    step_no,
    base_subject,
    base_body_html,
    variables = [],
    vertical_hint,
    params = {},
  } = body || {};

  if (!campaign_id || !step_no || !base_subject || !base_body_html) {
    return new Response(
      "campaign_id, step_no, base_subject, base_body_html required",
      { status: 400 }
    );
  }

  const { data: me } = await admin.auth.getUser();
  const user_id = me?.user?.id || body.user_id;

  if (!user_id) {
    return new Response("auth required", { status: 401 });
  }

  const rateLimitWindow = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: recent, error: recentError } = await admin
    .from("ai_rewrite_jobs")
    .select("id, created_at")
    .eq("user_id", user_id)
    .gte("created_at", rateLimitWindow);

  if (recentError) {
    return NextResponse.json(
      { error: "rate limit check failed" },
      { status: 500 }
    );
  }

  if ((recent?.length || 0) >= 10) {
    return new Response("rate limited: 10 rewrites per 10 minutes", {
      status: 429,
    });
  }

  try {
    const { variants, raw } = await rewriteTemplates({
      baseSubject: base_subject,
      baseHtml: base_body_html,
      variables,
      verticalHint: vertical_hint,
      params,
    });

    const { data: job, error: insertError } = await admin
      .from("ai_rewrite_jobs")
      .insert({
        user_id,
        campaign_id,
        step_no,
        base_subject,
        base_body_html,
        params,
        outputs: variants,
      })
      .select("id, outputs")
      .single();

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({
      ok: true,
      job_id: job?.id,
      variants: job?.outputs || [],
      raw,
    });
  } catch (e: any) {
    const message = e?.message || String(e);

    await admin.from("ai_rewrite_jobs").insert({
      user_id,
      campaign_id,
      step_no,
      base_subject,
      base_body_html,
      params,
      error: message,
    });

    return new Response("rewrite failed", { status: 500 });
  }
}
