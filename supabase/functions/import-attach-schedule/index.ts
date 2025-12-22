// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions@1.4.0/types";
import { createClient } from "jsr:@supabase/supabase-js";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Req = {
  job_id: string;
  user_id: string;
  campaign_id: string;
  step_no?: number;
  start_at_iso?: string;
  per_min?: number;
  jitter_seconds?: number;
  business_hours?: boolean;
  window_start?: string;
  window_end?: string;
  days?: number[];
  skip_holidays?: boolean;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const sb = createClient(SB_URL, SRK, { auth: { persistSession: false } });

  try {
    const body = (await req.json()) as Req;

    if (!body.job_id || !body.user_id || !body.campaign_id) {
      throw new Error("Missing required parameters");
    }

    const stepNo = body.step_no ?? 1;
    const perMin = body.per_min ?? 20;
    const jitter = body.jitter_seconds ?? 45;
    const business = body.business_hours ?? false;
    const wStart = body.window_start ?? "08:00";
    const wEnd = body.window_end ?? "17:00";
    const days = Array.isArray(body.days) && body.days.length > 0 ? body.days : [1, 2, 3, 4, 5];
    const skipHolidays = body.skip_holidays ?? true;

    const { data: rows, error: rowsErr } = await sb
      .from("import_rows")
      .select("normalized")
      .eq("job_id", body.job_id)
      .eq("valid", true)
      .limit(10000);

    if (rowsErr) throw rowsErr;

    const emailSet = new Set<string>();
    for (const row of rows ?? []) {
      const email = row?.normalized?.email as string | undefined;
      if (email) emailSet.add(email);
    }

    if (emailSet.size === 0) {
      return new Response(JSON.stringify({ ok: true, attached: 0, scheduled: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const emails = Array.from(emailSet);
    const leadIdSet = new Set<string>();

    for (let i = 0; i < emails.length; i += 500) {
      const chunk = emails.slice(i, i + 500);
      const { data: leads, error: leadsErr } = await sb
        .from("leads")
        .select("id,email")
        .eq("user_id", body.user_id)
        .in("email", chunk);

      if (leadsErr) throw leadsErr;
      for (const lead of leads ?? []) {
        if (lead?.id) {
          leadIdSet.add(lead.id);
        }
      }
    }

    const leadIds = Array.from(leadIdSet);

    let attached = 0;
    if (leadIds.length > 0) {
      const { data: attachCount, error: attachErr } = await sb.rpc("attach_leads_to_campaign", {
        p_campaign: body.campaign_id,
        p_leads: leadIds,
      });
      if (attachErr) throw attachErr;
      attached = attachCount ?? 0;
    }

    const startAtIso = body.start_at_iso
      ? new Date(body.start_at_iso).toISOString()
      : new Date(Date.now() + 10 * 60 * 1000).toISOString();

    let scheduled = 0;

    if (leadIds.length > 0) {
      const { data: prefsRow } = await sb
        .from("campaign_sending_prefs")
        .select("tz")
        .eq("campaign_id", body.campaign_id)
        .maybeSingle();

      await sb
        .from("campaigns")
        .update({
          send_tz: prefsRow?.tz ?? "America/Los_Angeles",
          window_start: wStart,
          window_end: wEnd,
          business_days_only: business,
        })
        .eq("id", body.campaign_id);
    }

    if (leadIds.length > 0) {
      const { data: scheduleCount, error: scheduleErr } = await sb.rpc("enqueue_step_for_leads", {
        p_campaign: body.campaign_id,
        p_step_no: stepNo,
        p_leads: leadIds,
        p_start_at: startAtIso,
        p_per_min: perMin,
        p_jitter_seconds: jitter,
        p_business_hours: business,
        p_window_start: wStart,
        p_window_end: wEnd,
        p_days: days,
        p_skip_holidays: skipHolidays,
      });
      if (scheduleErr) throw scheduleErr;
      scheduled = scheduleCount ?? 0;
    }

    const { data: jobMeta } = await sb
      .from("import_jobs")
      .select("meta")
      .eq("id", body.job_id)
      .maybeSingle();

    const existingMeta = (jobMeta?.meta as Record<string, any> | null) ?? {};

    const { error: jobUpdateErr } = await sb
      .from("import_jobs")
      .update({
        status: "done",
        meta: {
          ...existingMeta,
          attached,
          scheduled,
          step_no: stepNo,
          start_at: startAtIso,
          per_min: perMin,
          jitter_seconds: jitter,
          business_hours: business,
          window_start: wStart,
          window_end: wEnd,
          days,
          skip_holidays: skipHolidays,
        },
      })
      .eq("id", body.job_id);

    if (jobUpdateErr) throw jobUpdateErr;

    return new Response(JSON.stringify({ ok: true, attached, scheduled, step_no: stepNo, start_at: startAtIso }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ ok: false, error: String(error?.message ?? error) }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});

