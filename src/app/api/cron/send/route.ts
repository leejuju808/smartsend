import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import {
  canSendFromDomain,
  incrementHourlyCounter,
  getCurrentHourStart,
  resolveIspForDomain,
  withIspSendLock,
  sendWithJitter,
  recordSendOutcome,
} from "@/lib/deliverability";
import { selectVariantThompson, type VariantPerformance } from "@/lib/bandit";
import { FailoverSender } from "@/lib/failoverSender";
import { RiskRadar } from "@/lib/risk";
import { getCampaignTemplates, selectAndRenderTemplate } from "@/lib/campaignTemplates";
import { newTrackingToken } from "@/lib/tracking";

// Simple unsubscribe token signer (replace with actual implementation if needed)
function signUnsubToken(user_id: string, email: string) {
  // Simple token generation - replace with proper HMAC implementation
  return Buffer.from(JSON.stringify({ u: user_id, e: email })).toString('base64');
}

export const runtime = "nodejs";

interface SendableRecipient {
  id: string;
  campaign_id: string;
  user_id: string;
  account_id?: string | null;
  email: string;
  domain: string;
  step_index: number;
  mailbox_id?: string;
  attempts?: number;
  ispKey?: string | null;
  mxHost?: string | null;
}

/**
 * Get recipients ready to send (respecting caps and warmup)
 */
async function getSendableRecipients(): Promise<SendableRecipient[]> {
  try {
    // Get recipients queued for sending
    const { data: recipients, error } = await supabaseAdmin
      .from('campaign_recipients')
      .select(`
        id,
        campaign_id,
        user_id,
        email,
        status,
        attempts,
        campaigns!inner(
          status,
          step_count,
          account_id
        )
      `)
      .eq('status', 'queued')
      .eq('campaigns.status', 'running');

    if (error || !recipients) {
      console.error('Error getting recipients:', error);
      return [];
    }

    const sendable: SendableRecipient[] = [];
    
    for (const recipient of recipients) {
      try {
        const domain = recipient.email.split('@')[1]?.toLowerCase();
        if (!domain) {
          console.warn(`Skipping recipient without domain: ${recipient.email}`);
          continue;
        }
        const stepIndex = 1; // Default to step 1 for campaigns
        const mailboxId = undefined; // Will be determined by domain
        const campaign = recipient.campaigns;
        const accountId = campaign?.account_id ?? null;
        
        // Check if we can send from this domain
        const canSend = await canSendFromDomain(domain, recipient.user_id, mailboxId, accountId);
        
        if (canSend.allowed) {
          sendable.push({
            id: recipient.id,
            campaign_id: recipient.campaign_id,
            user_id: recipient.user_id,
            account_id: accountId ?? undefined,
            email: recipient.email,
            domain,
            step_index: stepIndex,
            mailbox_id: mailboxId,
            attempts: recipient.attempts || 0,
            ispKey: canSend.ispKey ?? undefined,
            mxHost: canSend.mxHost ?? undefined,
          });
        } else {
          // Reschedule for later if caps exceeded
          const nextSendAt = canSend.nextAvailable || new Date(Date.now() + 60 * 60 * 1000); // Default: 1 hour
          
          await supabaseAdmin
            .from('campaign_recipients')
            .update({ 
              status: 'pending',
              error: canSend.reason ?? null,
              // Add a rescheduled_at field if you want to track this
            })
            .eq('id', recipient.id);
          
          console.log(`Rescheduled ${recipient.email} for ${nextSendAt.toISOString()} due to ${canSend.reason ?? 'unknown_reason'} (isp=${canSend.ispKey ?? 'n/a'})`);
        }
      } catch (error) {
        console.error(`Error processing recipient ${recipient.email}:`, error);
      }
    }
    
    return sendable;
  } catch (error) {
    console.error('Error in getSendableRecipients:', error);
    return [];
  }
}

/**
 * Send email to a recipient with risk checks and failover
 */
async function sendEmail(recipient: SendableRecipient): Promise<boolean> {
  try {
    // Get campaign details
    const { data: campaign } = await supabaseAdmin
      .from('campaigns')
      .select('subject, body_html, from_name, from_email, workspace_id, account_id')
      .eq('id', recipient.campaign_id)
      .single();
    
    if (!campaign) {
      console.error(`Campaign not found: ${recipient.campaign_id}`);
      return false;
    }

    const accountId = recipient.account_id ?? campaign.account_id ?? null;
    
    // BLOCK 181: Deliverability Guardrail Check
    if (accountId && campaign.from_email) {
      const senderDomain = campaign.from_email.split('@')[1]?.toLowerCase();
      if (senderDomain) {
        // Get deliverability stats
        const { data: deliv } = await supabaseAdmin
          .from('deliverability_stats')
          .select('*')
          .eq('account_id', accountId)
          .eq('domain', senderDomain)
          .maybeSingle();

        if (deliv) {
          // Check reputation score
          if (deliv.reputation_score < 60) {
            // Auto-pause campaign
            await supabaseAdmin
              .from('campaigns')
              .update({ 
                status: 'paused',
                pause_reason: 'reputation_low'
              })
              .eq('id', recipient.campaign_id);
            
            console.log(`Campaign ${recipient.campaign_id} auto-paused: reputation score ${deliv.reputation_score} < 60`);
            return false;
          }

          // Check bounce spike
          if (deliv.bounces_24h > 20) {
            await supabaseAdmin
              .from('campaigns')
              .update({ 
                status: 'paused',
                pause_reason: 'bounce_spike'
              })
              .eq('id', recipient.campaign_id);
            
            console.log(`Campaign ${recipient.campaign_id} auto-paused: bounce spike (${deliv.bounces_24h} bounces in 24h)`);
            return false;
          }

          // Check bounce rate > 8%
          const bounceRate = deliv.sent_24h > 0 
            ? (deliv.bounces_24h / deliv.sent_24h) * 100 
            : 0;
          
          if (bounceRate > 8) {
            await supabaseAdmin
              .from('campaigns')
              .update({ 
                status: 'paused',
                pause_reason: 'bounce_rate_high'
              })
              .eq('id', recipient.campaign_id);
            
            console.log(`Campaign ${recipient.campaign_id} auto-paused: bounce rate ${bounceRate.toFixed(2)}% > 8%`);
            return false;
          }

          // Check unsubscribe surge
          if (deliv.unsubscribes_24h > 10) {
            await supabaseAdmin
              .from('campaigns')
              .update({ 
                status: 'paused',
                pause_reason: 'unsubscribe_surge'
              })
              .eq('id', recipient.campaign_id);
            
            console.log(`Campaign ${recipient.campaign_id} auto-paused: unsubscribe surge (${deliv.unsubscribes_24h} unsubscribes in 24h)`);
            return false;
          }
        }
      }
    }
    let ispKey = recipient.ispKey ?? null;
    let mxHost = recipient.mxHost ?? null;

    if (!ispKey) {
      const resolution = await resolveIspForDomain(recipient.domain);
      ispKey = resolution.ispKey;
      mxHost = resolution.mxHost;
    }

    // Fetch templates for this campaign
    const templates = await getCampaignTemplates(supabaseAdmin, recipient.campaign_id);
    
    // Fetch lead data for this recipient
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('id, email, first_name, last_name, company, title')
      .eq('email', recipient.email)
      .maybeSingle();

    let selectedSubject = campaign.subject;
    let selectedBody = campaign.body_html;
    let templateId: string | null = null;

    // Use template if available, otherwise fall back to campaign defaults
    if (templates.length > 0 && lead) {
      const rendered = selectAndRenderTemplate(templates, {
        email: lead.email || recipient.email,
        first_name: lead.first_name,
        last_name: lead.last_name,
        company: lead.company,
        title: lead.title,
      });
      
      if (rendered) {
        selectedSubject = rendered.subject;
        selectedBody = rendered.html || rendered.text || campaign.body_html;
        templateId = rendered.templateId;
      }
    }

    // EXPERIMENTS: Get campaign variants for this step (fallback if templates not used)
    let variantId: string | null = null;
    
    if (!templates.length) {
      const { data: variants, error: variantsError } = await supabaseAdmin
        .from('campaign_variants')
        .select('id, name, subject, body_html, objective, min_impressions')
        .eq('campaign_id', recipient.campaign_id)
        .eq('step_index', recipient.step_index)
        .eq('is_paused', false);

      if (variants && variants.length > 0) {
        // Get variant metrics for Thompson Sampling
        const { data: metrics, error: metricsError } = await supabaseAdmin
          .from('variant_metrics')
          .select('variant_id, impressions, opens, clicks, replies')
          .in('variant_id', variants.map(v => v.id));

        if (!metricsError && metrics) {
          // Prepare variant performance data for bandit selection
          const variantPerformance: VariantPerformance[] = variants.map(variant => {
            const metric = metrics.find(m => m.variant_id === variant.id);
            return {
              id: variant.id,
              name: variant.name,
              impressions: metric?.impressions || 0,
              opens: metric?.opens || 0,
              clicks: metric?.clicks || 0,
              replies: metric?.replies || 0,
              objective: variant.objective as 'open' | 'click' | 'reply'
            };
          });

          // Select variant using Thompson Sampling
          const selectedVariant = selectVariantThompson(variantPerformance);
          const variant = variants.find(v => v.id === selectedVariant.variantId);
          
          if (variant) {
            selectedSubject = variant.subject;
            selectedBody = variant.body_html;
            variantId = variant.id;
            console.log(`Selected variant "${variant.name}" for ${recipient.email} (confidence: ${selectedVariant.confidence.toFixed(2)})`);
          }
        }
      }
    }

    // RISK RADAR CHECK - Check if domain can send
    const riskRadar = new RiskRadar(campaign.workspace_id);
    const riskAssessment = await riskRadar.canDomainSend(recipient.domain);
    
    if (!riskAssessment.allowed) {
      // Domain blocked due to high risk - reschedule for tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0); // 9 AM tomorrow
      
      await supabaseAdmin
        .from('campaign_recipients')
        .update({ 
          status: 'pending',
          scheduled_for: tomorrow.toISOString(),
          error: `Risk blocked: ${riskAssessment.reason}`
        })
        .eq('id', recipient.id);
      
      console.log(`Domain ${recipient.domain} blocked due to ${riskAssessment.risk_level} risk, rescheduled for ${tomorrow}`);
      return false;
    }

    if (riskAssessment.delay_minutes > 0) {
      // Domain slowed due to watch risk - add delay
      const delayedTime = new Date();
      delayedTime.setMinutes(delayedTime.getMinutes() + riskAssessment.delay_minutes);
      
      await supabaseAdmin
        .from('campaign_recipients')
        .update({ 
          status: 'pending',
          scheduled_for: delayedTime.toISOString(),
          error: `Risk delayed: ${riskAssessment.reason}`
        })
        .eq('id', recipient.id);
      
      console.log(`Domain ${recipient.domain} slowed due to ${riskAssessment.risk_level} risk, delayed by ${riskAssessment.delay_minutes} minutes`);
      return false;
    }
    
    // Check suppression list
    const { data: sup } = await supabaseAdmin
      .from("suppression_list")
      .select("id")
      .eq("user_id", recipient.user_id)
      .eq("email", recipient.email.toLowerCase())
      .maybeSingle();

    if (sup) {
      await supabaseAdmin
        .from("campaign_recipients")
        .update({ status: "failed", error: "suppressed" })
        .eq("id", recipient.id);
      console.log(`Email suppressed for ${recipient.email}`);
      return false;
    }

    // Create tracking token
    const openToken = newTrackingToken();
    
    // Inject tracking pixel and wrap links with Block 165 tracking system
    let htmlBody = selectedBody;
    
    // Get lead_id from lead data if available
    const leadId = lead?.id || null;
    if (leadId && recipient.campaign_id) {
      // Use Block 165 tracking system (HMAC-signed)
      const { injectEmailTracking } = await import("@/lib/email/tracking");
      htmlBody = injectEmailTracking(htmlBody, leadId, recipient.campaign_id);
    } else {
      // Fallback to legacy tracking
      const pixel = `<img src="/api/t/o/${openToken}" width="1" height="1" style="display:none" alt="" />`;
      htmlBody = htmlBody + '\n' + pixel;
    }

    // EXPERIMENTS: Create delivery record if variant or template was selected
    const selectedId = templateId || variantId;
    if (selectedId) {
      try {
        const { data: delivery, error: deliveryError } = await supabaseAdmin
          .from('deliveries')
          .insert({
            campaign_id: recipient.campaign_id,
            variant_id: selectedId, // Can be template_id or variant_id
            contact_id: recipient.id, // Assuming recipient.id maps to contact_id
            step_index: recipient.step_index,
            status: 'sent'
          })
          .select()
          .single();

        if (!deliveryError && delivery) {
          // Update tracking tokens with delivery and variant info
          await supabaseAdmin
            .from('tracking_tokens')
            .update({ 
              delivery_id: delivery.id,
              variant_id: selectedId
            })
            .eq('token', openToken);
        }
      } catch (error) {
        console.error('Error creating delivery record:', error);
        // Don't fail the send if delivery tracking fails
      }
    }
    
    // PROVIDER FAILOVER SENDING
    const failoverSender = new FailoverSender({ 
      workspace_id: campaign.workspace_id 
    });
    
    // Generate unsubscribe token and URL
    const token = signUnsubToken(recipient.user_id, recipient.email);
    const unsubscribeUrl = `${process.env.SMARTSEND_UNSUB_BASE}?t=${encodeURIComponent(token)}`;
    
    const performSend = async () => failoverSender.sendWithFailover({
      to: recipient.email,
      from: campaign.from_email,
      subject: selectedSubject,
      html: htmlBody,
      trackingPixel: openToken,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
      }
    });

    const { locked, result: lockedResult } = await withIspSendLock(accountId, ispKey, async () =>
      sendWithJitter(accountId, ispKey, performSend)
    );

    if (!locked || !lockedResult) {
      console.log(`ISP concurrency limit hit for account=${accountId ?? 'n/a'} isp=${ispKey ?? 'unknown'}; rescheduling ${recipient.email}`);
      await supabaseAdmin
        .from('campaign_recipients')
        .update({
          status: 'pending',
          error: 'isp_concurrency_limit'
        })
        .eq('id', recipient.id);
      return false;
    }

    const sendResult = lockedResult;
    
    if (sendResult.success) {
      // Success! Mark as sent and record provider info
      await supabaseAdmin
        .from('campaign_recipients')
        .update({ 
          status: 'sent',
          sent_at: new Date().toISOString()
        })
        .eq('id', recipient.id);
      
      // EXPERIMENTS: Increment template or variant impressions if selected
      const metricsId = templateId || variantId;
      if (metricsId) {
        try {
          await supabaseAdmin
            .from('variant_metrics')
            .upsert({
              variant_id: metricsId, // Can be template_id or variant_id
              campaign_id: recipient.campaign_id,
              step_index: recipient.step_index,
              impressions: 1,
              opens: 0,
              clicks: 0,
              replies: 0
            }, {
              onConflict: 'variant_id',
              ignoreDuplicates: false
            });
        } catch (error) {
          console.error('Error incrementing template/variant metrics:', error);
          // Don't fail the send if metrics tracking fails
        }
      }

      // Record the send event with provider info
      await supabaseAdmin
        .from('email_events')
        .insert({
          campaign_id: recipient.campaign_id,
          user_id: recipient.user_id,
          email_lower: recipient.email.toLowerCase(),
          event_type: 'sent',
          event_data: {
            provider_id: sendResult.provider,
            message_id: sendResult.messageId,
            attempts: sendResult.attempts,
            providers_tried: sendResult.providers_tried,
            final_provider: sendResult.final_provider,
            total_time_ms: sendResult.total_time_ms
          },
          recipient_domain: recipient.domain
        });

      // BLOCK 181: Increment sent counter for deliverability tracking
      if (accountId && campaign.from_email) {
        const senderDomain = campaign.from_email.split('@')[1]?.toLowerCase();
        if (senderDomain) {
          await supabaseAdmin.rpc('increment_sent', {
            acc: accountId,
            dom: senderDomain
          }).catch(err => {
            console.error('Error incrementing sent counter:', err);
          });
        }
      }

      await recordSendOutcome({
        accountId,
        campaignId: recipient.campaign_id,
        leadId: null,
        domain: recipient.domain,
        ispKey,
        outcome: 'sent',
        meta: {
          provider: sendResult.final_provider,
          mx_host: mxHost,
          attempts: sendResult.attempts
        }
      });
      
      // Increment hourly counter
      const hourStart = getCurrentHourStart();
      await incrementHourlyCounter(recipient.domain, recipient.user_id, hourStart);
      
      console.log(`Email sent successfully to ${recipient.email} via ${sendResult.final_provider} (${sendResult.attempts} attempts)`);
      return true;
    } else {
      // All providers failed
      await supabaseAdmin
        .from('campaign_recipients')
        .update({ 
          status: 'failed',
          error: `Provider failover failed: ${sendResult.error}`,
          attempts: (recipient.attempts || 0) + 1
        })
        .eq('id', recipient.id);
      
      console.log(`All providers failed for ${recipient.email}: ${sendResult.error}`);

      await recordSendOutcome({
        accountId,
        campaignId: recipient.campaign_id,
        leadId: null,
        domain: recipient.domain,
        ispKey,
        outcome: 'temp_fail',
        meta: {
          provider: sendResult.final_provider,
          error: sendResult.error ?? 'send_error',
          attempts: sendResult.attempts
        }
      });
      return false;
    }
    
  } catch (error) {
    console.error(`Error sending email to ${recipient.email}:`, error);
    
    // Mark as failed
    await supabaseAdmin
      .from('campaign_recipients')
      .update({ 
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        attempts: (recipient.attempts || 0) + 1
      })
      .eq('id', recipient.id);
    
    await recordSendOutcome({
      accountId: recipient.account_id ?? null,
      campaignId: recipient.campaign_id,
      leadId: null,
      domain: recipient.domain,
      ispKey: recipient.ispKey ?? null,
      outcome: 'temp_fail',
      meta: {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    });

    return false;
  }
}

/**
 * Process sequence sends (for multi-step sequences)
 */
async function processSequenceSends(): Promise<void> {
  try {
    // Get active sequence runs ready for next step
    const { data: sequenceRuns, error } = await supabaseAdmin
      .from('sequence_runs')
      .select(`
        id,
        sequence_id,
        contact_id,
        current_step,
        last_sent_at
      `)
      .eq('stopped', false)
      .is('last_sent_at', null); // First step
    
    if (error || !sequenceRuns) {
      console.error('Error getting sequence runs:', error);
      return;
    }
    
    for (const run of sequenceRuns) {
      try {
        // Get contact details
        const { data: contact } = await supabaseAdmin
          .from('contacts')
          .select('email, user_id')
          .eq('id', run.contact_id)
          .single();
        
        if (!contact) {
          console.warn(`Contact not found for sequence run ${run.id}`);
          continue;
        }
        
        const domain = contact.email.split('@')[1];
        const stepIndex = run.current_step;
        
        // Check if we can send from this domain
        const canSend = await canSendFromDomain(domain, contact.user_id);
        
        if (canSend.allowed) {
          // TODO: Implement sequence step sending
          // This would get the step content and send it
          console.log(`Would send sequence step ${stepIndex} to ${contact.email}`);
          
          // Update last_sent_at and increment step
          await supabaseAdmin
            .from('sequence_runs')
            .update({
              last_sent_at: new Date().toISOString(),
              current_step: stepIndex + 1
            })
            .eq('id', run.id);
          
          // Increment hourly counter
          const hourStart = getCurrentHourStart();
          await incrementHourlyCounter(domain, contact.user_id, hourStart);
          
        } else {
          // Reschedule for later
          console.log(`Rescheduled sequence step for ${contact.email} due to ${canSend.reason}`);
        }
      } catch (error) {
        console.error(`Error processing sequence run ${run.id}:`, error);
      }
    }
  } catch (error) {
    console.error('Error in processSequenceSends:', error);
  }
}

/**
 * Main cron job function
 */
export async function GET(request: NextRequest) {
  try {
    // Verify this is a cron job (optional security)
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    console.log('Starting SmartSend cron job...');
    
    // Process campaign sends
    const sendableRecipients = await getSendableRecipients();
    console.log(`Found ${sendableRecipients.length} sendable recipients`);
    
    let sentCount = 0;
    let failedCount = 0;
    
    for (const recipient of sendableRecipients) {
      try {
        const success = await sendEmail(recipient);
        if (success) {
          sentCount++;
        } else {
          failedCount++;
        }
      } catch (error) {
        console.error(`Error processing recipient ${recipient.email}:`, error);
        failedCount++;
      }
    }
    
    // Process sequence sends
    await processSequenceSends();
    
    console.log(`Cron job completed. Sent: ${sentCount}, Failed: ${failedCount}`);
    
    return NextResponse.json({
      success: true,
      sent: sentCount,
      failed: failedCount,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error in cron job:', error);
    return NextResponse.json(
      { error: 'Cron job failed' },
      { status: 500 }
    );
  }
}

// Also support POST for webhook-style triggers
export { GET as POST }; 