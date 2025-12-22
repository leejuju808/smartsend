import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { sendMailSafe } from "@/lib/email/send";
import { planSendLimit } from "@/lib/billing/limits";
import { enhanceCampaign, EnhancementContext } from "@/lib/campaign-enhancer";

const MAX_RETRIES = 2;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = params.id;
  const { batchSize = 100 } = await req.json().catch(() => ({}));

  // Load campaign
  const { data: campaign, error: cErr } = await supabase
    .from("campaigns_new")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (cErr || !campaign) return NextResponse.json({ error: cErr?.message || "not found" }, { status: 404 });

  if (["paused","cancelled","completed"].includes(campaign.status)) {
    return NextResponse.json({ halted: true, status: campaign.status });
  }
  
  // Check plan limits before sending
  const senderEmail = campaign.from_email;
  const { data: profile } = await supabase.from("profiles").select("*").eq("email", senderEmail).maybeSingle();
  if (!profile) return NextResponse.json({ error: "profile not found" }, { status: 400 });

  const limit = planSendLimit(profile.plan);
  if (profile.monthly_sends >= limit) {
    return NextResponse.json({ 
      halted: true, 
      reason: "send limit reached", 
      plan: profile.plan, 
      limit 
    }, { status: 402 });
  }
  
  if (campaign.status !== "sending") {
    await supabase.from("campaigns_new").update({ status: "sending" }).eq("id", id).eq("user_id", user.id);
  }

  // Auto-stop on reply: Clean up any 'pending' rows that already have a reply event
  if (campaign.auto_stop_on_reply) {
    await supabase.rpc("sync_replies_to_recipients", { p_campaign: id });
  }

  // Enhance campaign if enabled and not already enhanced
  let enhancedSubject = campaign.subject;
  let enhancedBodyHtml = campaign.body_html;
  let enhancedBodyText = campaign.body_text;

  if (campaign.enhancement_enabled !== false && (!campaign.enhanced_at || !campaign.enhanced_subject)) {
    try {
      // Load recipient sample to get context (use first recipient for template enhancement)
      const { data: sampleRecipient } = await supabase
        .from("campaign_recipients_new")
        .select("email")
        .eq("campaign_id", id)
        .limit(1)
        .maybeSingle();

      // Load contact data if available
      let recipientData;
      if (sampleRecipient?.email) {
        const { data: contact } = await supabase
          .from("contacts")
          .select("*")
          .eq("email", sampleRecipient.email)
          .eq("user_id", user.id)
          .maybeSingle();

        if (contact) {
          recipientData = {
            email: contact.email,
            name: contact.first_name || contact.last_name ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() : undefined,
            city: contact.city,
            state: contact.state,
            zip: contact.zip,
            neighborhood: (contact as any).neighborhood,
            street: (contact as any).street,
            roof_type_guess: contact.roof_type_guess,
            homeowner_likelihood: contact.homeowner_likelihood,
            property_type_guess: contact.property_type_guess,
            storm_risk_level: contact.storm_risk_level,
          };
        }
      }

      const enhancementContext: EnhancementContext = {
        campaignId: id,
        userId: user.id,
        originalSubject: campaign.subject,
        originalBodyHtml: campaign.body_html || '',
        originalBodyText: campaign.body_text || '',
        recipientData,
      };

      const enhancementResult = await enhanceCampaign(enhancementContext);
      enhancedSubject = enhancementResult.enhanced_subject;
      enhancedBodyHtml = enhancementResult.enhanced_body_html;
      enhancedBodyText = enhancementResult.enhanced_body_text;

      // Save enhanced version to campaign
      await supabase
        .from("campaigns_new")
        .update({
          enhanced_subject: enhancedSubject,
          enhanced_body_html: enhancedBodyHtml,
          enhanced_body_text: enhancedBodyText,
          enhancement_report: enhancementResult.enhancement_report,
          enhanced_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("user_id", user.id);
    } catch (enhanceError) {
      console.error("Enhancement failed, using original:", enhanceError);
      // Continue with original content if enhancement fails
    }
  } else if (campaign.enhanced_subject) {
    // Use previously enhanced content
    enhancedSubject = campaign.enhanced_subject;
    enhancedBodyHtml = campaign.enhanced_body_html || campaign.body_html;
    enhancedBodyText = campaign.enhanced_body_text || campaign.body_text;
  }

  // Pick next batch
  const { data: batch, error: bErr } = await supabase
    .from("campaign_recipients_new")
    .select("id,email,status,retry_count")
    .eq("campaign_id", id)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .limit(batchSize);

  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });
  if (!batch || batch.length === 0) {
    await supabase.from("campaigns_new").update({ status: "completed" }).eq("id", id).eq("user_id", user.id);
    return NextResponse.json({ done: true });
  }

  let sent = 0, suppressed = 0, failed = 0, skipped = 0;

  for (const r of batch) {
    try {
      // Check suppression using the new is_suppressed function
      const { data: isSuppressed } = await supabase.rpc('is_suppressed', {
        p_workspace: campaign.workspace_id || user.id,
        p_email: r.email,
        p_campaign: id
      });

      if (isSuppressed) {
        suppressed++;
        await supabase.from("campaign_recipients_new").update({
          status: "suppressed",
          last_error: "suppressed",
        }).eq("id", r.id).eq("user_id", user.id);
        continue;
      }

      // Use enhanced content for sending
      const res = await sendMailSafe({
        to: r.email,
        subject: enhancedSubject,
        text: enhancedBodyText || "",
        html: enhancedBodyHtml || undefined,
        from: campaign.from_email,
      });

      if ("skipped" in res) {
        suppressed++;
        await supabase.from("campaign_recipients_new").update({
          status: "suppressed",
          last_error: res.reason,
        }).eq("id", r.id).eq("user_id", user.id);
      } else {
        sent++;
        await supabase.from("campaign_recipients_new").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          last_error: null,
        }).eq("id", r.id).eq("user_id", user.id);
        
        // Increment monthly send count
        await supabase.rpc("increment_monthly_sends", { email: senderEmail });
      }
    } catch (e: any) {
      failed++;
      const nextRetries = (r.retry_count ?? 0) + 1;
      const status = nextRetries > MAX_RETRIES ? "failed" : "pending";
      await supabase.from("campaign_recipients_new").update({
        status,
        retry_count: nextRetries,
        last_error: e?.message?.slice(0, 180) || "send error",
      }).eq("id", r.id).eq("user_id", user.id);
    }
  }

  return NextResponse.json({ processed: batch.length, sent, suppressed, failed, skipped });
} 