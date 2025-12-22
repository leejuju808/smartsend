export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { parse } from "csv-parse/sync";
import { renderSubjectAndHtml } from "@/lib/renderTemplate";

type Row = Record<string, string>;

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: u, error: uErr } = await supabase.auth.getUser();
  if (uErr || !u?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const workspace_id = u.user.id;

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const campaignId = (form.get("campaignId") as string) || null;
  const templateId = (form.get("templateId") as string) || null;
  const scheduledFor = (form.get("scheduledFor") as string) || undefined;
  const maxAttempts = Number(form.get("maxAttempts") || 5);

  if (!file) return NextResponse.json({ ok: false, error: "file required" }, { status: 400 });

  // Validate campaign (and pause guard) if provided
  if (campaignId) {
    const { data: c } = await supabase.from("campaigns").select("id,workspace_id,status").eq("id", campaignId).single();
    if (!c || c.workspace_id !== workspace_id) return NextResponse.json({ ok: false, error: "Invalid campaign" }, { status: 400 });
    if (c.status !== "active") return NextResponse.json({ ok: false, error: `Campaign is ${c.status}` }, { status: 409 });
  }

  // Validate template if provided
  let template: any = null;
  if (templateId) {
    const { data: t } = await supabase.from("templates")
      .select("id,workspace_id,status,name,subject_tpl,html_tpl")
      .eq("id", templateId).single();
    if (!t || t.workspace_id !== workspace_id) return NextResponse.json({ ok: false, error: "Invalid template" }, { status: 400 });
    if (t.status !== "active") return NextResponse.json({ ok: false, error: "Template is archived" }, { status: 409 });
    template = t;
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let rows: Row[];
  try {
    rows = parse(buf, { columns: true, skip_empty_lines: true, trim: true }) as Row[];
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "CSV parse failed: " + (e?.message || e) }, { status: 400 });
  }

  if (!rows.length) return NextResponse.json({ ok: false, error: "No rows" }, { status: 400 });
  if (!("to" in rows[0])) return NextResponse.json({ ok: false, error: "CSV must include a 'to' column" }, { status: 400 });

  // Create import record
  const { data: imp, error: impErr } = await supabase.from("email_imports").insert({
    workspace_id, campaign_id: campaignId, template_id: templateId, filename: file.name, total_rows: rows.length
  }).select("*").single();
  if (impErr || !imp) return NextResponse.json({ ok: false, error: impErr?.message || "import create failed" }, { status: 500 });

  let enqueued = 0;
  let failed = 0;
  const failures: any[] = [];

  // Prepare inserts in chunks
  const CHUNK_SIZE = 500;
  for (const batch of chunk(rows, CHUNK_SIZE)) {
    const toInsert: any[] = [];

    for (let i = 0; i < batch.length; i++) {
      const r = batch[i];
      const to = (r.to || "").trim();
      if (!to || !to.includes("@")) {
        failed++;
        failures.push({ row_number: enqueued + failed, to_email: to, error: "invalid to", vars: r });
        continue;
      }

      // Subject/html: render from template if provided; else raw from CSV (subject/html columns)
      let subject = (r.subject || "").trim();
      let html = (r.html || "").trim();

      if (template) {
        const vars = { ...r };
        const rendered = renderSubjectAndHtml(template.subject_tpl, template.html_tpl, vars);
        subject = rendered.subject;
        html = rendered.html;
      } else {
        if (!subject || !html) {
          failed++;
          failures.push({ row_number: enqueued + failed, to_email: to, subject, error: "missing subject/html without template", vars: r });
          continue;
        }
      }

      toInsert.push({
        workspace_id,
        to_email: to,
        subject,
        body_html: html,
        status: "queued",
        scheduled_for: scheduledFor ?? new Date().toISOString(),
        max_attempts: maxAttempts,
        campaign_id: campaignId,
        template_id: templateId,
        render_vars: template ? r : null
      });
    }

    if (toInsert.length) {
      const { error: insErr } = await supabase.from("email_jobs").insert(toInsert);
      if (insErr) {
        // If a whole chunk fails, mark each row as failed
        failed += toInsert.length;
        for (const item of toInsert) {
          failures.push({ row_number: enqueued + failed, to_email: item.to_email, subject: item.subject, error: "insert failed: " + insErr.message, vars: item.render_vars });
        }
      } else {
        enqueued += toInsert.length;
      }
    }

    // Periodically persist progress
    await supabase.from("email_imports").update({
      enqueued_rows: enqueued,
      failed_rows: failed
    }).eq("id", imp.id);
  }

  // Save failure details (in chunks)
  for (const fchunk of chunk(failures, 500)) {
    await supabase.from("email_import_failures").insert(
      fchunk.map(f => ({ import_id: imp.id, ...f }))
    );
  }

  // Finalize
  await supabase.from("email_imports").update({
    enqueued_rows: enqueued,
    failed_rows: failed,
    status: failed > 0 && enqueued === 0 ? "failed" : "completed",
    error: failed > 0 && enqueued === 0 ? "All rows failed" : null,
    completed_at: new Date().toISOString()
  }).eq("id", imp.id);

  return NextResponse.json({ ok: true, importId: imp.id, total: rows.length, enqueued, failed });
}