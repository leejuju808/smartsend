// /lib/scheduler/processQueue.ts (wire to use your queued body_html/subject)
import { supabaseAdmin } from "@/lib/supabase/admin";
import { gmailSendThroughWorkspace } from "@/lib/providers/gmail/send";
import { withUnsubscribeFooter } from "@/lib/email/withUnsubscribe";
import { nextRetry } from "./retryPolicy";
import { shouldSend } from "@/lib/deliverability/shouldSend";
import { rewriteHtmlForTracking } from "@/lib/tracking/rewriter";
import { convertToTimezone, isWithinSendWindow, isWeekend } from "./timezone";

const supabase = supabaseAdmin;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;
const TRACK_HOST = process.env.TRACK_HOST;

export async function processQueue() {
  const { data: pending } = await supabase
    .from("send_queue")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(50);

  if (!pending?.length) return;

  for (const item of pending) {
    try {
      const orgId = (item as any).org_id || item.workspace_id;
      
      // ============================================
      // Block 180: Smart Scheduler v2 Checks
      // ============================================
      
      // Fetch campaign to get scheduler settings
      let campaign: any = null;
      if (item.campaign_id) {
        const { data: campData } = await supabase
          .from("campaigns")
          .select("send_window_start, send_window_end, daily_cap, throttle_per_minute, warmup_mode, status")
          .eq("id", item.campaign_id)
          .single();
        campaign = campData;
      }

      // Safe-send auto-pause check (before processing)
      if (campaign && campaign.status === 'active') {
        const shouldPause = await checkSafeSendConditions(item.campaign_id);
        if (shouldPause) {
          await supabase.from("campaigns")
            .update({ status: 'paused' })
            .eq("id", item.campaign_id);
          await supabase.from("send_queue")
            .update({ status: "suppressed", error: "safety_pause" })
            .eq("id", item.id);
          continue;
        }
      }

      // Domain warmup check
      if (campaign?.warmup_mode) {
        const senderEmail = (item as any).sender_email 
          || (item as any).metadata?.sender_email
          || (item as any).from_email
          || '';
        
        if (senderEmail) {
          const domain = senderEmail.split('@')[1]?.toLowerCase();
          if (domain) {
            const { data: domainData } = await supabase
              .from("sender_domains")
              .select("created_at, verified")
              .eq("domain", domain)
              .maybeSingle();
            
            if (domainData?.created_at) {
              const daysSinceVerification = Math.floor(
                (Date.now() - new Date(domainData.created_at).getTime()) / (1000 * 60 * 60 * 24)
              );
              
              let maxPerDay = campaign.daily_cap || 150;
              
              // Warmup ramp: Week 1: 20, Week 2: 40, Week 3: 75, Week 4+: full cap
              if (daysSinceVerification < 7) {
                maxPerDay = 20;
              } else if (daysSinceVerification < 14) {
                maxPerDay = 40;
              } else if (daysSinceVerification < 21) {
                maxPerDay = 75;
              }
              
              // Check daily cap for warmup
              const todayStart = new Date();
              todayStart.setHours(0, 0, 0, 0);
              
              const { count: sentToday } = await supabase
                .from("email_logs")
                .select("*", { count: "exact", head: true })
                .eq("campaign_id", item.campaign_id)
                .gte("created_at", todayStart.toISOString())
                .eq("status", "sent");
              
              if ((sentToday || 0) >= maxPerDay) {
                await supabase.from("send_queue")
                  .update({ status: "suppressed", error: "warmup_daily_cap" })
                  .eq("id", item.id);
                continue;
              }
            }
          }
        }
      }

      // Throttling check (per minute)
      if (campaign?.throttle_per_minute) {
        const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
        const { count: sentLastMinute } = await supabase
          .from("email_logs")
          .select("*", { count: "exact", head: true })
          .eq("campaign_id", item.campaign_id)
          .gte("created_at", oneMinuteAgo)
          .eq("status", "sent");
        
        if ((sentLastMinute || 0) >= campaign.throttle_per_minute) {
          // Reschedule for next minute
          const nextMinute = new Date(Date.now() + 60000);
          await supabase.from("send_queue")
            .update({ 
              status: "pending", 
              scheduled_at: nextMinute.toISOString(),
              error: "throttled"
            })
            .eq("id", item.id);
          continue;
        }
      }

      // Daily cap check
      if (campaign?.daily_cap) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        
        const { count: sentToday } = await supabase
          .from("email_logs")
          .select("*", { count: "exact", head: true })
          .eq("campaign_id", item.campaign_id)
          .gte("created_at", todayStart.toISOString())
          .eq("status", "sent");
        
        if ((sentToday || 0) >= campaign.daily_cap) {
          // Reschedule for tomorrow
          const tomorrow = new Date(todayStart);
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(8, 0, 0, 0); // Start of next day
          
          await supabase.from("send_queue")
            .update({ 
              status: "pending", 
              scheduled_at: tomorrow.toISOString(),
              error: "daily_cap_reached"
            })
            .eq("id", item.id);
          continue;
        }
      }

      // Local-time window enforcement
      if (campaign?.send_window_start && campaign?.send_window_end) {
        const leadId = (item as any).lead_id;
        if (leadId) {
          const { data: lead } = await supabase
            .from("leads")
            .select("timezone")
            .eq("id", leadId)
            .single();
          
          const leadTimezone = lead?.timezone || 'America/Los_Angeles';
          const localNow = convertToTimezone(new Date(), leadTimezone);
          
          // Skip weekends
          if (isWeekend(localNow)) {
            const nextWeekday = new Date(localNow);
            let daysToAdd = 1;
            if (localNow.getDay() === 6) daysToAdd = 2; // Saturday -> Monday
            if (localNow.getDay() === 0) daysToAdd = 1; // Sunday -> Monday
            nextWeekday.setDate(nextWeekday.getDate() + daysToAdd);
            nextWeekday.setHours(8, 0, 0, 0);
            
            await supabase.from("send_queue")
              .update({ 
                status: "pending", 
                scheduled_at: nextWeekday.toISOString(),
                error: "weekend_skip"
              })
              .eq("id", item.id);
            continue;
          }
          
          // Check send window
          if (!isWithinSendWindow(localNow, campaign.send_window_start, campaign.send_window_end)) {
            // Reschedule for next window
            const nextWindow = new Date(localNow);
            const [startHour, startMin] = campaign.send_window_start.split(':').map(Number);
            nextWindow.setHours(startHour, startMin, 0, 0);
            
            // If we're past the window today, move to tomorrow
            if (nextWindow <= localNow) {
              nextWindow.setDate(nextWindow.getDate() + 1);
            }
            
            await supabase.from("send_queue")
              .update({ 
                status: "pending", 
                scheduled_at: nextWindow.toISOString(),
                error: "outside_send_window"
              })
              .eq("id", item.id);
            continue;
          }
        }
      }
      
      // ============================================
      // End Block 180 Checks
      // ============================================
      
      // Check if campaign-contact is paused
      // Handle both contact_id and lead_id cases
      if (item.campaign_id && (item.contact_id || (item as any).lead_id)) {
        let contactId = item.contact_id;
        
        // If we have lead_id but not contact_id, try to find contact_id from campaign_contacts
        if (!contactId && (item as any).lead_id) {
          const { data: ccLookup } = await supabase
            .from("campaign_contacts")
            .select("contact_id")
            .eq("campaign_id", item.campaign_id)
            .eq("contact_id", (item as any).lead_id) // try direct match first
            .maybeSingle();
          
          if (ccLookup) {
            contactId = ccLookup.contact_id;
          } else {
            // Try finding contact by lead_id (if leads table has contact_id or email match)
            const { data: lead } = await supabase
              .from("leads")
              .select("id, email")
              .eq("id", (item as any).lead_id)
              .maybeSingle();
            
            if (lead?.email) {
              const { data: contact } = await supabase
                .from("contacts")
                .select("id")
                .eq("email", lead.email)
                .maybeSingle();
              
              if (contact) {
                contactId = contact.id;
              }
            }
          }
        }
        
        if (contactId) {
          const { data: cc } = await supabase
            .from("campaign_contacts")
            .select("is_paused, pause_reason, pause_until")
            .eq("campaign_id", item.campaign_id)
            .eq("contact_id", contactId)
            .maybeSingle();

          if (cc?.is_paused) {
            // mark pending row as paused and bail out
            await supabase.from("send_queue")
              .update({ 
                paused_at: new Date().toISOString(), 
                pause_reason: cc.pause_reason 
              })
              .eq("id", item.id);
            continue;
          }
        }
      }
      
      // Get sender email from metadata or fallback (adjust based on your schema)
      const senderEmail = (item as any).sender_email 
        || (item as any).metadata?.sender_email
        || (item as any).from_email
        || '';

      // ============================================
      // Block 452: Deliverability Engine v1 Enforcement
      // ============================================
      const senderInboxId = (item as any).sender_inbox_id;
      if (senderInboxId) {
        // Check inbox health and enforce limits
        const { data: inboxCheck, error: inboxCheckError } = await supabase
          .rpc("can_inbox_send", { p_inbox_id: senderInboxId })
          .single();

        if (inboxCheckError) {
          console.error("Inbox check error:", inboxCheckError);
        } else if (!inboxCheck?.allowed) {
          // Inbox cannot send - pause or disable
          await supabase.from("send_queue").update({
            status: "suppressed",
            error: `deliverability_blocked: ${inboxCheck.reason || "inbox health check failed"}`,
            sent_at: new Date().toISOString()
          }).eq("id", item.id);

          // Log activity
          const { data: inbox } = await supabase
            .from("sender_inboxes")
            .select("workspace_id, email")
            .eq("id", senderInboxId)
            .single();

          if (inbox) {
            await supabase.from("workspace_activity").insert({
              workspace_id: inbox.workspace_id,
              type: "deliverability",
              subtype: "send_blocked",
              metadata: {
                inbox_id: senderInboxId,
                inbox_email: inbox.email,
                reason: inboxCheck.reason,
                queue_id: item.id
              }
            });
          }

          continue;
        }

        // Check daily quota
        const { data: hasQuota, error: quotaError } = await supabase
          .rpc("has_inbox_quota_remaining", { 
            p_inbox_id: senderInboxId,
            p_today_start: new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
          })
          .single();

        if (!quotaError && !hasQuota) {
          // Daily quota exceeded - reschedule for tomorrow
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(8, 0, 0, 0);

          await supabase.from("send_queue").update({
            status: "pending",
            scheduled_at: tomorrow.toISOString(),
            error: "daily_quota_exceeded"
          }).eq("id", item.id);

          continue;
        }

        // Get domain from inbox and check domain health
        const { data: inboxDomain } = await supabase
          .from("sender_inboxes")
          .select("domain_id, sender_domains!inner(domain)")
          .eq("id", senderInboxId)
          .single();

        if (inboxDomain?.sender_domains?.domain) {
          const domain = (inboxDomain.sender_domains as any).domain;
          
          // Check domain quota
          const { data: domainHasQuota } = await supabase
            .rpc("has_domain_quota_remaining", {
              p_domain: domain,
              p_today_start: new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
            })
            .single();

          if (!domainHasQuota) {
            // Domain quota exceeded - reschedule
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(8, 0, 0, 0);

            await supabase.from("send_queue").update({
              status: "pending",
              scheduled_at: tomorrow.toISOString(),
              error: "domain_daily_quota_exceeded"
            }).eq("id", item.id);

            continue;
          }
        }
      }

      // Block 18: Use shouldSend() gate (includes suppression check + warm-up + throttling)
      if (senderEmail && orgId) {
        const gate = await shouldSend(orgId, senderEmail, item.to_email);
        if (!gate.allowed) {
          // Mark as skipped with reason
          await supabase.from("send_queue").update({
            status: "suppressed",
            error: gate.reason || "throttled",
            sent_at: new Date().toISOString()
          }).eq("id", item.id);
          
          // If this is part of an enrollment, cancel it
          if ((item as any).enrollment_id) {
            await supabase.from("sequence_enrollments")
              .update({ status: "cancelled" })
              .eq("id", (item as any).enrollment_id);
          }
          continue;
        }
      } else {
        // Fallback: Check suppression only if shouldSend unavailable
        const { data: blocked } = await supabase.rpc('is_suppressed', {
          p_email: item.to_email.toLowerCase(),
          p_org: orgId
        }).catch(() => ({ data: false }));

        if (blocked) {
          await supabase.from("send_queue").update({
            status: "suppressed",
            error: "suppressed",
            sent_at: new Date().toISOString()
          }).eq("id", item.id);
          
          if ((item as any).enrollment_id) {
            await supabase.from("sequence_enrollments")
              .update({ status: "cancelled" })
              .eq("id", (item as any).enrollment_id);
          }
          continue;
        }
      }

      const accountId = (item as any).account_id as string | undefined;
      let htmlToSend = (item.body_html as string | null | undefined) ?? null;
      const plainBody = (item as any).body as string | undefined;

      if (htmlToSend && TRACK_HOST && accountId) {
        const { html: trackedHtml, links } = await rewriteHtmlForTracking({
          accountId,
          queueId: item.id,
          html: htmlToSend,
          trackingHost: TRACK_HOST,
        });

        if (links.length) {
          const { error: linkErr } = await supabase
            .from("tracked_links")
            .upsert(
              links.map((l) => ({
                account_id: accountId,
                queue_id: item.id,
                idx: l.idx,
                original_url: l.from,
                short_code: l.code,
              })),
              { onConflict: "short_code" }
            );
          if (linkErr) {
            console.error("tracked_links upsert error", linkErr);
          }
        }

        htmlToSend = trackedHtml;
      }

      const finalHtml = withUnsubscribeFooter(
        htmlToSend ?? plainBody ?? "",
        item.campaign_id,
        item.to_email
      );

      await gmailSendThroughWorkspace(item.workspace_id, {
        to: item.to_email,
        subject: item.subject,
        html: finalHtml,
        org_id: orgId,
        campaignId: item.campaign_id
      });

      await supabase.from("send_queue").update({
        status: "sent", sent_at: new Date().toISOString(), attempts: item.attempts + 1
      }).eq("id", item.id);
    } catch (e: any) {
      const msg = String(e?.message || "");
      
      // Handle suppression errors
      if (msg.includes("suppressed")) {
        await supabase.from("send_queue").update({
          status: "suppressed",
          error: "suppressed",
          sent_at: new Date().toISOString()
        }).eq("id", item.id);
        continue;
      }

      const looksSoft = /(rate|quota|temporar|try again|4\d{2})/i.test(msg);
      const { delayMs, giveUp } = nextRetry(item.attempts || 0);

      if (!looksSoft || giveUp) {
        await supabase.from("send_queue").update({
          status: "failed", error: msg.slice(0, 300), attempts: (item.attempts || 0) + 1
        }).eq("id", item.id);
      } else {
        const nextAt = new Date(Date.now() + delayMs).toISOString();
        await supabase.from("send_queue").update({
          status: "pending", scheduled_at: nextAt, attempts: (item.attempts || 0) + 1, error: `retry: ${msg.slice(0,200)}`
        }).eq("id", item.id);
      }
    }
  }
}

/**
 * Block 180: Safe-send auto-pause logic
 * Checks bounce rate, domain reputation, and other safety metrics
 */
async function checkSafeSendConditions(campaignId: string): Promise<boolean> {
  try {
    // Check bounce rate in last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const { count: totalSent } = await supabase
      .from("email_logs")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .gte("created_at", twentyFourHoursAgo.toISOString())
      .eq("status", "sent");
    
    const { count: bounced } = await supabase
      .from("email_bounces")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .gte("created_at", twentyFourHoursAgo.toISOString());
    
    if (totalSent && totalSent > 0) {
      const bounceRate = (bounced || 0) / totalSent;
      if (bounceRate > 0.08) { // 8% bounce rate threshold
        return true; // Pause campaign
      }
    }
    
    // Check if too many sent in last hour (safety throttle)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const { count: sentLastHour } = await supabase
      .from("email_logs")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .gte("created_at", oneHourAgo.toISOString())
      .eq("status", "sent");
    
    if ((sentLastHour || 0) > 100) { // Safety threshold: 100 emails/hour
      return true; // Pause campaign
    }
    
    return false; // No pause needed
  } catch (e) {
    console.error("Error checking safe-send conditions:", e);
    return false; // Don't pause on error
  }
}