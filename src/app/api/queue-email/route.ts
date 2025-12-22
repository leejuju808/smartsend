import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { renderSubjectAndHtml } from "@/lib/renderTemplate";
import { validateNoUnrenderedTags } from "@/lib/merge-tags";

export async function POST(req: NextRequest) {
  const supabase = createServerComponentClient({ cookies });
  const body = await req.json();

  const { to, subject, html, scheduledFor, maxAttempts, campaignId, templateId, vars } = body ?? {};

  // Get user/workspace context (adjust to your schema)
  const {
    data: { user },
    error: userErr
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // TODO: map user -> workspace_id properly
  const workspace_id = user.id;

  // Validate campaign ownership + status (if provided)
  if (campaignId) {
    const { data: c, error: cErr } = await supabase
      .from("campaigns")
      .select("id, workspace_id, status")
      .eq("id", campaignId)
      .single();

    if (cErr || !c || c.workspace_id !== workspace_id) {
      return NextResponse.json({ ok: false, error: "Invalid campaign" }, { status: 400 });
    }
    if (c.status !== "active") {
      return NextResponse.json({ ok: false, error: `Campaign is ${c.status}` }, { status: 409 });
    }
  }

  // Render branch: either templateId+vars OR raw subject/html must be provided
  let finalSubject = subject;
  let finalHtml = html;
  let tplId: string | null = null;
  let renderVars: any = null;

  if (templateId) {
    const { data: t, error: tErr } = await supabase
      .from("templates")
      .select("id, workspace_id, status, subject_tpl, html_tpl")
      .eq("id", templateId)
      .single();

    if (tErr || !t || t.workspace_id !== workspace_id)
      return NextResponse.json({ ok: false, error: "Invalid template" }, { status: 400 });
    if (t.status !== "active")
      return NextResponse.json({ ok: false, error: "Template is archived" }, { status: 409 });

    const { subject: rs, html: rh, missing } =
      renderSubjectAndHtml(t.subject_tpl, t.html_tpl, (vars ?? {}) as Record<string, any>);

    // If critical tokens are missing, you might choose to reject; here we allow but include 'missing' hint
    finalSubject = rs;
    finalHtml = rh;
    tplId = t.id;
    renderVars = vars ?? null;
  }

  if (!to || !finalSubject || !finalHtml) {
    return NextResponse.json({ ok: false, error: "Missing to/subject/html" }, { status: 400 });
  }

  // Optional: Validate no unrendered merge tags slipped through
  const tagCheck = validateNoUnrenderedTags(finalSubject, finalHtml);
  if (!tagCheck.valid) {
    return NextResponse.json({ 
      ok: false, 
      error: `Unrendered merge tags detected: ${tagCheck.unrendered.join(", ")}. Please ensure all tags are properly rendered before sending.` 
    }, { status: 400 });
  }

  // Check suppression: exact email or domain
  const emailLc = String(to).toLowerCase();
  const domain = emailLc.split("@")[1];

  const [{ data: byEmail }, { data: byDomain }] = await Promise.all([
    supabase.from("suppressions").select("id").eq("workspace_id", workspace_id).eq("type","email").eq("value", emailLc).maybeSingle(),
    supabase.from("suppressions").select("id").eq("workspace_id", workspace_id).eq("type","domain").eq("value", domain).maybeSingle()
  ]);

  if (byEmail || byDomain) {
    return NextResponse.json({ ok: false, error: "Recipient is unsubscribed/suppressed" }, { status: 409 });
  }

  const { error: insErr } = await supabase.from("email_jobs").insert({
    workspace_id,
    to_email: to,
    subject: finalSubject,
    body_html: finalHtml,
    status: "queued",
    scheduled_for: scheduledFor ?? new Date().toISOString(),
    max_attempts: maxAttempts ?? 5,
    campaign_id: campaignId ?? null,
    template_id: tplId,
    render_vars: renderVars
  });

  if (insErr) {
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}