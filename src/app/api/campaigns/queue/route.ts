import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { requireQuota } from '@/lib/usage';
import { requireActiveSubscription } from '@/lib/entitlements';
import { applyMergeTags, withFooterUnsub } from '@/lib/templates/merge';
import { planScheduleTimes, Plan } from '@/lib/scheduler';

export interface QueueCampaignRequest {
  campaign_id: string;
  contact_ids?: string[];
  custom_emails?: Array<{
    email: string;
    name?: string;
    company?: string;
    custom_fields?: Record<string, any>;
  }>;
  tags?: string[];
  delay_minutes?: number;
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check subscription requirement
    const gate = await requireActiveSubscription();
    if (!gate.allowed) {
      return NextResponse.json({ error: "Subscription required" }, { status: 402 }); // Payment Required
    }

    // Parse request body
    const body: QueueCampaignRequest = await request.json();
    
    // Validate required fields
    if (!body.campaign_id) {
      return NextResponse.json(
        { error: 'Missing campaign_id' },
        { status: 400 }
      );
    }

    // Verify campaign exists and belongs to user
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*, workspace_id, ab_mode')
      .eq('id', body.campaign_id)
      .eq('user_id', user.id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    if (campaign.status !== 'draft') {
      return NextResponse.json(
        { error: 'Campaign must be in draft status to queue contacts' },
        { status: 400 }
      );
    }

    // Get contacts to queue
    let contacts: Array<{
      email: string;
      name?: string;
      company?: string;
      custom_fields?: Record<string, any>;
    }> = [];

    // Add custom emails if provided
    if (body.custom_emails) {
      contacts.push(...body.custom_emails);
    }

    // Add contacts by ID if provided
    if (body.contact_ids && body.contact_ids.length > 0) {
      const { data: dbContacts, error: contactsError } = await supabase
        .from('contacts')
        .select('email, name, company, custom')
        .eq('user_id', user.id)
        .in('id', body.contact_ids)
        .eq('unsubscribed', false);

      if (contactsError) {
        console.error('Error fetching contacts:', contactsError);
        return NextResponse.json(
          { error: 'Failed to fetch contacts' },
          { status: 500 }
        );
      }

      if (dbContacts) {
        contacts.push(...dbContacts.map(c => ({
          email: c.email,
          name: c.name,
          company: c.company,
          custom_fields: c.custom || {},
        })));
      }
    }

    // Add contacts by tags if provided
    if (body.tags && body.tags.length > 0) {
      const { data: taggedContacts, error: tagsError } = await supabase
        .from('contacts')
        .select('email, name, company, custom')
        .eq('user_id', user.id)
        .overlaps('tags', body.tags)
        .eq('unsubscribed', false);

      if (tagsError) {
        console.error('Error fetching tagged contacts:', tagsError);
        return NextResponse.json(
          { error: 'Failed to fetch tagged contacts' },
          { status: 500 }
        );
      }

      if (taggedContacts) {
        contacts.push(...taggedContacts.map(c => ({
          email: c.email,
          name: c.name,
          company: c.company,
          custom_fields: c.custom || {},
        })));
      }
    }

    // Remove duplicates by email
    const uniqueContacts = contacts.filter((contact, index, self) => 
      index === self.findIndex(c => c.email.toLowerCase() === contact.email.toLowerCase())
    );

    // Check for suppressed emails
    const emails = uniqueContacts.map(c => c.email.toLowerCase());
    const { data: suppressions } = await supabase
      .from('suppressions')
      .select('value_lower')
      .eq('user_id', user.id)
      .eq('kind', 'email')
      .in('value_lower', emails);

    const suppressedEmails = new Set(suppressions?.map(s => s.value_lower) || []);
    const filteredContacts = uniqueContacts.filter(c => !suppressedEmails.has(c.email.toLowerCase()));

    if (filteredContacts.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No contacts to queue (all suppressed or unsubscribed)',
        queued: 0,
        suppressed: emails.length - filteredContacts.length,
      });
    }

    // Check if ab_mode is 'single' and get winning variant
    let winningVariantId: string | null = null;
    if (campaign.ab_mode === 'single') {
      const { data: promotionLog } = await supabase
        .from("campaign_logs")
        .select("message, meta")
        .eq("campaign_id", body.campaign_id)
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

    // Get template variants for A/B testing
    const { data: templateRows } = await supabase
      .from('campaign_templates')
      .select('id')
      .eq('campaign_id', body.campaign_id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    let variants: any[] = [];
    if (templateRows && templateRows.length > 0) {
      const query = supabase
        .from('template_variants')
        .select('id, weight, subject, body_html')
        .eq('campaign_template_id', templateRows[0].id);
      
      // If ab_mode is single, only load the winning variant
      if (campaign.ab_mode === 'single' && winningVariantId) {
        query.eq('id', winningVariantId);
      }
      
      const { data: vars } = await query.order('created_at', { ascending: true });
      
      variants = vars || [];
    }

    // Build round-robin wheel from variants (or use single variant if ab_mode is single)
    function buildRoundRobin(variants: any[]) {
      if (!variants || variants.length === 0) return [];
      // If ab_mode is single, just return the single variant
      if (campaign.ab_mode === 'single') {
        return variants;
      }
      const total = variants.reduce((a, v) => a + (v.weight || 0), 0) || 100;
      const slots = variants.flatMap(v => 
        Array.from({ length: Math.max(1, Math.round((v.weight/total)*100/5)) }, () => v)
      );
      return slots.length ? slots : variants;
    }

    const wheel = buildRoundRobin(variants);

    // Fetch send windows plan for workspace
    let plan: Plan = {
      timezone: "America/Los_Angeles",
      windows: [
        { dow: [1, 2, 3, 4, 5], start: "08:00", end: "11:00" },
        { dow: [1, 2, 3, 4, 5], start: "14:00", end: "16:00" }
      ],
      per_day: 40,
      min_gap_seconds: 90
    };

    // Get workspace_id from campaign
    const workspaceId = campaign.workspace_id || (campaign as any).user_id;
    
    const { data: planRow } = await supabase
      .from("send_windows")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (planRow) {
      plan = {
        timezone: planRow.timezone,
        windows: planRow.windows as any,
        per_day: planRow.per_day,
        min_gap_seconds: planRow.min_gap_seconds,
      };
    }

    // Generate scheduled times using send windows
    const slots = planScheduleTimes(plan, filteredContacts.length);
    const delayMs = (body.delay_minutes || campaign.delay_minutes || 0) * 60 * 1000;
    const baseTime = new Date(Date.now() + delayMs);

    let i = 0;
    // Prepare queue entries with variant selection
    const queueEntries = filteredContacts.map((contact, index) => {
      // If ab_mode is single, always use the first (only) variant
      // Otherwise use round-robin distribution
      const pick = campaign.ab_mode === 'single' && wheel.length > 0 
        ? wheel[0] 
        : (wheel.length > 0 ? wheel[i++ % wheel.length] : null);
      
      let subject = campaign.subject || '';
      let bodyHtml = campaign.body_html || '';
      
      if (pick) {
        // Apply merge tags to variant content
        subject = applyMergeTags(pick.subject, {
          first_name: contact.name || '',
          company: contact.company || '',
          ...(contact.custom_fields || {})
        });
        bodyHtml = pick.body_html;
        bodyHtml = applyMergeTags(bodyHtml, {
          first_name: contact.name || '',
          company: contact.company || '',
          ...(contact.custom_fields || {})
        });
      } else {
        // Fallback to campaign template with merge tags
        subject = applyMergeTags(subject, {
          first_name: contact.name || '',
          company: contact.company || '',
          ...(contact.custom_fields || {})
        });
        bodyHtml = applyMergeTags(bodyHtml, {
          first_name: contact.name || '',
          company: contact.company || '',
          ...(contact.custom_fields || {})
        });
      }

      // Add footer with unsubscribe link
      bodyHtml = withFooterUnsub(bodyHtml, user.id, contact.email.toLowerCase(), body.campaign_id);

      // Use the scheduled time from the send windows plan
      const scheduledTime = slots[index] || new Date(baseTime.getTime() + (index * 60000)).toISOString();

      // Note: SmartSend reply token [SS|leadId] will be appended when email is sent
      // The token is added in the send-queue edge function to ensure lead_id is available
      // Subject stored here is the original subject without token

      return {
        campaign_id: body.campaign_id,
        user_id: user.id,
        to_email: contact.email.toLowerCase(),
        subject: subject,
        body_html: bodyHtml,
        scheduled_at: scheduledTime,
        status: 'pending',
        template_variant_id: pick?.id || null,
      };
    });

    // Insert into send queue
    const { error: queueError } = await supabase
      .from('send_queue')
      .insert(queueEntries);

    if (queueError) {
      console.error('Error queuing contacts:', queueError);
      return NextResponse.json(
        { error: 'Failed to queue contacts' },
        { status: 500 }
      );
    }

    // Update campaign total count
    const { error: updateError } = await supabase
      .from('campaigns')
      .update({ total: filteredContacts.length })
      .eq('id', body.campaign_id);

    if (updateError) {
      console.error('Error updating campaign total:', updateError);
      // Don't fail the request if this update fails
    }

    return NextResponse.json({
      success: true,
      message: 'Contacts queued successfully',
      queued: filteredContacts.length,
      suppressed: emails.length - filteredContacts.length,
      scheduled_start: baseTime.toISOString(),
      variants_used: variants.length,
    });
  } catch (error) {
    console.error('Campaign queue error:', error);
    return NextResponse.json(
      { error: 'Failed to queue campaign' },
      { status: 500 }
    );
  }
} 