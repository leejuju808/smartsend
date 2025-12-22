// app/api/send-queue/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getDefaultAccountId } from "@/lib/email/select-account";
import { sendWithAccount } from "@/lib/email/send";
import { sendWithSender } from "@/lib/sendDispatch";
import type { Attachment } from "@/lib/mime";
import { checkOrgEmailLimit } from "@/lib/billing/checkSendLimit";
import { isCapacityFull, nonNegativeIntOrNull, normalizeDemandThrottle, throttleDailyCap, throttlePerRunLimit } from "@/lib/capacity/control";
import { normalizeResilienceMode } from "@/lib/resilience/mode";
import { addComplianceFooterHtml, addComplianceFooterText } from "@/lib/unsubscribe/footer";

type ClaimedJob = {
  job_id: string;
  workspace_id: string;
  campaign_id: string;
  lead_id: string;
  subject: string;
  body: string;
  sender_account_id?: string | null;
};

type QueueAttachmentRecord = {
  name?: string;
  bucket: string;
  path: string;
  content_type?: string;
};

function isPaidStatus(status: string) {
  const s = (status || "").toLowerCase();
  return s === "active" || s === "trialing";
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function validateOutboundCopy(input: { subject: string; html: string; text: string }): { ok: true } | { ok: false; reason: string } {
  const blob = `${input.subject}\n${input.html}\n${input.text}`.toLowerCase();
  const banned: Array<{ re: RegExp; reason: string }> = [
    { re: /\b(final|last)\s+(notice|warning)\b/i, reason: "final_notice_language" },
    { re: /\bact\s+now\b/i, reason: "act_now_language" },
    { re: /\b(urgent|immediately|asap)\b/i, reason: "urgent_language" },
    { re: /\b(limited\s+time|only\s+today|expires?\s+(today|tonight))\b/i, reason: "scarcity_language" },
    { re: /\b(guaranteed|100%\s+guarantee|no\s+risk)\b/i, reason: "guarantee_language" },
    { re: /\bclick\s+here\b/i, reason: "click_here_language" },
    { re: /\b(buy\s+now|order\s+now)\b/i, reason: "hard_sell_language" },
    { re: /\b(?:legal\s+action|lawsuit|sue|collection|collections)\b/i, reason: "threat_language" },
    { re: /\b(?:you\s+must|you\s+need\s+to)\b/i, reason: "coercive_language" },
  ];
  for (const rule of banned) {
    if (rule.re.test(blob)) return { ok: false, reason: rule.reason };
  }
  return { ok: true };
}

function normalizeQueueAttachments(value: unknown): QueueAttachmentRecord[] {
  if (!Array.isArray(value)) return [];
  const rows = value
    .map((item): QueueAttachmentRecord | null => {
      if (!item || typeof item !== "object") return null;
      const bucket = typeof (item as any).bucket === "string" ? (item as any).bucket : null;
      const path = typeof (item as any).path === "string" ? (item as any).path : null;
      if (!bucket || !path) return null;
      return {
        name: typeof (item as any).name === "string" ? (item as any).name : undefined,
        bucket,
        path,
        content_type: typeof (item as any).content_type === "string" ? (item as any).content_type : undefined,
      };
    })
    .filter(Boolean);
  return rows as QueueAttachmentRecord[];
}

async function downloadAttachment(record: QueueAttachmentRecord): Promise<Attachment> {
  const { data, error } = await supabaseAdmin.storage.from(record.bucket).download(record.path);
  if (error || !data) {
    throw new Error(`attachment_download_failed:${record.bucket}/${record.path}:${error?.message ?? "unknown"}`);
  }
  const arrayBuffer = await data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const filename = record.name || record.path.split("/").pop() || "attachment";
  return {
    filename,
    content: buffer,
    contentType: record.content_type || "application/octet-stream",
  };
}

export async function POST(_req: NextRequest) {
  try {
    // Block 271400 — Lost-day recovery (v1)
    // If a worker dies mid-run, jobs can get stuck in "sending". We revive them so the day resumes (no resets).
    try {
      const cutoffIso = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30m
      await supabaseAdmin
        .from("send_queue")
        .update({
          status: "pending",
          scheduled_at: new Date().toISOString(),
          last_error: "lost_day_recovery_stale_sending",
        } as any)
        .eq("status", "sending")
        .lt("processing_started_at", cutoffIso);
    } catch {
      // best-effort only
    }

    // 1) Claim a batch of jobs
    const { data: jobs, error: claimErr } = await supabaseAdmin.rpc("claim_send_jobs", {
      batch_size: 50,
    });

    if (claimErr) {
      console.error("claim_send_jobs error", claimErr);
      return NextResponse.json({ ok: false, error: claimErr.message }, { status: 500 });
    }

    const claimed: ClaimedJob[] = jobs ?? [];
    if (claimed.length === 0) {
      return NextResponse.json({ ok: true, claimed: 0, sent: 0, failed: 0 });
    }

    // BLOCK 270800 helpers (mechanical throttle + crew-aware capacity)
    const inMinutes = (mins: number) => new Date(Date.now() + mins * 60 * 1000).toISOString();
    const tomorrowAtUtcHour = (hour: number) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 1);
      d.setUTCHours(hour, 0, 0, 0);
      return d.toISOString();
    };

    // 1.45) BLOCK 269500: Workspace-wide Outreach RUNNING/PAUSED gate
    // If a workspace is paused, nothing outbound should send.
    const workspaceIdsForGate = [...new Set(claimed.map((j) => j.workspace_id).filter(Boolean))] as string[];
    const workspaceRestartMap = new Map<
      string,
      { last_paused_at: string | null; last_resumed_at: string | null }
    >();
    if (workspaceIdsForGate.length > 0) {
      const { data: wsRows, error: wsErr } = await supabaseAdmin
        .from("workspaces")
        .select("id, outreach_state, outreach_last_paused_at, outreach_last_resumed_at")
        .in("id", workspaceIdsForGate);

      if (wsErr) {
        console.error("[SendQueue] Failed to load workspaces for outreach gate", wsErr);
      } else {
        for (const w of wsRows || []) {
          const id = String((w as any)?.id || "");
          if (!id) continue;
          workspaceRestartMap.set(id, {
            last_paused_at: ((w as any)?.outreach_last_paused_at as string | null) ?? null,
            last_resumed_at: ((w as any)?.outreach_last_resumed_at as string | null) ?? null,
          });
        }

        const pausedWorkspaceIds = new Set(
          (wsRows || [])
            .filter((w: any) => String((w as any).outreach_state || "running") === "paused")
            .map((w: any) => String((w as any).id))
        );

        if (pausedWorkspaceIds.size > 0) {
          const jobsToHold = claimed.filter((j) => pausedWorkspaceIds.has(j.workspace_id));
          if (jobsToHold.length > 0) {
            // IMPORTANT: do NOT "skip" jobs when a workspace is paused.
            // Pause should feel like money stopping, but resume should be instant (queue resumes).
            const ids = jobsToHold.map((j) => j.job_id);
            await supabaseAdmin
              .from("send_queue")
              .update({
                status: "pending",
                last_error: "Workspace paused (SmartSend OFF).",
              })
              .in("id", ids);
          }

          // Remove paused workspace jobs from processing
          claimed.splice(0, claimed.length, ...claimed.filter((j) => !pausedWorkspaceIds.has(j.workspace_id)));

          if (claimed.length === 0) {
            return NextResponse.json({
              ok: true,
              claimed: 0,
              sent: 0,
              failed: 0,
              held: jobsToHold.length,
              message: "All jobs held: workspace outreach is paused",
            });
          }
        }
      }
    }

    // 1.4) Block 11800: Check for paused campaigns (reputation guard)
    const campaignIdsForPause = [...new Set(claimed.map(j => j.campaign_id).filter(Boolean))];
    if (campaignIdsForPause.length > 0) {
      const { data: pausedCampaigns, error: pauseCheckError } = await supabaseAdmin
        .from("campaigns")
        .select("id, paused, pause_reason")
        .in("id", campaignIdsForPause)
        .eq("paused", true);
      
      if (!pauseCheckError && pausedCampaigns && pausedCampaigns.length > 0) {
        const pausedCampaignIds = new Set(pausedCampaigns.map(c => c.id));
        
        // Mark jobs from paused campaigns as skipped
        const jobsToSkip = claimed.filter(j => j.campaign_id && pausedCampaignIds.has(j.campaign_id));
        for (const job of jobsToSkip) {
          await supabaseAdmin
            .from("send_queue")
            .update({
              status: "skipped",
              last_error: `Campaign paused: ${pausedCampaigns.find(c => c.id === job.campaign_id)?.pause_reason || 'Reputation guard protection'}`,
            })
            .eq("id", job.job_id);
        }
        
        // Remove paused campaign jobs from processing
        claimed.splice(0, claimed.length, ...claimed.filter(j => !j.campaign_id || !pausedCampaignIds.has(j.campaign_id)));
        
        if (claimed.length === 0) {
          return NextResponse.json({ 
            ok: true, 
            claimed: 0, 
            sent: 0, 
            failed: 0,
            skipped: jobsToSkip.length,
            message: "All campaigns paused by reputation guard"
          });
        }
      }
    }

    // 1.46) BLOCK 270800: Capacity control (demand throttle + crew-aware auto-slow)
    // After claim, we hold/reschedule jobs if:
    // - Crew is full (jobs_booked_open >= crew_capacity_jobs) -> outreach stops temporarily
    // - Throttle daily cap is reached (LOW/NORMAL/HIGH) -> push to tomorrow
    // - Per-run throttle limit exceeded -> push to a later tick
    let heldByCapacity = 0;
    let heldByThrottle = 0;
    try {
      const wsIds = [...new Set(claimed.map((j) => j.workspace_id).filter(Boolean))] as string[];
      if (wsIds.length > 0) {
        const { data: wsRows } = await supabaseAdmin
          .from("workspaces")
          .select("id, demand_throttle, crew_capacity_jobs, resilience_mode")
          .in("id", wsIds);

        const wsById = new Map<string, any>();
        for (const w of wsRows || []) wsById.set(String((w as any).id), w);

        const { data: openRows } = await supabaseAdmin.rpc("ss_open_jobs_by_workspace", {
          p_workspace_ids: wsIds,
        });
        const openByWs = new Map<string, number>();
        for (const r of (openRows || []) as any[]) {
          openByWs.set(String(r.workspace_id), Number(r.open_jobs || 0));
        }

        const { data: sentTodayRows } = await supabaseAdmin.rpc("ss_send_queue_sent_today_counts", {
          p_workspace_ids: wsIds,
        });
        const sentTodayByWs = new Map<string, number>();
        for (const r of (sentTodayRows || []) as any[]) {
          sentTodayByWs.set(String(r.workspace_id), Number(r.sent_today || 0));
        }

        const keep: ClaimedJob[] = [];
        const toHoldCapacity: string[] = [];
        const toHoldThrottle: Array<{ ids: string[]; scheduledAt: string; reason: string }> = [];

        const jobsByWs = new Map<string, ClaimedJob[]>();
        for (const job of claimed) {
          const wid = String(job.workspace_id || "");
          if (!wid) continue;
          const arr = jobsByWs.get(wid) || [];
          arr.push(job);
          jobsByWs.set(wid, arr);
        }

        for (const [wid, jobsForWs] of jobsByWs.entries()) {
          const ws = wsById.get(wid) || {};
          const resilienceMode = normalizeResilienceMode((ws as any).resilience_mode);
          const baseThrottle = normalizeDemandThrottle((ws as any).demand_throttle);
          const throttle = resilienceMode === "storm" ? "low" : resilienceMode === "surge" ? "high" : baseThrottle;
          const dailyCap = throttleDailyCap(throttle);
          const perRun = throttlePerRunLimit(throttle);

          const openJobs = openByWs.get(wid) ?? 0;
          const crewCap = nonNegativeIntOrNull((ws as any).crew_capacity_jobs);
          const isFull = isCapacityFull(openJobs, crewCap);

          if (isFull) {
            for (const j of jobsForWs) toHoldCapacity.push(j.job_id);
            continue;
          }

          const sentToday = sentTodayByWs.get(wid) ?? 0;
          const remainingDaily = Math.max(0, dailyCap - sentToday);
          const allowNow = Math.min(perRun, remainingDaily);

          if (allowNow <= 0) {
            toHoldThrottle.push({
              ids: jobsForWs.map((j) => j.job_id),
              scheduledAt: tomorrowAtUtcHour(13),
              reason: "workspace_daily_cap_reached",
            });
            continue;
          }

          const allowed = jobsForWs.slice(0, allowNow);
          const held = jobsForWs.slice(allowNow);

          keep.push(...allowed);
          if (held.length > 0) {
            const holdMins = throttle === "low" ? 60 : throttle === "high" ? 10 : 30;
            toHoldThrottle.push({
              ids: held.map((j) => j.job_id),
              scheduledAt: inMinutes(holdMins),
              reason:
                resilienceMode === "storm"
                  ? "resilience_storm_mode"
                  : resilienceMode === "surge"
                  ? "resilience_surge_mode"
                  : throttle === "low"
                  ? "demand_throttle_low"
                  : throttle === "high"
                  ? "demand_throttle_high"
                  : "demand_throttle_normal",
            });
          }
        }

        if (toHoldCapacity.length > 0) {
          heldByCapacity += toHoldCapacity.length;
          await supabaseAdmin
            .from("send_queue")
            .update({
              status: "pending",
              scheduled_at: inMinutes(360),
              last_error: "capacity_full",
              skip_reason: "capacity_full",
            })
            .in("id", toHoldCapacity);
        }

        for (const group of toHoldThrottle) {
          if (group.ids.length === 0) continue;
          heldByThrottle += group.ids.length;
          await supabaseAdmin
            .from("send_queue")
            .update({
              status: "pending",
              scheduled_at: group.scheduledAt,
              last_error: group.reason,
              skip_reason: group.reason,
            })
            .in("id", group.ids);
        }

        // Replace claimed set with only the jobs we intend to actually process.
        claimed.splice(0, claimed.length, ...keep);
      }
    } catch (e) {
      console.error("[SendQueue] Capacity control check failed (continuing without throttle)", e);
    }

    if (claimed.length === 0) {
      return NextResponse.json({
        ok: true,
        claimed: 0,
        sent: 0,
        failed: 0,
        held: heldByCapacity + heldByThrottle,
        held_capacity: heldByCapacity,
        held_throttle: heldByThrottle,
        message: heldByCapacity > 0 ? "All jobs held: demand exceeds availability" : "All jobs held: throttle limits",
      });
    }

    // 1.5) Check send limits per org before processing
    // Group jobs by org_id and check plan limits
    const orgJobsMap = new Map<string, ClaimedJob[]>();
    const defaultAccountCache = new Map<string, string | null>();
    const contractorProfileCache = new Map<string, { company_name: string | null; service_area: string | null }>();
    
    // Get campaigns to find org_id for each job
    const campaignIds = [...new Set(claimed.map(j => j.campaign_id).filter(Boolean))];
    const campaignOrgMap = new Map<string, string | null>();
    const campaignOwnerMap = new Map<string, string | null>();
    
    if (campaignIds.length > 0) {
      const { data: campaigns } = await supabaseAdmin
        .from("campaigns")
        .select("id, org_id, workspace_id, user_id")
        .in("id", campaignIds);
      
      if (campaigns) {
        for (const campaign of campaigns) {
          let orgId = campaign.org_id || null;
          const ownerId = (campaign as any).user_id || null;
          
          // Fallback: get org_id from workspace if campaign doesn't have it
          if (!orgId && campaign.workspace_id) {
            const { data: workspace } = await supabaseAdmin
              .from("workspaces")
              .select("org_id")
              .eq("id", campaign.workspace_id)
              .single();
            orgId = workspace?.org_id || null;
          }
          
          campaignOrgMap.set(campaign.id, orgId);
          campaignOwnerMap.set(campaign.id, ownerId);
        }
      }
    }

    // Paid gate for daily sending: unpaid => 25/day, paid => 50/day (Block 267200)
    const ownerIds = [...new Set(Array.from(campaignOwnerMap.values()).filter(Boolean))] as string[];
    const ownerPaidMap = new Map<string, boolean>();
    const ownerStatusMap = new Map<string, string>();
    if (ownerIds.length > 0) {
      const { data: profiles, error: profErr } = await supabaseAdmin
        .from("profiles")
        .select("id, subscription_status")
        .in("id", ownerIds);
      if (profErr) {
        console.error("[SendQueue] Failed to load owner subscription_status", profErr);
      }
      for (const p of profiles || []) {
        const status = String((p as any).subscription_status || "");
        const isPaid = isPaidStatus(status);
        ownerPaidMap.set((p as any).id, isPaid);
        ownerStatusMap.set((p as any).id, status);
      }
    }
    
    // Group jobs by org_id
    for (const job of claimed) {
      const orgId = campaignOrgMap.get(job.campaign_id) || null;
      
      if (orgId) {
        if (!orgJobsMap.has(orgId)) {
          orgJobsMap.set(orgId, []);
        }
        orgJobsMap.get(orgId)!.push(job);
      }
    }
    
    // Check org-based email limits
    for (const [orgId, orgJobs] of orgJobsMap.entries()) {
      try {
        await checkOrgEmailLimit(orgId, orgJobs.length);
      } catch (err: any) {
        if (err?.code === "SEND_LIMIT_REACHED") {
          // Mark all jobs for this org as failed due to limit
          const jobIds = orgJobs.map(j => j.job_id);
          await supabaseAdmin
            .from("send_queue")
            .update({
              status: "failed",
              last_error: err.message,
              skip_reason: "plan_email_limit",
            })
            .in("id", jobIds);
          
          // Remove from claimed list so they're not processed
          const orgJobIds = new Set(jobIds);
          claimed.splice(0, claimed.length, ...claimed.filter(j => !orgJobIds.has(j.job_id)));
        } else {
          // For other errors, log but continue (don't block all sends)
          console.error(`[SendQueue] Limit check error for org ${orgId}:`, err);
        }
      }
    }
    
    // If all jobs were blocked, return early
    if (claimed.length === 0) {
      return NextResponse.json({ 
        ok: false, 
        error: "All jobs blocked by send limits",
        claimed: 0, 
        sent: 0, 
        failed: orgJobsMap.size 
      });
    }

    // 1.51) BLOCK 269500: Daily proof-of-life (“Outreach ran today.”)
    // Log once per workspace when we're actively attempting sends (post-gates).
    try {
      const workspacesProcessed = [...new Set(claimed.map((j) => j.workspace_id).filter(Boolean))] as string[];
      if (workspacesProcessed.length > 0) {
        await Promise.all(
          workspacesProcessed.map(async (wid) => {
            try {
              await supabaseAdmin.rpc("ss_outreach_log_today", { p_workspace_id: wid });
            } catch {
              // best-effort only
            }
          })
        );
      }
    } catch {
      // best-effort only
    }

    // 2) Load lead emails for all jobs in one go
    const leadIds = claimed.map((j) => j.lead_id).filter(Boolean);
    let leadById = new Map();
    
    if (leadIds.length > 0) {
      const { data: leads, error: leadsErr } = await supabaseAdmin
        .from("leads")
        .select("id,email,name,company")
        .in("id", leadIds);

      if (leadsErr) throw leadsErr;

      leadById = new Map(leads!.map((l: any) => [l.id, l]));
    }

    // 3) Process each job
    let sent = 0;
    let failed = 0;

    for (const job of claimed) {
      // Hard block: billing failure => immediate silence (pause without sending)
      const ownerId = campaignOwnerMap.get(job.campaign_id) || null;
      const ownerStatus = ownerId ? (ownerStatusMap.get(ownerId) ?? "") : "";
      if (ownerId && !isPaidStatus(ownerStatus)) {
        // Re-schedule this job so we can resume automatically when billing is fixed.
        const retryAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
        await supabaseAdmin
          .from("send_queue")
          .update({
            status: "pending",
            scheduled_at: retryAt.toISOString(),
            last_error: "outreach_paused",
            skip_reason: "billing_paused",
          })
          .eq("id", job.job_id);
        continue;
      }

      // Hard daily cap (v1): unpaid => 25/day, paid => 50/day (per sender_account_id).
      if (job.sender_account_id) {
        const isPaid = ownerId ? (ownerPaidMap.get(ownerId) ?? false) : false;
        let dailyCap = isPaid ? 50 : 25;

        // BLOCK 274600: Restart ≠ Reset.
        // If SmartSend was stopped for >=1 day and just resumed, ramp volume back slowly for 7 days.
        try {
          const meta = workspaceRestartMap.get(job.workspace_id);
          const lp = meta?.last_paused_at ? new Date(meta.last_paused_at) : null;
          const lr = meta?.last_resumed_at ? new Date(meta.last_resumed_at) : null;
          if (lp && lr && Number.isFinite(lp.getTime()) && Number.isFinite(lr.getTime()) && lr.getTime() > lp.getTime()) {
            const dayMs = 86_400_000;
            const pauseDays = Math.floor((Date.UTC(lr.getUTCFullYear(), lr.getUTCMonth(), lr.getUTCDate()) - Date.UTC(lp.getUTCFullYear(), lp.getUTCMonth(), lp.getUTCDate())) / dayMs);
            const now = new Date();
            const daysSinceResume = Math.floor(
              (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(lr.getUTCFullYear(), lr.getUTCMonth(), lr.getUTCDate())) / dayMs
            );
            const windowDays = 7;
            const active = pauseDays >= 1 && daysSinceResume >= 0 && daysSinceResume < windowDays;
            if (active) {
              const multiplier =
                daysSinceResume <= 1 ? 0.25 : daysSinceResume <= 3 ? 0.5 : daysSinceResume <= 6 ? 0.75 : 1;
              dailyCap = Math.max(5, Math.floor(dailyCap * multiplier));
            }
          }
        } catch {
          // best-effort only
        }

        const startOfDay = new Date();
        startOfDay.setUTCHours(0, 0, 0, 0);
        const { count: sentToday, error: capErr } = await supabaseAdmin
          .from("send_queue")
          .select("id", { head: true, count: "exact" })
          .eq("sender_account_id", job.sender_account_id)
          .in("status", ["sent", "delivered"])
          .gte("updated_at", startOfDay.toISOString());
        if (!capErr && (sentToday ?? 0) >= dailyCap) {
          // Reschedule for tomorrow morning (UTC) to keep it simple.
          const tomorrow = new Date();
          tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
          tomorrow.setUTCHours(13, 0, 0, 0); // ~8am US Central; "good enough" for v1
          await supabaseAdmin
            .from("send_queue")
            .update({
              status: "pending",
              scheduled_at: tomorrow.toISOString(),
              last_error: `daily_cap_${dailyCap}_reached`,
            })
            .eq("id", job.job_id);
          continue;
        }
      }

      const lead = leadById.get(job.lead_id);
      const to = lead?.email;
      // Prefer effective fields (from rewrites) if present, else fallback to original
      const originalSubject = ((job as any).subject_effective ?? job.subject) || "Hello from SmartSend";
      const subject = `${originalSubject}`;
      // Inject real tracking token into HTML before sending
      let html =
        ((job as any).body_html_effective ?? job.body) ||
        `<p>Hi ${lead?.name ?? ""},</p><p>This is a SmartSend test message.</p><p>— Team</p>`;
      let attachmentsForSend: Attachment[] = [];
      try {
        // Try to get or set tracking_token atomically per row
        const { data: row } = await supabaseAdmin
          .from("send_queue")
          .select("tracking_token, attachments")
          .eq("id", job.job_id)
          .single();

        let token = row?.tracking_token as string | null;
        if (!token) {
          token = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)) as string;
          await supabaseAdmin.from("send_queue").update({ tracking_token: token }).eq("id", job.job_id);
        }
        if (token) {
          html = html.replaceAll("{{TRACK_TOKEN}}", String(token));
        }
        const queueAttachments = normalizeQueueAttachments(row?.attachments);
        if (queueAttachments.length > 0) {
          attachmentsForSend = await Promise.all(queueAttachments.map((att) => downloadAttachment(att)));
        }
      } catch {}

      if (!to) {
        await supabaseAdmin
          .from("send_queue")
          .update({
            status: "failed",
            last_error: "Lead has no email",
          })
          .eq("id", job.job_id);
        failed++;
        continue;
      }

      // Note: Workspace-plan limits are enforced elsewhere in this repo.
      // For this sprint we keep the send loop focused on "does it send?".

      try {
        // Compliance / reputation shield: Safety Net v1 (suppression, bounces, complaints, unsubscribe, disposable)
        const { data: safety, error: safetyErr } = await supabaseAdmin.rpc("should_send_email", {
          p_workspace_id: job.workspace_id,
          p_email: to,
          p_campaign_id: job.campaign_id,
        });

        if (safetyErr) {
          await supabaseAdmin
            .from("send_queue")
            .update({
              status: "failed",
              last_error: "safety_check_error",
              skip_reason: "safety_check_error",
            })
            .eq("id", job.job_id);
          failed++;
          continue;
        }

        if (!Boolean((safety as any)?.should_send)) {
          const reason = String((safety as any)?.reason || "blocked");
          const message = String((safety as any)?.message || reason);
          await supabaseAdmin
            .from("send_queue")
            .update({
              status: "skipped",
              last_error: message.slice(0, 500),
              skip_reason: `safety_net_${reason}`,
            })
            .eq("id", job.job_id);
          continue;
        }

        // Get or reuse unsubscribe token (required for compliance footer)
        const base =
          (process.env.NEXT_PUBLIC_APP_URL ||
            process.env.NEXT_PUBLIC_SITE_URL ||
            "http://localhost:3000").replace(/\/$/, "");
        const { data: unsubToken, error: unsubErr } = await supabaseAdmin.rpc(
          "get_or_create_unsubscribe_token",
          {
            p_workspace_id: job.workspace_id,
            p_email: to,
            p_contact_id: job.lead_id,
          }
        );
        if (unsubErr || !unsubToken) {
          await supabaseAdmin
            .from("send_queue")
            .update({
              status: "failed",
              last_error: "unsubscribe_token_error",
              skip_reason: "unsubscribe_token_error",
            })
            .eq("id", job.job_id);
          failed++;
          continue;
        }
        const unsubscribeUrl = `${base}/u/${unsubToken}`;

        // Replace placeholders if present, then append compliance footer (identity + opt-out)
        html = html.replaceAll("$UNSUBSCRIBE_LINK", unsubscribeUrl);
        html = html.replaceAll("{{unsubscribe_url}}", unsubscribeUrl);
        html = html.replaceAll("{{unsubscribe_link}}", unsubscribeUrl);

        let contractor = contractorProfileCache.get(job.workspace_id);
        if (!contractor) {
          const { data: profile } = await supabaseAdmin
            .from("contractor_profile")
            .select("company_name, service_area")
            .eq("workspace_id", job.workspace_id)
            .maybeSingle();
          contractor = {
            company_name: (profile as any)?.company_name ?? null,
            service_area: (profile as any)?.service_area ?? null,
          };
          contractorProfileCache.set(job.workspace_id, contractor);
        }

        html = addComplianceFooterHtml(html, unsubscribeUrl, {
          businessName: contractor.company_name,
          location: contractor.service_area,
        });

        const text = addComplianceFooterText(stripHtml(html), unsubscribeUrl, {
          businessName: contractor.company_name,
          location: contractor.service_area,
        });

        const copyCheck = validateOutboundCopy({ subject, html, text });
        if (!copyCheck.ok) {
          await supabaseAdmin
            .from("send_queue")
            .update({
              status: "failed",
              last_error: `copy_blocked:${copyCheck.reason}`,
              skip_reason: "copy_blocked",
            })
            .eq("id", job.job_id);
          failed++;
          continue;
        }

        const attachments = attachmentsForSend.length > 0 ? attachmentsForSend : undefined;

        if (job.sender_account_id) {
          // Use explicit sender account if stamped on the job
          await sendWithSender({
            senderAccountId: job.sender_account_id,
            to,
            subject,
            textOrHtml: html || text,
            attachments,
          });
        } else {
          // Fallback to default per-workspace email account system
          let defaultAccountId = defaultAccountCache.get(job.workspace_id) ?? null;
          if (defaultAccountId === null) {
            defaultAccountId = await getDefaultAccountId(supabaseAdmin, job.workspace_id);
            defaultAccountCache.set(job.workspace_id, defaultAccountId);
          }
          if (!defaultAccountId) {
            throw new Error("No connected email account for workspace");
          }
          const { ok, error } = await sendWithAccount(
            supabaseAdmin,
            defaultAccountId,
            to,
            subject,
            text,
            html,
            attachments
          );
          if (!ok) throw new Error(error || "send failed");
        }
        await supabaseAdmin
          .from("send_queue")
          .update({
            status: "sent",
            last_error: null,
          })
          .eq("id", job.job_id);

        // Keep leads table in sync for barebones UI (Last Sent column)
        if (job.lead_id) {
          try {
            await supabaseAdmin
              .from("leads")
              .update({
                last_sent_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", job.lead_id);
          } catch {
            // ignore
          }
        }

        // Block 14400: Set source_campaign_id on contact if it's currently null
        // This attaches the contact to the first campaign that touched them via SmartSend
        if (job.lead_id && job.campaign_id) {
          await supabaseAdmin
            .from("contacts")
            .update({ source_campaign_id: job.campaign_id })
            .eq("id", job.lead_id)
            .is("source_campaign_id", null);
        }
        
        sent++;
      } catch (e: any) {
        // Check current attempts to decide retry policy
        const { data: currentRow } = await supabaseAdmin
          .from("send_queue")
          .select("attempts")
          .eq("id", job.job_id)
          .single();

        const attempts = (currentRow?.attempts ?? 0) + 1; // Increment on failure
        const maxAttempts = 3;
        const nextStatus = attempts >= maxAttempts ? "failed" : "pending";

        await supabaseAdmin
          .from("send_queue")
          .update({
            status: nextStatus,
            attempts,
            last_error: e?.message?.slice(0, 500) ?? "Unknown error",
            error: e?.message?.slice(0, 500) ?? "Unknown error",
            // naive backoff: +15m when rescheduling
            scheduled_at: nextStatus === "pending" ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : undefined,
          })
          .eq("id", job.job_id);

        if (nextStatus === "failed") failed++;
      }
    }

    return NextResponse.json({ ok: true, claimed: claimed.length, sent, failed });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e.message ?? "Worker failure" }, { status: 500 });
  }
}
