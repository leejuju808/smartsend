import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function ymdLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type LostContact = {
  id: string;
  display_name: string;
  email: string | null;
  company: string | null;
  estimated_job_value: number | null;
  updated_at: string | null;
};

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "no_workspace" }, { status: 404 });
  }

  // Use service client for cross-table metrics (keeps this endpoint reliable).
  const admin = createServiceClient();
  const now = new Date();

  // A) Outreach activity today (what happened while you worked)
  const { data: sendsToday, error: sendsErr } = await admin
    .from("send_queue")
    .select("id, lead_id, created_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "sent")
    .gte("created_at", startOfTodayIso())
    .order("created_at", { ascending: false })
    .limit(2000);

  if (sendsErr) {
    return NextResponse.json({ error: "send_queue_read_failed", details: sendsErr.message }, { status: 500 });
  }

  const uniqueLeads = new Set<string>();
  for (const row of sendsToday || []) {
    const lid = String((row as any).lead_id || "").trim();
    if (lid) uniqueLeads.add(lid);
  }

  const outreachSendsToday = (sendsToday || []).length;
  const homeownersContactedToday = uniqueLeads.size;
  const silence = outreachSendsToday === 0;

  // B) "While you were on a job today" boolean (crew_daily_logs -> roofing_jobs -> workspace)
  const todayStr = ymdLocal();
  const { data: dailyLogs } = await admin
    .from("crew_daily_logs")
    .select("job_id,status,date")
    .eq("date", todayStr)
    .eq("status", "in_progress")
    .limit(50);

  let onJobToday = false;
  const jobIds = (dailyLogs || [])
    .map((r: any) => String(r.job_id || "").trim())
    .filter(Boolean);

  if (jobIds.length > 0) {
    const { data: jobs } = await admin
      .from("roofing_jobs")
      .select("id,workspace_id")
      .in("id", jobIds)
      .eq("workspace_id", workspaceId)
      .limit(1);
    onJobToday = (jobs || []).length > 0;
  }

  // C) Hot/Warm idle risk (contact pipeline view + contacts value)
  // We purposely compute from lead_pipeline_view because it's stable across schema drift.
  const { data: pipelineRows, error: pipeErr } = await admin
    .from("lead_pipeline_view")
    .select("contact_id,effective_stage,last_intent_at,account_id")
    .eq("account_id", workspaceId)
    .in("effective_stage", ["HOT", "WARM"])
    .limit(500);

  if (pipeErr) {
    return NextResponse.json({ error: "pipeline_read_failed", details: pipeErr.message }, { status: 500 });
  }

  const contactIds = (pipelineRows || [])
    .map((r: any) => String(r.contact_id || "").trim())
    .filter(Boolean);

  const contactById = new Map<
    string,
    { estimated_job_value: number | null; updated_at: string | null; lead_status: string | null; display_name: string }
  >();

  if (contactIds.length > 0) {
    const { data: contacts, error: contactsErr } = await admin
      .from("contacts")
      .select("id,first_name,last_name,name,company,email,estimated_job_value,updated_at,lead_status")
      .in("id", contactIds)
      .limit(500);

    if (contactsErr) {
      return NextResponse.json({ error: "contacts_read_failed", details: contactsErr.message }, { status: 500 });
    }

    for (const c of contacts || []) {
      const id = String((c as any).id);
      const display =
        String(
          ((c as any).first_name || "").trim() || ((c as any).last_name || "").trim()
            ? `${String((c as any).first_name || "")} ${String((c as any).last_name || "")}`.trim()
            : ((c as any).name || (c as any).company || (c as any).email || "Homeowner")
        ) || "Homeowner";
      contactById.set(id, {
        estimated_job_value:
          (c as any).estimated_job_value == null ? null : Number((c as any).estimated_job_value || 0),
        updated_at: (c as any).updated_at || null,
        lead_status: (c as any).lead_status || null,
        display_name: display,
      });
    }
  }

  const idleThresholdMs = 10 * 60 * 1000; // 10 minutes
  const idle = [];

  for (const r of pipelineRows || []) {
    const contactId = String((r as any).contact_id || "").trim();
    if (!contactId) continue;
    const c = contactById.get(contactId);
    if (!c) continue;
    if (String(c.lead_status || "OPEN").toUpperCase() !== "OPEN") continue;

    const lastIntentAt = (r as any).last_intent_at ? new Date(String((r as any).last_intent_at)) : null;
    const updatedAt = c.updated_at ? new Date(String(c.updated_at)) : null;
    const lastTouch = new Date(
      Math.max(lastIntentAt?.getTime() || 0, updatedAt?.getTime() || 0) || 0
    );
    if (!Number.isFinite(lastTouch.getTime()) || lastTouch.getTime() <= 0) continue;

    const idleMs = now.getTime() - lastTouch.getTime();
    if (idleMs < idleThresholdMs) continue;

    const value =
      c.estimated_job_value && Number.isFinite(c.estimated_job_value) && c.estimated_job_value > 0
        ? c.estimated_job_value
        : 12000; // sensible default roof ticket

    idle.push({
      contact_id: contactId,
      display_name: c.display_name,
      last_touch_at: lastTouch.toISOString(),
      estimated_value: value,
      idle_seconds: Math.floor(idleMs / 1000),
    });
  }

  idle.sort((a, b) => b.idle_seconds - a.idle_seconds);

  const idleLeadCount = idle.length;
  const idleBaseValue = idle.reduce((sum, r) => sum + r.estimated_value, 0);
  const idleStartedAt = idleLeadCount > 0 ? idle[idleLeadCount - 1].last_touch_at : null;

  // D) Lost jobs resurfaced as "re-engage opportunities" after 30d
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: lostRows, error: lostErr, count: lostCount } = await admin
    .from("contacts")
    .select("id,first_name,last_name,name,company,email,estimated_job_value,updated_at", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .eq("lead_status", "LOST")
    .lte("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(5);

  if (lostErr) {
    return NextResponse.json({ error: "lost_contacts_read_failed", details: lostErr.message }, { status: 500 });
  }

  const lostList: LostContact[] = (lostRows || []).map((c: any) => {
    const display =
      String(
        ((c as any).first_name || "").trim() || ((c as any).last_name || "").trim()
          ? `${String((c as any).first_name || "")} ${String((c as any).last_name || "")}`.trim()
          : ((c as any).name || (c as any).company || (c as any).email || "Homeowner")
      ) || "Homeowner";
    return {
      id: String((c as any).id),
      display_name: display,
      email: (c as any).email || null,
      company: (c as any).company || null,
      estimated_job_value: (c as any).estimated_job_value == null ? null : Number((c as any).estimated_job_value || 0),
      updated_at: (c as any).updated_at || null,
    };
  });

  // E) Campaign pause state (for one-tap recovery messaging)
  const { count: pausedCampaignsCount } = await admin
    .from("campaigns")
    .select("id", { head: true, count: "exact" })
    .eq("workspace_id", workspaceId)
    .or("paused.eq.true,status.eq.paused");

  return NextResponse.json({
    now: now.toISOString(),
    workspace_id: workspaceId,
    outreach_sends_today: outreachSendsToday,
    homeowners_contacted_today: homeownersContactedToday,
    on_job_today: onJobToday,
    silence,
    paused_campaigns_count: pausedCampaignsCount || 0,
    idle_hot_warm: {
      lead_count: idleLeadCount,
      base_value: idleBaseValue,
      started_at: idleStartedAt,
      top: idle.slice(0, 5),
    },
    reengage_opportunities: {
      count: lostCount || 0,
      top: lostList,
    },
  });
}








