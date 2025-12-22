import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { buildRoundRobin } from "@/lib/templates/variant-selector";
import { applyMergeTags, withFooterUnsub } from "@/lib/templates/merge";
import { pickRotationInbox } from "@/lib/inbox-rotation";
import { selectNextIdentity, getHealthyIdentities, recordIdentitySend } from "@/lib/identity-rotation";

type Variant = { id: string; weight: number; subject: string; body_html: string };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function checkAndConsume(userId: string, count: number) {
  const sb = createClient(url, service, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc("consume_send_quota", { p_user: userId, p_count: count });

  if (error) return { ok: false, message: error.message };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.ok) {
    return { 
      ok: false, 
      message: `Send limit reached. ${row.remaining}/${row.limit} remaining for ${row.period_key}. Upgrade to Pro/Team.` 
    };
  }

  return { ok: true };
}

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const campaignId = params.id;

  try {
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1) Fetch campaign + leads segment
    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("id, workspace_id, user_id, subject_template, body_template, start_at, from_email, provider, provider_account_id, ab_mode, org_id, status, ai_template_id, sender_account_id, account_id")
      .eq("id", campaignId)
      .maybeSingle();
    
    if (cErr || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Block 8170: Load outbound account if provider_account_id is set
    let outboundAccount: { provider: string; from_email: string } | null = null;
    if (campaign.provider_account_id) {
      const { data: account } = await supabase
        .from("outbound_email_accounts")
        .select("provider, from_email")
        .eq("id", campaign.provider_account_id)
        .maybeSingle();
      if (account) {
        outboundAccount = account;
      }
    }

    // Block 14800: Billing Guard - Check if user can send emails
    const { checkBillingGuard, syncBeforeSend } = await import("@/lib/billing/guard-v2");
    await syncBeforeSend(supabase, user.id);
    
    const billingCheck = await checkBillingGuard(supabase, user.id, 'send_email', {
      emailsToSend: 1, // Will check actual count later
    });

    if (!billingCheck.allowed) {
      return NextResponse.json({ 
        ok: false, 
        enqueued: 0, 
        message: billingCheck.reason || "Billing limit reached",
        upgradeRequired: billingCheck.upgradeRequired,
        upgradePlan: billingCheck.upgradePlan,
      }, { status: 402 });
    }

    const { data: planOk, error: planErr } = await supabase.rpc("can_send_under_plan", { p_campaign: campaignId });
    if (planErr) {
      return NextResponse.json({ error: planErr.message ?? "Plan check failed" }, { status: 400 });
    }

    if (planOk !== true) {
      return NextResponse.json({ ok: false, enqueued: 0, message: "Monthly send limit reached. Upgrade to send more." }, { status: 402 });
    }

    // Block 9100: Billing Guard - Check if account can send emails
    // Get account_id from campaign or user
    let accountId: string | null = null;
    if (campaign.account_id) {
      accountId = campaign.account_id;
    } else if (campaign.user_id) {
      // Try to get account_id from user's account
      const { data: account } = await supabase
        .from('accounts')
        .select('id')
        .eq('owner_user_id', campaign.user_id)
        .limit(1)
        .maybeSingle();
      accountId = account?.id || null;
    }

    if (accountId) {
      const { ensureCanSendEmail } = await import('@/lib/billing/guard');
      // Estimate emails to send (we'll check again before actual send)
      const estimatedEmails = 1; // Conservative check - actual count will be validated later
      const guardResult = await ensureCanSendEmail(accountId, estimatedEmails);
      
      if (!guardResult.allowed && guardResult.response) {
        return guardResult.response;
      }
    }

    // 1.5) Load AI template and variants if campaign uses AI templates
    let aiTemplate: any = null;
    let aiTemplateTests: any[] = [];
    if (campaign.ai_template_id) {
      const { data: template } = await supabase
        .from("ai_templates")
        .select("id, body, version")
        .eq("id", campaign.ai_template_id)
        .single();
      aiTemplate = template;

      if (template) {
        const { data: tests } = await supabase
          .from("ai_template_tests")
          .select("id, variant_body, variant_version, winner")
          .eq("template_id", template.id)
          .eq("winner", false)
          .order("created_at", { ascending: false });
        aiTemplateTests = tests || [];
      }
    }

    // 2) If ab_mode is 'single', get the winning variant from campaign_logs
    let winningVariantId: string | null = null;
    if (campaign.ab_mode === 'single') {
      const { data: promotionLog } = await supabase
        .from("campaign_logs")
        .select("message, meta")
        .eq("campaign_id", campaignId)
        .eq("action", "ab_winner_promoted")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      // Prefer meta field, fallback to parsing message
      if (promotionLog?.meta?.template_variant_id) {
        winningVariantId = promotionLog.meta.template_variant_id;
      } else if (promotionLog?.message) {
        const match = promotionLog.message.match(/variant\s+([a-f0-9-]{36})/i);
        if (match) {
          winningVariantId = match[1];
        }
      }
    }

    // 3) Load variants for this campaign
    const { data: templateRows } = await supabase
      .from("campaign_templates")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("user_id", user.id);
    
    let variants: Variant[] = [];
    if (templateRows?.length) {
      const templateIds = templateRows.map((r: any) => r.id);
      const query = supabase
        .from("template_variants")
        .select("id, weight, subject, body_html")
        .in("campaign_template_id", templateIds);
      
      // If ab_mode is single, only load the winning variant
      if (campaign.ab_mode === 'single' && winningVariantId) {
        query.eq("id", winningVariantId);
      }
      
      const { data: vars } = await query.order("created_at", { ascending: true });
      
      if (vars?.length) {
        variants = vars as any;
      }
    }

    // 4) If no variants, create a fallback variant from campaign templates
    let templateWheel: Variant[] = [];
    if (variants.length > 0) {
      // If ab_mode is single, use only the winning variant (no round-robin)
      if (campaign.ab_mode === 'single') {
        templateWheel = variants;
      } else {
        templateWheel = buildRoundRobin(variants);
      }
    } else {
      // Use base template as a single variant
      if (campaign.subject_template && campaign.body_template) {
        templateWheel = [{
          id: "base-fallback",
          weight: 100,
          subject: campaign.subject_template,
          body_html: campaign.body_template
        }];
      }
    }

    if (templateWheel.length === 0) {
      return NextResponse.json({ error: "No templates configured for this campaign" }, { status: 400 });
    }

    // 4) Get leads - using contacts table with workspace filtering
    const { data: contacts, error: lErr } = await supabase
      .from("contacts")
      .select("id, email, first_name, last_name, company")
      .eq("workspace_id", campaign.workspace_id);
    
    if (lErr) {
      return NextResponse.json({ error: lErr.message }, { status: 400 });
    }

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ ok: true, enqueued: 0, message: "No contacts to enqueue" });
    }

    // Filter out suppressed emails
    const orgId = campaign.org_id;
    let safeContacts = contacts;
    if (orgId) {
      const { data: suppressedRows } = await supabase
        .from("suppression_list")
        .select("email")
        .eq("org_id", orgId);
      const suppressed = new Set((suppressedRows || []).map((r: any) => r.email?.toLowerCase()));
      safeContacts = contacts.filter(c => !suppressed.has(c.email.toLowerCase()));
    }

    // Block 17800: Filter out bad leads before sending
    if (campaign.workspace_id && safeContacts.length > 0) {
      const supabaseAdmin = createClient(url, service);
      const contactIds = safeContacts.map(c => c.id);
      
      try {
        // Use RPC function to clean up bad leads
        const { data: cleanupResult, error: cleanupError } = await supabaseAdmin.rpc(
          "cleanup_bad_leads_before_send",
          {
            p_workspace_id: campaign.workspace_id,
            p_lead_ids: contactIds,
          }
        );

        if (!cleanupError && cleanupResult?.cleaned_lead_ids) {
          const cleanedSet = new Set(cleanupResult.cleaned_lead_ids);
          const beforeCount = safeContacts.length;
          safeContacts = safeContacts.filter(c => cleanedSet.has(c.id));
          const cleanedCount = beforeCount - safeContacts.length;
          
          if (cleanedCount > 0) {
            console.log(`Block 17800: Cleaned ${cleanedCount} bad lead(s) before sending`);
          }
        }
      } catch (cleanupErr: any) {
        console.error("Bad lead cleanup error:", cleanupErr);
        // Don't block sending on cleanup errors, just log
      }
    }

    if (!safeContacts || safeContacts.length === 0) {
      return NextResponse.json({ 
        ok: true, 
        enqueued: 0, 
        message: "All contacts are suppressed or marked as bad leads" 
      });
    }

    // 5) Run deliverability preflight
    if (orgId) {
      // Get subject and body from first variant or base template
      const sampleSubject = templateWheel[0]?.subject || campaign.subject_template || "";
      const sampleBody = templateWheel[0]?.body_html || campaign.body_template || "";
      
      // Extract sender domain from from_email
      const senderDomain = campaign.from_email?.split("@")[1] || null;
      
      try {
        const preflightRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/deliverabilityPreflight`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
          },
          body: JSON.stringify({
            org_id: orgId,
            campaign_id: campaignId,
            subject: sampleSubject,
            body: sampleBody,
            sender_domain: senderDomain
          })
        });
        
        if (preflightRes.ok) {
          const preflight = await preflightRes.json();
          if (preflight.severity === "HIGH") {
            return NextResponse.json({ 
              error: "Deliverability preflight failed: high-severity issues detected.",
              preflight 
            }, { status: 400 });
          }
        }
      } catch (preflightErr: any) {
        console.error("Preflight check failed:", preflightErr);
        // Don't block on preflight errors, just log
      }
    }

    // 6) Check if campaign has sequence steps defined
    const { data: steps } = await supabase
      .from("campaign_steps")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("active", true)
      .order("step_no", { ascending: true });

    const hasSequence = steps && steps.length > 0;
    
    // Helper function to pick step template (fallback to campaign templates)
    function pickStepTpl(stepNo: number) {
      const s = steps?.find(s => s.step_no === stepNo);
      return {
        id: s?.id || null,
        step_no: s?.step_no || stepNo,
        subject: (s?.subject_template ?? campaign!.subject_template),
        body: (s?.body_html_template ?? s?.body_template ?? campaign!.body_template),
        delay_days: s?.delay_days ?? 0,
        sender_mode: s?.sender_mode ?? 'single',
        sender_inbox_id: s?.sender_inbox_id ?? null,
        rotation_domain_id: s?.rotation_domain_id ?? null,
        has_variants: s?.has_variants || false,
        // Block 11600: A/B testing variant fields
        enable_variant: s?.enable_variant || false,
        subject_b: s?.subject_b || null,
        body_html_template_b: s?.body_html_template_b || null,
        variant_split: s?.variant_split ?? 50
      };
    }

    // 7) Check quota BEFORE enqueuing
    const quota = await checkAndConsume(user.id, safeContacts.length);
    if (!quota.ok) {
      return NextResponse.json({ error: quota.message }, { status: 402 }); // 402 Payment Required
    }

    // Block 12100: Check if identity rotation is enabled for this org
    let useIdentityRotation = false;
    let healthyIdentities: Array<{ id: string; email_address: string }> = [];
    if (campaign.org_id) {
      healthyIdentities = await getHealthyIdentities(supabase, campaign.org_id);
      // Enable rotation if org has 2+ healthy identities
      useIdentityRotation = healthyIdentities.length >= 2;
      
      if (useIdentityRotation && healthyIdentities.length === 1) {
        // Only 1 healthy identity - warn but continue
        console.warn(`Block 12100: Only 1 healthy identity available for org ${campaign.org_id}. Rotation disabled.`);
      }
    }

    // 7.5) Check if approval is required (Block 446)
    const { data: needsApproval } = await supabase.rpc("requires_approval", {
      p_workspace_id: campaign.workspace_id,
      p_campaign_id: campaignId
    });

    // Get campaign auto-approve timeout if exists
    const { data: campaignData } = await supabase
      .from("campaigns")
      .select("auto_approve_timeout_hours")
      .eq("id", campaignId)
      .single();
    
    const autoApproveHours = campaignData?.auto_approve_timeout_hours || null;

    // 8) Generate queue items
    const baseTime = campaign.start_at ? new Date(campaign.start_at) : new Date();
    const staggerMs = 45_000; // 45 seconds between emails

    if (hasSequence) {
      // Sequence mode: seed step 1
      const step1 = pickStepTpl(1);
      
      // Filter out leads that have replied, unsubscribed, or bounced
      const { data: leadStatuses } = await supabase
        .from("leads")
        .select("id, status, unsubscribed_at, bounced_at")
        .in("id", safeContacts.map(c => c.id));

      const safeLeadIds = new Set(
        (leadStatuses || [])
          .filter((l: any) => 
            l.status !== 'Replied' && 
            !l.unsubscribed_at && 
            !l.bounced_at
          )
          .map((l: any) => l.id)
      );

      const eligibleContacts = safeContacts.filter(c => safeLeadIds.has(c.id));

      if (eligibleContacts.length === 0) {
        return NextResponse.json({ 
          ok: true, 
          enqueued: 0, 
          message: "All contacts have replied, unsubscribed, or bounced" 
        });
      }

      // Create campaign_leads entries or update existing ones
      const clRows = eligibleContacts.map((contact) => ({
        campaign_id: campaignId,
        lead_id: contact.id,
        current_step: 1,
        state: 'Pending'
      }));

      // Upsert campaign_leads
      for (const cl of clRows) {
        await supabase.from("campaign_leads")
          .upsert(cl, { onConflict: "campaign_id,lead_id" });
      }

      // Get account_id for scheduling
      const accountId = (campaign as any).sender_account_id || (campaign as any).account_id;
      if (!accountId) {
        return NextResponse.json({ error: "Campaign must have a sender_account_id or account_id" }, { status: 400 });
      }

      // Get lead timezones for scheduling
      const leadIds = eligibleContacts.map(c => c.id);
      const { data: leads } = await supabase
        .from("leads")
        .select("id, meta, tz")
        .in("id", leadIds);
      const { data: campaignLeads } = await supabase
        .from("campaign_leads")
        .select("lead_id, timezone")
        .in("lead_id", leadIds)
        .eq("campaign_id", campaignId);

      const leadTzMap = new Map<string, string | null>();
      (leads || []).forEach((l: any) => {
        const tz = l.meta?.tz || l.tz || null;
        leadTzMap.set(l.id, tz);
      });
      (campaignLeads || []).forEach((cl: any) => {
        if (cl.timezone) {
          leadTzMap.set(cl.lead_id, cl.timezone);
        }
      });

      // Create queue rows for step 1 with scheduling
      // Block 446: If approval required, route to approval_queue instead of send_queue
      const rows = await Promise.all(eligibleContacts.map(async (contact, i) => {
        const varsObj = {
          name: contact.first_name || contact.last_name || "",
          company: contact.company || "",
          email: contact.email,
          first_name: contact.first_name || "",
          last_name: contact.last_name || ""
        };

        // Block 11600: A/B testing variant selection
        let variantUsed: 'A' | 'B' = 'A';
        let variantSubject = step1.subject;
        let variantBody = step1.body;
        
        if (step1.enable_variant && step1.subject_b && step1.body_html_template_b) {
          // Generate random 0-99 and compare to variant_split
          const rand = Math.floor(Math.random() * 100);
          if (rand < (step1.variant_split ?? 50)) {
            variantUsed = 'A';
            variantSubject = step1.subject;
            variantBody = step1.body;
          } else {
            variantUsed = 'B';
            variantSubject = step1.subject_b;
            variantBody = step1.body_html_template_b;
          }
        }
        
        // Legacy variant support (Block 10300) - keep for backward compatibility
        if (!step1.enable_variant && step1.has_variants && step1.id) {
          // Randomly assign variant (50/50 split)
          variantUsed = Math.random() < 0.5 ? 'A' : 'B';
          
          // Load variant content
          const { data: variant } = await supabase
            .from("sequence_step_variants")
            .select("subject, body")
            .eq("step_id", step1.id)
            .eq("variant_key", variantUsed)
            .maybeSingle();
          
          if (variant) {
            variantSubject = variant.subject || step1.subject;
            variantBody = variant.body || step1.body;
          }
        }
        
        // Render templates with merge tags
        let subject = applyMergeTags(variantSubject, varsObj);
        const bodyHtml = applyMergeTags(variantBody, varsObj);
        const finalHtml = withFooterUnsub(bodyHtml, user.id, contact.email, campaignId);
        
        // Append SmartSend tracking token to subject
        const token = `[SS|${contact.id}]`;
        subject = `${subject} ${token}`;

        // Handle inbox rotation if enabled for this step (pick per email for rotation)
        // Block 442: Now considers team inbox assignments
        let selectedInboxId: string | null = null;
        if (step1.sender_mode === 'rotation' && step1.rotation_domain_id) {
          selectedInboxId = await pickRotationInbox(supabase, step1.rotation_domain_id, user.id);
          // Don't fail if rotation fails for one email, just log and continue
          if (!selectedInboxId) {
            console.warn(`No healthy inbox available for rotation (contact ${contact.id})`);
          }
        } else if (step1.sender_mode === 'single' && step1.sender_inbox_id) {
          // Block 442: Verify user can use this inbox
          const { data: canUse } = await supabase.rpc("can_user_use_inbox", {
            p_inbox_id: step1.sender_inbox_id,
            p_user_id: user.id,
          });
          if (canUse) {
            selectedInboxId = step1.sender_inbox_id;
          } else {
            console.warn(`User ${user.id} cannot use inbox ${step1.sender_inbox_id} - not assigned`);
          }
        }

        // Get lead timezone and compute next permissible send time
        const leadTz = leadTzMap.get(contact.id) || null;
        let scheduledTime: string;
        
        try {
          const { data: nextAt, error: schedErr } = await supabase.rpc("next_permissible_send_at", {
            p_account: accountId,
            p_lead_tz: leadTz,
            p_now: baseTime.toISOString()
          });
          
          if (schedErr || !nextAt) {
            // Fallback to staggered time if RPC fails
            scheduledTime = new Date(baseTime.getTime() + i * staggerMs).toISOString();
          } else {
            // Use the computed time, but add a small stagger to avoid exact overlaps
            const computedTime = new Date(nextAt);
            scheduledTime = new Date(computedTime.getTime() + i * 1000).toISOString(); // 1 second stagger
          }
        } catch (err) {
          // Fallback on error
          scheduledTime = new Date(baseTime.getTime() + i * staggerMs).toISOString();
        }

        // Calculate auto_approve_at if auto-approval is enabled
        let autoApproveAt: string | null = null;
        if (autoApproveHours && autoApproveHours > 0) {
          const autoApproveDate = new Date(scheduledTime);
          autoApproveDate.setHours(autoApproveDate.getHours() + autoApproveHours);
          autoApproveAt = autoApproveDate.toISOString();
        }

        // Get step_id for sequence steps
        const stepId = steps && steps.length > 0 ? steps[0].id : null;

        // Block 12100: Select identity for rotation if enabled
        let selectedIdentityId: string | null = null;
        if (useIdentityRotation && campaign.org_id) {
          selectedIdentityId = await selectNextIdentity(supabase, campaign.org_id);
          if (!selectedIdentityId) {
            console.warn(`Block 12100: No healthy identity available for rotation (contact ${contact.id})`);
          }
        }

        if (needsApproval) {
          // Block 446: Route to approval_queue
          return {
            workspace_id: campaign.workspace_id,
            campaign_id: campaign.id,
            lead_id: contact.id,
            inbox_id: selectedInboxId,
            step_id: stepId,
            email_subject: subject,
            email_body: finalHtml,
            scheduled_at: scheduledTime,
            submitted_by: user.id,
            auto_approve_at: autoApproveAt,
            variant_key: variantUsed, // Block 11600: Track variant in approval queue
            sending_identity_id: selectedIdentityId // Block 12100: Track identity for rotation
          };
        } else {
          // Normal flow: route to send_queue
          // Block 8170: Include provider info from campaign + outbound account
          // Block 10300: Include variant_key for A/B testing
          // Block 12100: Include sending_identity_id for rotation
          return {
            user_id: user.id,
            workspace_id: campaign.workspace_id,
            org_id: campaign.org_id,
            campaign_id: campaign.id,
            lead_id: contact.id,
            recipient_id: contact.id,
            to_email: contact.email,
            subject,
            body_html: finalHtml,
            body: finalHtml,
            provider: outboundAccount?.provider || campaign.provider || "gmail",
            provider_account_id: campaign.provider_account_id || null,
            from_email: outboundAccount?.from_email || campaign.from_email || null,
            sender_account_id: accountId,
            account_id: accountId,
            sender_inbox_id: selectedInboxId,
            scheduled_at: scheduledTime,
            not_before: scheduledTime,
            status: "scheduled",
            state: "Queued",
            priority: 100,
            variant_used: variantUsed, // Block 11600: Track which variant (A or B) was used
            step_no: step1.step_no || 1,
            sending_identity_id: selectedIdentityId // Block 12100: Track identity for rotation
          };
        }
      }));

      if (needsApproval) {
        // Block 446: Insert into approval_queue
        const { data: approvalQueued, error: aqErr } = await supabase
          .from("approval_queue")
          .insert(rows)
          .select("id, lead_id");

        if (aqErr) {
          return NextResponse.json({ error: aqErr.message }, { status: 400 });
        }

        // Update campaign_leads to mark as pending approval
        for (const aq of approvalQueued || []) {
          await supabase
            .from("campaign_leads")
            .update({ 
              state: "Pending Approval", 
              current_step: 1,
              subject_token: `[SS|${aq.lead_id}]`
            })
            .eq("campaign_id", campaignId)
            .eq("lead_id", aq.lead_id);
        }

        // Log activity: email submitted for approval
        if (campaign.workspace_id) {
          try {
            await supabase.from("workspace_activity").insert({
              workspace_id: campaign.workspace_id,
              type: "email",
              subtype: "submitted_for_approval",
              actor_id: user.id,
              lead_id: approvalQueued?.[0]?.lead_id || null,
              campaign_id: campaignId,
              metadata: { count: approvalQueued?.length || 0 }
            });
          } catch (logErr) {
            console.error("Failed to log approval submission:", logErr);
          }
        }

        return NextResponse.json({
          ok: true,
          enqueued: approvalQueued?.length || 0,
          campaign_id: campaignId,
          sequence_mode: true,
          step: 1,
          requires_approval: true,
          message: `${approvalQueued?.length || 0} email(s) submitted for approval`
        });
      } else {
        // Normal flow: Insert into send_queue
        const { data: queued, error: qErr } = await supabase
          .from("send_queue")
          .insert(rows)
          .select("id, lead_id, sending_identity_id");

        if (qErr) {
          return NextResponse.json({ error: qErr.message }, { status: 400 });
        }

        // Block 12100: Record identity usage for rotation tracking
        if (useIdentityRotation && campaign.org_id && queued) {
          const identityUsageMap = new Map<string, number>();
          for (const q of queued) {
            if (q.sending_identity_id) {
              const count = identityUsageMap.get(q.sending_identity_id) || 0;
              identityUsageMap.set(q.sending_identity_id, count + 1);
            }
          }
          // Record usage for each identity
          for (const [identityId, count] of identityUsageMap.entries()) {
            await recordIdentitySend(supabase, campaign.org_id!, identityId, count);
          }
        }

        // Update campaign_leads to mark as queued and store subject token
        for (const q of queued || []) {
          await supabase
            .from("campaign_leads")
            .update({ 
              state: "Queued", 
              current_step: 1,
              subject_token: `[SS|${q.lead_id}]`
            })
            .eq("campaign_id", campaignId)
            .eq("lead_id", q.lead_id);
        }

        return NextResponse.json({
          ok: true,
          enqueued: queued?.length || 0,
          campaign_id: campaignId,
          sequence_mode: true,
          step: 1,
          rotation_enabled: useIdentityRotation, // Block 12100: Indicate rotation status
          identities_used: useIdentityRotation ? healthyIdentities.length : 0
        });
      }

    } else {
      // Legacy mode: single send (no sequence)
      // Get account_id for scheduling
      const accountId = (campaign as any).sender_account_id || (campaign as any).account_id;
      if (!accountId) {
        return NextResponse.json({ error: "Campaign must have a sender_account_id or account_id" }, { status: 400 });
      }

      // Get lead timezones for scheduling
      const leadIds = safeContacts.map(c => c.id);
      const { data: leads } = await supabase
        .from("leads")
        .select("id, meta, tz")
        .in("id", leadIds);
      const { data: campaignLeads } = await supabase
        .from("campaign_leads")
        .select("lead_id, timezone")
        .in("lead_id", leadIds)
        .eq("campaign_id", campaignId);

      const leadTzMap = new Map<string, string | null>();
      (leads || []).forEach((l: any) => {
        const tz = l.meta?.tz || l.tz || null;
        leadTzMap.set(l.id, tz);
      });
      (campaignLeads || []).forEach((cl: any) => {
        if (cl.timezone) {
          leadTzMap.set(cl.lead_id, cl.timezone);
        }
      });

      // Check if campaign has rotation enabled (via first step if exists)
      const firstStep = steps && steps.length > 0 ? steps[0] : null;
      
      const rows = await Promise.all(safeContacts.map(async (contact, i) => {
        let subject = campaign.subject_template || "";
        let bodyHtml = campaign.body_template || "";
        let templateVariantId: string | null = null;
        let aiTemplateTestId: string | null = null;

        // Use AI template A/B testing if available
        if (aiTemplate && aiTemplateTests.length > 0) {
          // Randomly assign: 50% main template, 50% to variants (evenly distributed)
          const rand = Math.random();
          const variantCount = aiTemplateTests.length;
          
          if (rand < 0.5 || variantCount === 0) {
            // Use main template (50% of sends)
            bodyHtml = aiTemplate.body;
          } else {
            // Use a random variant (50% split evenly across variants)
            const variantIndex = Math.floor((rand - 0.5) * 2 * variantCount);
            const selectedVariant = aiTemplateTests[Math.min(variantIndex, variantCount - 1)];
            if (selectedVariant) {
              bodyHtml = selectedVariant.variant_body;
              aiTemplateTestId = selectedVariant.id;
            }
          }
        } else {
          // Fall back to regular template variants
          const variant = campaign.ab_mode === 'single' 
            ? templateWheel[0] 
            : templateWheel[i % templateWheel.length];
          
          if (variant) {
            subject = variant.subject;
            bodyHtml = variant.body_html;
            templateVariantId = variant.id !== "base-fallback" ? variant.id : null;
          }
        }
        
        const mergeData = {
          first_name: contact.first_name || "",
          last_name: contact.last_name || "",
          company: contact.company || "",
          email: contact.email
        };
        
        // Apply merge tags to subject and body
        subject = applyMergeTags(subject, mergeData);
        bodyHtml = applyMergeTags(bodyHtml, mergeData);
        const finalHtml = withFooterUnsub(bodyHtml, user.id, contact.email, campaignId);
        
        // Append SmartSend tracking token to subject
        const token = `[SS|${contact.id}]`;
        subject = `${subject} ${token}`;
        
        // Handle inbox rotation if enabled (pick per email for rotation)
        // Block 442: Now considers team inbox assignments
        let selectedInboxId: string | null = null;
        if (firstStep?.sender_mode === 'rotation' && firstStep.rotation_domain_id) {
          selectedInboxId = await pickRotationInbox(supabase, firstStep.rotation_domain_id, user.id);
          // Don't fail if rotation fails for one email, just log and continue
          if (!selectedInboxId) {
            console.warn(`No healthy inbox available for rotation (contact ${contact.id})`);
          }
        } else if (firstStep?.sender_mode === 'single' && firstStep.sender_inbox_id) {
          // Block 442: Verify user can use this inbox
          const { data: canUse } = await supabase.rpc("can_user_use_inbox", {
            p_inbox_id: firstStep.sender_inbox_id,
            p_user_id: user.id,
          });
          if (canUse) {
            selectedInboxId = firstStep.sender_inbox_id;
          } else {
            console.warn(`User ${user.id} cannot use inbox ${firstStep.sender_inbox_id} - not assigned`);
          }
        }
        
        // Get lead timezone and compute next permissible send time
        const leadTz = leadTzMap.get(contact.id) || null;
        let scheduledTime: string;
        
        try {
          const { data: nextAt, error: schedErr } = await supabase.rpc("next_permissible_send_at", {
            p_account: accountId,
            p_lead_tz: leadTz,
            p_now: baseTime.toISOString()
          });
          
          if (schedErr || !nextAt) {
            // Fallback to staggered time if RPC fails
            scheduledTime = new Date(baseTime.getTime() + i * staggerMs).toISOString();
          } else {
            // Use the computed time, but add a small stagger to avoid exact overlaps
            const computedTime = new Date(nextAt);
            scheduledTime = new Date(computedTime.getTime() + i * 1000).toISOString(); // 1 second stagger
          }
        } catch (err) {
          // Fallback on error
          scheduledTime = new Date(baseTime.getTime() + i * staggerMs).toISOString();
        }

        // Calculate auto_approve_at if auto-approval is enabled
        let autoApproveAt: string | null = null;
        if (autoApproveHours && autoApproveHours > 0) {
          const autoApproveDate = new Date(scheduledTime);
          autoApproveDate.setHours(autoApproveDate.getHours() + autoApproveHours);
          autoApproveAt = autoApproveDate.toISOString();
        }

        // Block 12100: Select identity for rotation if enabled
        let selectedIdentityId: string | null = null;
        if (useIdentityRotation && campaign.org_id) {
          selectedIdentityId = await selectNextIdentity(supabase, campaign.org_id);
          if (!selectedIdentityId) {
            console.warn(`Block 12100: No healthy identity available for rotation (contact ${contact.id})`);
          }
        }

        if (needsApproval) {
          // Block 446: Route to approval_queue
          return {
            workspace_id: campaign.workspace_id,
            campaign_id: campaign.id,
            lead_id: contact.id,
            inbox_id: selectedInboxId,
            step_id: null, // no step in legacy mode
            email_subject: subject,
            email_body: finalHtml,
            scheduled_at: scheduledTime,
            submitted_by: user.id,
            auto_approve_at: autoApproveAt,
            sending_identity_id: selectedIdentityId // Block 12100: Track identity for rotation
          };
        } else {
          // Normal flow: route to send_queue
          // Block 8170: Include provider info from campaign + outbound account
          // Block 12100: Include sending_identity_id for rotation
          return {
            user_id: user.id,
            workspace_id: campaign.workspace_id,
            campaign_id: campaign.id,
            lead_id: contact.id,
            recipient_id: contact.id,
            to_email: contact.email,
            subject,
            body_html: finalHtml,
            provider: outboundAccount?.provider || campaign.provider || "gmail",
            provider_account_id: campaign.provider_account_id || null,
            from_email: outboundAccount?.from_email || campaign.from_email || null,
            sender_account_id: accountId,
            account_id: accountId,
            sender_inbox_id: selectedInboxId,
            scheduled_at: scheduledTime,
            not_before: scheduledTime,
            status: "scheduled",
            template_variant_id: templateVariantId,
            ai_template_test_id: aiTemplateTestId,
            sending_identity_id: selectedIdentityId // Block 12100: Track identity for rotation
          };
        }
      }));

      if (needsApproval) {
        // Block 446: Insert into approval_queue
        const { data: approvalQueued, error: aqErr } = await supabase
          .from("approval_queue")
          .insert(rows)
          .select("id, lead_id");

        if (aqErr) {
          return NextResponse.json({ error: aqErr.message }, { status: 400 });
        }

        // Store subject tokens in campaign_leads for audit trail
        const campaignLeadUpdates = safeContacts.map((contact, i) => ({
          campaign_id: campaignId,
          lead_id: contact.id,
          subject_token: `[SS|${contact.id}]`,
          state: "Pending Approval"
        }));
        
        // Upsert subject_token to campaign_leads
        for (const update of campaignLeadUpdates) {
          await supabase
            .from("campaign_leads")
            .upsert(update, {
              onConflict: "campaign_id,lead_id",
              ignoreDuplicates: false
            });
        }

        // Log activity: email submitted for approval
        if (campaign.workspace_id) {
          try {
            await supabase.from("workspace_activity").insert({
              workspace_id: campaign.workspace_id,
              type: "email",
              subtype: "submitted_for_approval",
              actor_id: user.id,
              lead_id: approvalQueued?.[0]?.lead_id || null,
              campaign_id: campaignId,
              metadata: { count: approvalQueued?.length || 0 }
            });
          } catch (logErr) {
            console.error("Failed to log approval submission:", logErr);
          }
        }

        return NextResponse.json({ 
          ok: true, 
          enqueued: approvalQueued?.length || 0,
          campaign_id: campaignId,
          variants_used: variants.length || 0,
          sequence_mode: false,
          requires_approval: true,
          message: `${approvalQueued?.length || 0} email(s) submitted for approval`
        });
      } else {
        // Normal flow: Insert into send_queue
        const { data: queued, error: qErr } = await supabase
          .from("send_queue")
          .insert(rows)
          .select("id, sending_identity_id");
        
        if (qErr) {
          return NextResponse.json({ error: qErr.message }, { status: 400 });
        }

        // Block 12100: Record identity usage for rotation tracking
        if (useIdentityRotation && campaign.org_id && queued) {
          const identityUsageMap = new Map<string, number>();
          for (const q of queued) {
            if (q.sending_identity_id) {
              const count = identityUsageMap.get(q.sending_identity_id) || 0;
              identityUsageMap.set(q.sending_identity_id, count + 1);
            }
          }
          // Record usage for each identity
          for (const [identityId, count] of identityUsageMap.entries()) {
            await recordIdentitySend(supabase, campaign.org_id!, identityId, count);
          }
        }
        
        // Store subject tokens in campaign_leads for audit trail
        const campaignLeadUpdates = safeContacts.map((contact, i) => ({
          campaign_id: campaignId,
          lead_id: contact.id,
          subject_token: `[SS|${contact.id}]`
        }));
        
        // Upsert subject_token to campaign_leads
        for (const update of campaignLeadUpdates) {
          await supabase
            .from("campaign_leads")
            .upsert(update, {
              onConflict: "campaign_id,lead_id",
              ignoreDuplicates: false
            });
        }

        // 9) Update campaign status if needed
        if (campaign.status === 'draft') {
          await supabase
            .from("campaigns")
            .update({ status: 'queued' })
            .eq("id", campaignId);
        }

        return NextResponse.json({ 
          ok: true, 
          enqueued: rows.length,
          campaign_id: campaignId,
          variants_used: variants.length || 0,
          sequence_mode: false,
          rotation_enabled: useIdentityRotation, // Block 12100: Indicate rotation status
          identities_used: useIdentityRotation ? healthyIdentities.length : 0
        });
      }
    }

  } catch (error: any) {
    console.error("Enqueue error:", error);
    return NextResponse.json({ error: error.message || "Server error" }, { status: 500 });
  }
} 