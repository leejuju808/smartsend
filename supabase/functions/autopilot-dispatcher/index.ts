import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (_req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const nowIso = new Date().toISOString();

    // 1) Pull due autopilot jobs (only approved ones)
    const { data: jobs, error: jobsError } = await supabase
      .from("sdr_autopilot_queue")
      .select("id, lead_id, reply_id, template_key, subject, body, edited_subject, edited_body, scheduled_at, status, review_status")
      .eq("status", "pending")
      .eq("review_status", "approved")
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(100); // reasonable batch size

    if (jobsError) {
      console.error("Error fetching autopilot jobs", jobsError);
      return new Response(
        JSON.stringify({ error: "fetch_jobs_failed", details: jobsError }),
        { status: 500 },
      );
    }

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ message: "no_due_jobs" }),
        { status: 200 },
      );
    }

    // 2.1) Collect org_ids & lead_ids, fetch settings
    const leadIds = jobs.map((j) => j.lead_id);
    const { data: leads } = await supabase
      .from("leads")
      .select("id, org_id, user_id, campaign_id, workspace_id, account_id")
      .in("id", leadIds);

    const leadsById = new Map<string, any>();
    (leads || []).forEach((l) => leadsById.set(l.id, l));

    // Fetch all settings for those orgs
    const orgIds = Array.from(
      new Set(
        (leads || [])
          .map((l) => l.org_id)
          .filter((id) => !!id),
      ),
    );

    const { data: settingsRows } = await supabase
      .from("sdr_settings")
      .select("*")
      .in("org_id", orgIds.length ? orgIds : ["00000000-0000-0000-0000-000000000000"]);

    const settingsByOrg = new Map<string, any>();
    (settingsRows || []).forEach((s) => settingsByOrg.set(s.org_id, s));

    // Helper function to adjust scheduled time to send window
    function adjustToSendWindow(
      iso: string,
      settings: any,
    ): string {
      const d = new Date(iso);

      const startHour = settings?.send_window_start_hour ?? 8;
      const endHour = settings?.send_window_end_hour ?? 17;
      const weekdaysOnly = settings?.weekdays_only ?? true;

      const isWeekend = (day: number) => day === 0 || day === 6; // Sun=0, Sat=6

      let local = new Date(d);

      // If weekend and weekdaysOnly, move to next Monday at startHour
      if (weekdaysOnly && isWeekend(local.getDay())) {
        const daysToAdd = local.getDay() === 6 ? 2 : 1; // Sat->Mon (+2), Sun->Mon (+1)
        local.setDate(local.getDate() + daysToAdd);
        local.setHours(startHour, 0, 0, 0);
        return local.toISOString();
      }

      const hour = local.getHours();
      if (hour < startHour) {
        local.setHours(startHour, 0, 0, 0);
      } else if (hour >= endHour) {
        // move to next day at startHour
        local.setDate(local.getDate() + 1);
        local.setHours(startHour, 0, 0, 0);

        if (weekdaysOnly && isWeekend(local.getDay())) {
          const daysToAdd = local.getDay() === 6 ? 2 : 1;
          local.setDate(local.getDate() + daysToAdd);
          local.setHours(startHour, 0, 0, 0);
        }
      }

      return local.toISOString();
    }

    // 2) For each job, get lead info to determine account_id, campaign_id, and identity_id
    const sendRows: any[] = [];
    const processedJobIds: string[] = [];
    const skippedJobIds: string[] = [];

    for (const job of jobs) {
      // Get lead (already fetched above)
      const lead = leadsById.get(job.lead_id);
      if (!lead) {
        console.error(`Lead not found for job ${job.id}`);
        skippedJobIds.push(job.id);
        continue;
      }

      // Determine account_id (prefer account_id, fallback to user_id)
      const accountId = lead.account_id || lead.user_id;
      if (!accountId) {
        console.error(`No account_id/user_id for lead ${lead.id}`);
        skippedJobIds.push(job.id);
        continue;
      }

      // Get campaign_id (may be null for AI SDR)
      const campaignId = lead.campaign_id;

      // Get an active identity_id for this account
      const { data: identity, error: identityError } = await supabase
        .from("send_identities")
        .select("id")
        .eq("account_id", accountId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (identityError || !identity) {
        console.error(`No active identity found for account ${accountId}`, identityError);
        skippedJobIds.push(job.id);
        continue;
      }

      // Note: send_queue requires campaign_id (NOT NULL constraint)
      // If lead has no campaign_id, we skip this job
      // Consider creating a default "AI SDR" campaign for each account if needed
      if (!campaignId) {
        console.warn(`Job ${job.id} has no campaign_id for lead ${lead.id}, skipping. Consider setting a default campaign for AI SDR.`);
        skippedJobIds.push(job.id);
        continue;
      }

      // Get settings for this org and adjust scheduled_at to send window
      const orgId = lead.org_id || null;
      const settings = orgId ? settingsByOrg.get(orgId) : null;
      const adjustedSchedule = adjustToSendWindow(
        nowIso, // we are dispatching now; re-snap to allowed window
        settings,
      );

      // Use edited values if they exist, otherwise use original
      const finalSubject = job.edited_subject || job.subject;
      const finalBody = job.edited_body || job.body;

      // Build send_queue row
      sendRows.push({
        lead_id: job.lead_id,
        reply_id: job.reply_id,
        account_id: accountId,
        campaign_id: campaignId,
        identity_id: identity.id,
        subject: finalSubject,
        body: finalBody,
        scheduled_at: adjustedSchedule,
        status: "queued",
        source: "ai_sdr",
        autopilot_queue_id: job.id,
        priority: 100, // default priority
      });

      processedJobIds.push(job.id);
    }

    if (sendRows.length === 0) {
      return new Response(
        JSON.stringify({
          message: "no_valid_jobs",
          skipped: skippedJobIds.length,
        }),
        { status: 200 },
      );
    }

    // 3) Insert into send_queue
    const { error: insertError } = await supabase
      .from("send_queue")
      .insert(sendRows);

    if (insertError) {
      console.error("Error inserting into send_queue", insertError);
      return new Response(
        JSON.stringify({ error: "enqueue_failed", details: insertError }),
        { status: 500 },
      );
    }

    // Log autopilot_dispatched events
    const activityRows = jobs
      .filter((job) => processedJobIds.includes(job.id))
      .map((job) => ({
        lead_id: job.lead_id,
        event_type: "autopilot_dispatched",
        source: "ai_sdr",
        related_table: "send_queue",
        related_id: null, // Could be enhanced to link to actual send_queue.id
        payload: {
          autopilot_queue_id: job.id,
          template_key: job.template_key,
          scheduled_at: job.scheduled_at,
        },
      }));

    if (activityRows.length > 0) {
      const { error: activityError } = await supabase
        .from("lead_activity_events")
        .insert(activityRows);

      if (activityError) {
        console.error("Failed to insert autopilot_dispatched events", activityError);
      }
    }

    // 4) Mark autopilot jobs as 'sent' (or 'enqueued')
    if (processedJobIds.length > 0) {
      const { error: updateError } = await supabase
        .from("sdr_autopilot_queue")
        .update({ status: "sent" })
        .in("id", processedJobIds);

      if (updateError) {
        console.error("Error updating autopilot job status", updateError);
        return new Response(
          JSON.stringify({ error: "update_status_failed", details: updateError }),
          { status: 500 },
        );
      }
    }

    return new Response(
      JSON.stringify({
        message: "dispatched",
        count: processedJobIds.length,
        skipped: skippedJobIds.length,
      }),
      { status: 200 },
    );
  } catch (err) {
    console.error("autopilot-dispatcher error", err);
    return new Response(
      JSON.stringify({ error: "unexpected", details: String(err) }),
      { status: 500 },
    );
  }
});

