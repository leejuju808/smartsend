import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function getLeadTimeline(campaignId: string, leadId: string) {
  const cookieStore = await cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const [lead, queue, logs, activity, bounces, complaints] = await Promise.all([
    sb
      .from("campaign_leads")
      .select(
        "id,lead_id,email,first_name,company,title,paused_at,pause_reason,timezone,leads(id,email,first_name,last_name,company,title,unsubscribed,unsubscribed_at,unsubscribe_reason)"
      )
      .eq("id", leadId)
      .maybeSingle(),
    sb
      .from("send_queue")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true }),
    sb
      .from("send_logs")
      .select("id, *")
      .eq("campaign_id", campaignId)
      .eq("lead_id", leadId)
      .order("sent_at", { ascending: true }),
    sb
      .from("activity_logs")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true }),
    sb
      .from("bounce_logs")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true }),
    sb
      .from("complaint_logs")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true }),
  ]);

  // Fetch version labels for template_version_ids found in queue and logs
  const versionIds = Array.from(
    new Set([
      ...(queue.data ?? []).map((q: any) => q.template_version_id).filter(Boolean),
      ...(logs.data ?? []).map((l: any) => l.template_version_id).filter(Boolean),
    ])
  );
  let versionLabels: Record<string, string> = {};
  if (versionIds.length > 0) {
    const { data: versions } = await sb
      .from("template_versions")
      .select("id, version_label")
      .in("id", versionIds);
    versionLabels = Object.fromEntries(
      (versions ?? []).map((v) => [v.id, v.version_label])
    );
  }

  const events: any[] = [];

  for (const q of queue.data ?? []) {
    events.push({
      type: "queue",
      at: q.created_at,
      status: q.status,
      scheduled_at: q.scheduled_at,
      next_attempt_at: q.next_attempt_at,
      attempts: q.attempts,
      fail_code: q.fail_code,
      fail_kind: q.fail_kind,
      priority: q.priority,
      variant_key: q.variant_key,
      template_version_id: q.template_version_id,
      template_version_label: q.template_version_id
        ? versionLabels[q.template_version_id] ?? null
        : null,
      subject: q.subject,
      meta: q.meta ?? {},
    });
  }

  for (const l of logs.data ?? []) {
    events.push({
      type: "sent",
      id: l.id, // Include send_logs.id for resend action
      at: l.sent_at,
      provider_message_id: l.provider_message_id,
      queue_id: l.queue_id,
      variant_key: l.variant_key,
      template_version_id: l.template_version_id,
      template_version_label: l.template_version_id
        ? versionLabels[l.template_version_id] ?? null
        : null,
      provider_url: l.provider_url ?? null,
    });
  }

  for (const a of activity.data ?? []) {
    events.push({
      type: a.event_type, // 'reply_detected' etc.
      at: a.created_at,
      meta: a.meta,
    });
  }

  for (const b of bounces.data ?? []) {
    events.push({
      type: "bounce",
      at: b.created_at,
      bounce_type: b.type,
      reason: b.reason,
    });
  }

  for (const c of complaints.data ?? []) {
    events.push({
      type: "complaint",
      at: c.created_at,
      source: c.source,
      reason: c.reason,
    });
  }

  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  // Merge lead data from campaign_leads and leads table
  const leadData = lead.data as any;
  const finalLead = leadData
    ? {
        id: leadData.id,
        email:
          leadData.email || (leadData.leads as any)?.email || "",
        first_name:
          leadData.first_name || (leadData.leads as any)?.first_name || null,
        company:
          leadData.company || (leadData.leads as any)?.company || null,
        title:
          leadData.title || (leadData.leads as any)?.title || null,
        paused_at: leadData.paused_at || null,
        pause_reason: leadData.pause_reason || null,
        timezone: leadData.timezone || null,
        unsubscribed: (leadData.leads as any)?.unsubscribed || false,
        unsubscribed_at: (leadData.leads as any)?.unsubscribed_at || null,
        unsubscribe_reason: (leadData.leads as any)?.unsubscribe_reason || null,
      }
    : null;

  return {
    lead: finalLead,
    events,
    raw: {
      queue: queue.data ?? [],
      logs: logs.data ?? [],
      activity: activity.data ?? [],
      bounces: bounces.data ?? [],
      complaints: complaints.data ?? [],
    },
  };
}

