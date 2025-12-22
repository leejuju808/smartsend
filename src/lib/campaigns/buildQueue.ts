// /lib/campaigns/buildQueue.ts
import { supabaseAdmin } from "@/lib/supabase/server";
import { renderTemplate } from "@/lib/templates/render";

async function getMarketPriorityBoost(supabase: ReturnType<typeof supabaseAdmin>, campaignId: string) {
  try {
    // Prefer the flywheel market momentum view if present (Block 269900).
    // Scale: cold=0, warm=+20, fire=+50.
    const { data: camp } = await supabase
      .from("campaigns")
      .select("org_id, market_key")
      .eq("id", campaignId)
      .maybeSingle();

    const marketKey = (camp as any)?.market_key as string | null | undefined;
    const orgId = (camp as any)?.org_id as string | null | undefined;
    if (!marketKey) return 0;

    const { data: rows } = await supabase
      .from("v_market_outreach_momentum_30d")
      .select("momentum_tier, replies_per_50")
      .eq("market_key", marketKey)
      .limit(5);

    const row = (rows || []).find((r: any) => (orgId ? String(r.org_id || "") === String(orgId) : true)) || (rows || [])[0];
    const tier = String((row as any)?.momentum_tier || "cold");
    if (tier === "fire") return 50;
    if (tier === "warm") return 20;
    return 0;
  } catch {
    return 0;
  }
}

async function getBestSendHourUtc(supabase: ReturnType<typeof supabaseAdmin>, workspaceId: string, campaignId: string) {
  try {
    // Use flywheel rollups if available. Pick the best hour by reply-rate over last 14 days.
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: camp } = await supabase
      .from("campaigns")
      .select("org_id, market_key")
      .eq("id", campaignId)
      .maybeSingle();
    const orgId = (camp as any)?.org_id ?? null;
    const marketKey = (camp as any)?.market_key ?? null;

    let q = supabase
      .from("ss_flywheel_daily_rollup")
      .select("send_hour_utc,sends,replies")
      .eq("workspace_id", workspaceId)
      .gte("day", since);
    if (orgId) q = q.eq("org_id", orgId);
    if (marketKey) q = q.eq("market_key", marketKey);

    const { data: rows } = await q.limit(5000);
    if (!rows || rows.length === 0) return null;

    const byHour = new Map<number, { sends: number; replies: number }>();
    for (const r of rows as any[]) {
      const h = typeof r.send_hour_utc === "number" ? r.send_hour_utc : null;
      if (h === null) continue;
      const cur = byHour.get(h) || { sends: 0, replies: 0 };
      cur.sends += Number(r.sends || 0);
      cur.replies += Number(r.replies || 0);
      byHour.set(h, cur);
    }
    let bestHour: number | null = null;
    let bestScore = -1;
    for (const [h, v] of byHour.entries()) {
      if (v.sends < 25) continue;
      const score = v.replies / Math.max(1, v.sends);
      if (score > bestScore) {
        bestScore = score;
        bestHour = h;
      }
    }
    return bestHour;
  } catch {
    return null;
  }
}

// Helper: next send time within window, spaced by cadence, honoring local TZ (assume workspace tz in env or UTC)
function* scheduleTimes(startAt: Date, cadenceSeconds: number, windowStart: string, windowEnd: string) {
  let t = new Date(startAt);
  while (true) {
    const dayStart = new Date(t); dayStart.setHours(...windowStart.split(":").map(Number) as [number, number], 0, 0);
    const dayEnd = new Date(t);   dayEnd.setHours(...windowEnd.split(":").map(Number) as [number, number], 0, 0);
    if (t < dayStart) t = dayStart;
    if (t > dayEnd) { // move to next day start
      const next = new Date(t); next.setDate(next.getDate() + 1);
      next.setHours(...windowStart.split(":").map(Number) as [number, number], 0, 0);
      t = next;
    }
    yield new Date(t);
    t = new Date(t.getTime() + cadenceSeconds * 1000);
  }
}

export async function buildQueueForCampaign(campaign_id: string, workspace_id: string) {
  const supabase = supabaseAdmin();

  const { data: camp, error: cErr } = await supabase
    .from("campaigns")
    .select("id, subject_template, body_template, daily_cap, cadence_seconds, window_start, window_end, start_date, org_id, segment_id, account_id")
    .eq("id", campaign_id)
    .eq("workspace_id", workspace_id)
    .single();
  if (cErr || !camp) throw cErr || new Error("Campaign not found");

  // BLOCK 130: Filter leads by segment if segment_id is set
  let segmentFilteredLeadIds: string[] | null = null;
  if ((camp as any).segment_id) {
    const segmentId = (camp as any).segment_id;
    const accountId = (camp as any).account_id || workspace_id; // Fallback to workspace_id if account_id not available
    
    // Use materialized segment members if available (fastest path)
    const { data: segmentMembers, error: segErr } = await supabase
      .from("lead_segment_members")
      .select("lead_id")
      .eq("segment_id", segmentId);
    
    if (!segErr && segmentMembers && segmentMembers.length > 0) {
      segmentFilteredLeadIds = segmentMembers.map(m => m.lead_id);
    } else {
      // Fallback: validate segment exists and is active
      const { data: segment } = await supabase
        .from("segments")
        .select("id, rule, account_id, is_active")
        .eq("id", segmentId)
        .eq("account_id", accountId)
        .eq("is_active", true)
        .single();
      
      if (!segment) {
        throw new Error(`Segment ${segmentId} not found or inactive. Campaign cannot target this segment.`);
      }
      
      // If no materialized members, we'll filter later using segment rules
      // For now, we'll proceed and filter in the leads query
    }
  }

  // Fetch campaign_leads to check status and replied_at (Block 392: filter out replied/unsubscribed/bounced)
  const { data: campaignLeads, error: clErr } = await supabase
    .from("campaign_leads")
    .select("lead_id, replied_at, status")
    .eq("campaign_id", campaign_id)
    .is("replied_at", null); // Exclude leads that have replied_at set
  if (clErr && clErr.code !== "PGRST116") throw clErr; // PGRST116 = table not found, ignore for backward compatibility

  // Fallback to campaign_targets if campaign_leads is empty or doesn't exist
  let leadIds: string[] = [];
  if (campaignLeads && campaignLeads.length > 0) {
    // Block 392: Filter out replied/unsubscribed/bounced statuses
    const filteredLeads = campaignLeads.filter(
      cl => !['replied', 'unsubscribed', 'bounced', 'completed'].includes((cl.status || "").toLowerCase())
    );
    leadIds = filteredLeads.map(cl => cl.lead_id);
  } else {
    // Fallback to campaign_targets (legacy schema)
    // Also filter out replied leads using campaign_leads join
    const { data: targets, error: tErr } = await supabase
      .from("campaign_targets")
      .select("lead_id")
      .eq("campaign_id", campaign_id);
    if (tErr) throw tErr;
    const targetLeadIds = targets?.map(t => t.lead_id) || [];
    
    // Filter out any leads with replied_at set or replied/unsubscribed/bounced status in campaign_leads
    if (targetLeadIds.length > 0) {
      const { data: campaignLeadData } = await supabase
        .from("campaign_leads")
        .select("lead_id, status, replied_at")
        .eq("campaign_id", campaign_id)
        .in("lead_id", targetLeadIds);
      
      // Block 392: Filter out leads with replied_at set or replied/unsubscribed/bounced status
      const repliedSet = new Set(
        (campaignLeadData || [])
          .filter(cl => 
            cl.replied_at !== null || 
            ['replied', 'unsubscribed', 'bounced', 'completed'].includes((cl.status || "").toLowerCase())
          )
          .map(r => r.lead_id)
      );
      leadIds = targetLeadIds.filter(id => !repliedSet.has(id));
    }
  }

  // BLOCK 130: Apply segment filter if segment_id is set
  if (segmentFilteredLeadIds !== null) {
    // Intersect campaign leads with segment members
    const segmentSet = new Set(segmentFilteredLeadIds);
    leadIds = leadIds.filter(id => segmentSet.has(id));
  }

  if (!leadIds.length) return { enqueued: 0 };

  const { data: leads, error: lErr } = await supabase
    .from("leads")
    .select("id, email, first_name, last_name, company, title, city, zip, zip_code, custom, status")
    .in("id", leadIds)
    .eq("workspace_id", workspace_id)
    .neq("status", "Replied"); // Skip leads that have already replied (legacy status field)
  if (lErr) throw lErr;

  // Filter dead leads (Block 35333) and any "replied" legacy state.
  const leadsToQueue = (leads || []).filter((l: any) => {
    const status = String(l?.status || "").toLowerCase();
    return status !== "dead" && status !== "replied";
  });

  // BLOCK 272000: Area Lever (Zip ON/OFF)
  // OFF = constrain outreach to leads that are inside the defined service area (best-effort).
  // ON  = expanded area (no additional filtering).
  //
  // Notes:
  // - This is intentionally "best-effort": if lead_locations doesn't exist or has no rows,
  //   we do not block sending (we avoid accidental total silence).
  try {
    const { data: wsRow, error: wsErr } = await supabase
      .from("workspaces")
      .select("area_zip_enabled")
      .eq("id", workspace_id)
      .maybeSingle();

    const areaZipEnabled = Boolean((wsRow as any)?.area_zip_enabled);
    if (!areaZipEnabled && leadsToQueue.length > 0) {
      const ids = leadsToQueue.map((l: any) => l.id).filter(Boolean);
      const { data: locRows, error: locErr } = await supabase
        .from("lead_locations")
        .select("lead_id,is_in_service_area")
        .eq("workspace_id", workspace_id)
        .in("lead_id", ids)
        .limit(5000);

      if (!locErr && locRows && locRows.length > 0) {
        const inArea = new Set(
          (locRows as any[])
            .filter((r) => r?.is_in_service_area === true && r?.lead_id)
            .map((r) => String(r.lead_id))
        );
        // mutate the existing array reference used below
        leadsToQueue.splice(0, leadsToQueue.length, ...leadsToQueue.filter((l: any) => inArea.has(String(l.id))));
      }
    }
  } catch {
    // best-effort only
  }

  // BLOCK 270700: Zip Rotation Control — exclude paused ZIPs at queue build time.
  // Default behavior: if a ZIP has no explicit control row, it's treated as active.
  try {
    const { data: controls, error: zErr } = await supabase
      .from("campaign_zip_controls")
      .select("zip, is_active")
      .eq("campaign_id", campaign_id)
      .limit(2000);

    if (!zErr && controls && controls.length > 0) {
      const zipActive = new Map<string, boolean>();
      for (const c of controls as any[]) {
        zipActive.set(String(c.zip), !!c.is_active);
      }

      const isAllowedZip = (lead: any) => {
        const zip =
          String(
            (lead?.zip_code ?? lead?.zip ?? "")
          )
            .trim() || "unknown";
        const active = zipActive.get(zip);
        return active !== false;
      };

      // mutate the existing array reference used below
      leadsToQueue.splice(0, leadsToQueue.length, ...leadsToQueue.filter(isAllowedZip));
    }
  } catch {
    // best-effort only: if controls table isn't present yet or query fails, do not block sending
  }

  // Suppression lookup (set to avoid DB hits per lead)
  // Support both legacy workspace_id-based and new org_id-based suppression
  let suppressedRows: any[] = [];
  if ((camp as any).org_id) {
    const { data } = await supabase
      .from("suppression_list")
      .select("email")
      .eq("org_id", (camp as any).org_id);
    suppressedRows = data || [];
  } else {
    // Legacy workspace_id support
    const { data } = await supabase
      .from("suppression_list")
      .select("email")
      .eq("workspace_id", workspace_id);
    suppressedRows = data || [];
  }
  const suppressed = new Set((suppressedRows || []).map(r => r.email?.toLowerCase()));

  // Determine "today's already scheduled" count to enforce daily cap
  const today = new Date();
  const startOfDay = new Date(today); startOfDay.setHours(0,0,0,0);
  const endOfDay = new Date(today);   endOfDay.setHours(23,59,59,999);

  const { count: alreadyToday } = await supabase
    .from("send_queue")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspace_id)
    .eq("campaign_id", campaign_id)
    .gte("scheduled_at", startOfDay.toISOString())
    .lte("scheduled_at", endOfDay.toISOString());

  // Use campaign_effective_cap if available (clamps to mailbox cap), otherwise fallback to daily_cap
  let effectiveCap = camp.daily_cap ?? 200;
  try {
    // Try to get effective cap from RPC (requires existing queue items with account_id)
    // If no queue items exist yet, fallback to daily_cap
    const { data: capData, error: capErr } = await supabase
      .rpc("campaign_effective_cap", { p_campaign: campaign_id });
    if (!capErr && typeof capData === "number") {
      effectiveCap = capData;
    }
  } catch (e) {
    // Fallback to daily_cap if RPC fails (e.g., no account_id in queue yet)
  }

  const remainingToday = Math.max(0, effectiveCap - (alreadyToday ?? 0));

  // Time generator honoring campaign window + cadence, starting at max(now, start_date 08:00)
  const baseStart = new Date();
  const campaignStart = new Date(camp.start_date || new Date());
  campaignStart.setHours(...(camp.window_start || "08:00").split(":").map(Number) as [number, number], 0, 0);
  // Block 269900: prefer the best-performing send hour (UTC) when we have enough data.
  const preferredHourUtc = await getBestSendHourUtc(supabase, workspace_id, campaign_id);
  if (typeof preferredHourUtc === "number" && preferredHourUtc >= 0 && preferredHourUtc <= 23) {
    const adjusted = new Date(baseStart);
    adjusted.setUTCHours(preferredHourUtc, 0, 0, 0);
    // If we already missed it today, keep baseStart as-is (scheduler will roll within window).
    if (adjusted > baseStart) {
      baseStart.setTime(adjusted.getTime());
    }
  }
  const firstTime = baseStart > campaignStart ? baseStart : campaignStart;
  const times = scheduleTimes(firstTime, camp.cadence_seconds ?? 45, camp.window_start || "08:00", camp.window_end || "17:30");

  const rows: any[] = [];
  let enqueuedToday = 0;
  const priorityBoost = await getMarketPriorityBoost(supabase, campaign_id);

  for (const lead of leadsToQueue) {
    const to = (lead.email || "").toLowerCase().trim();
    if (!to || suppressed.has(to)) continue;

    // Respect daily cap: if exceeded for today, push to next day automatically (the generator will roll over)
    if (enqueuedToday >= remainingToday) {
      // jump times ahead to next day window start
      const next = new Date(); next.setDate(next.getDate() + 1);
      next.setHours(...(camp.window_start || "08:00").split(":").map(Number) as [number, number], 0, 0);
      // burn generator values until >= next
      let dt = times.next().value as Date;
      while (dt < next) dt = times.next().value as Date;
      enqueuedToday = 0; // reset counter for new day
    }

    const vars: Record<string, string | null | undefined> = {
      first_name: lead.first_name,
      last_name: lead.last_name,
      company: lead.company,
      title: lead.title,
      // Locked-copy placeholders support
      Name: lead.first_name,
      City: (lead as any).city,
    };

    // Check for variants and choose one based on weight
    let subject = renderTemplate(camp.subject_template || "", vars);
    let body_html = renderTemplate(camp.body_template || "", vars);
    let variant_id: string | null = null;

    const { data: variants } = await supabase
      .from("template_variants")
      .select("id, name, subject, body, weight")
      .eq("campaign_id", campaign_id);

    if (variants && variants.length > 0) {
      // Choose variant based on weight
      const { chooseVariant } = await import("@/lib/variants/chooseVariant");
      const selectedVariant = chooseVariant(variants);
      
      if (selectedVariant) {
        variant_id = selectedVariant.id;
        subject = renderTemplate(selectedVariant.subject || "", vars);
        body_html = renderTemplate(selectedVariant.body || "", vars);
        
        // Increment sends counter for this variant
        await supabase.rpc("increment_variant_metric", {
          p_variant_id: selectedVariant.id,
          p_metric: "sends",
        });
      }
    }

    const scheduled_at = (times.next().value as Date).toISOString();
    enqueuedToday++;

    rows.push({
      workspace_id,
      campaign_id,
      lead_id: lead.id,
      to_email: to,
      subject,
      body_html,
      variant_id,
      status: "pending",
      scheduled_at,
      // Block 269900: steer volume to markets with momentum.
      priority: priorityBoost,
    });
  }

  if (!rows.length) return { enqueued: 0 };

  const { error: insErr } = await supabase.from("send_queue").insert(rows);
  if (insErr) throw insErr;

  return { enqueued: rows.length };
}