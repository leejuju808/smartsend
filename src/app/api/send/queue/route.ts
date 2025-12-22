/* Queue messages for a given sequence step, applying suppression guard + templating */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderTemplate } from "@/lib/templates/mustache";

type QueueReq = {
  workspaceId: string;
  campaignId?: string | null;
  sequenceId: string;
  stepOrder: number;
  smtpAccountId: string;
  contactIds?: string[];     // mutually exclusive with emails[]
  emails?: string[];         // raw emails to send to (used when contacts not created)
  scheduleAtISO?: string;    // optional scheduled time
};

function norm(e: string) { return e.trim().toLowerCase(); }
function isValidEmail(e: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(norm(e)); }

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as QueueReq;
    const { workspaceId, campaignId = null, sequenceId, stepOrder, smtpAccountId, contactIds = [], emails = [], scheduleAtISO } = body;

    if (!workspaceId || !sequenceId || typeof stepOrder !== "number" || !smtpAccountId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = createClient();

    // Load step
    const { data: step, error: stErr } = await supabase
      .from("sequence_steps")
      .select("id, subject_template, body_text_template, delay_minutes, sequence_id")
      .eq("sequence_id", sequenceId)
      .eq("step_order", stepOrder)
      .maybeSingle();

    if (stErr || !step) return NextResponse.json({ error: "Sequence step not found" }, { status: 404 });

    // Check send limits - get team_id from workspace or campaign
    let teamId: string | null = null;
    if (campaignId) {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("team_id")
        .eq("id", campaignId)
        .maybeSingle();
      teamId = campaign?.team_id || null;
    }
    
    // If no team_id from campaign, try to get from workspace (assuming workspace_members can link to teams)
    if (!teamId && workspaceId) {
      // Try direct lookup - adjust based on your schema
      const { data: workspace } = await supabase
        .from("workspaces")
        .select("team_id")
        .eq("id", workspaceId)
        .maybeSingle();
      teamId = workspace?.team_id || null;
    }

    if (teamId) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const checkLimitsRes = await fetch(`${supabaseUrl}/functions/v1/checkLimits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ teamId, type: 'send' }),
      });

      const checkLimits = await checkLimitsRes.json();
      if (!checkLimits.allowed) {
        return NextResponse.json({ 
          error: 'Send limit reached. Upgrade to send more emails.',
          upgradeRequired: true 
        }, { status: 403 });
      }
    }

    // Load suppressions
    const { data: supGlobal, error: sgErr } = await supabase
      .from("suppressions")
      .select("email")
      .eq("workspace_id", workspaceId);
    if (sgErr) return NextResponse.json({ error: sgErr.message }, { status: 500 });
    const suppressed = new Set((supGlobal ?? []).map(r => norm(r.email)));

    // Gather recipients
    let recips: { email: string; contact?: any }[] = [];

    if (contactIds.length > 0) {
      const { data: contacts, error: cErr } = await supabase
        .from("contacts").select("id,email,first_name,last_name,company,title,custom")
        .in("id", contactIds);
      if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
      recips = (contacts || []).map(c => ({ email: norm(c.email), contact: c }));
    } else {
      recips = emails.filter(Boolean).map(e => ({ email: norm(e) }));
    }

    // Build message rows, applying suppression + invalid filters + templating
    let skipped_invalid = 0;
    let skipped_suppressed = 0;
    let built = 0;
    const rows: any[] = [];

    for (const r of recips) {
      if (!isValidEmail(r.email)) { skipped_invalid++; continue; }
      if (suppressed.has(r.email)) { skipped_suppressed++; continue; }

      const ctx = {
        email: r.email,
        first_name: r.contact?.first_name,
        last_name: r.contact?.last_name,
        company: r.contact?.company,
        title: r.contact?.title,
        custom: r.contact?.custom || {}
      };

      const subject = renderTemplate(step.subject_template, ctx);
      const body = renderTemplate(step.body_text_template, ctx);

      rows.push({
        workspace_id: workspaceId,
        campaign_id: campaignId,
        sequence_id: sequenceId,
        sequence_step_id: step.id,
        smtp_account_id: smtpAccountId,
        contact_id: r.contact?.id ?? null,
        to_email: r.email,
        subject,
        body_text: body,
        status: "queued",
        scheduled_at: scheduleAtISO ? new Date(scheduleAtISO).toISOString() : new Date(Date.now() + (step.delay_minutes * 60 * 1000)).toISOString()
      });

      built++;
    }

    // Insert in chunks
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 1000) {
      const chunk = rows.slice(i, i + 1000);
      if (!chunk.length) continue;
      const { error: iErr, count } = await supabase.from("messages").insert(chunk, { count: "exact" });
      if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });
      inserted += count || chunk.length;
    }

    return NextResponse.json({
      ok: true,
      counts: { attempted: recips.length, built, inserted, skipped_invalid, skipped_suppressed }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Queue failed" }, { status: 500 });
  }
}