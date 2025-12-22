/**
 * Block 255000 — Storm Outreach Automation
 * Automatically sends outreach to past customers, prospects, and new storm leads
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface OutreachMessage {
  template: 'past_customer_alert' | 'past_prospect_revival' | 'new_storm_lead' | 'inspection_reminder';
  recipientName: string;
  recipientPhone?: string;
  recipientEmail?: string;
  address: string;
  stormType: string;
  schedulingLink?: string;
}

/**
 * Send outreach to past customers affected by storm
 */
export async function sendPastCustomerOutreach(
  stormId: string,
  teamId: string,
  customerIds: string[]
): Promise<{ sent: number; errors: number }> {
  let sent = 0;
  let errors = 0;

  // Fetch customer data
  const { data: customers, error: fetchError } = await supabase
    .from('customers')
    .select('id, name, phone, email, address, city, state, zip_code')
    .in('id', customerIds)
    .eq('team_id', teamId);

  if (fetchError || !customers) {
    console.error('Error fetching customers:', fetchError);
    return { sent: 0, errors: customerIds.length };
  }

  // Fetch storm data
  const { data: storm } = await supabase
    .from('storm_events')
    .select('storm_type, severity')
    .eq('id', stormId)
    .single();

  if (!storm) {
    return { sent: 0, errors: customers.length };
  }

  // Generate scheduling link (would use actual scheduling system)
  const schedulingLink = generateSchedulingLink(teamId, stormId);

  for (const customer of customers) {
    try {
      const message = generatePastCustomerMessage({
        recipientName: customer.name || 'Homeowner',
        recipientPhone: customer.phone || undefined,
        recipientEmail: customer.email || undefined,
        address: customer.address || `${customer.city}, ${customer.state}`,
        stormType: storm.storm_type,
        schedulingLink
      });

      // Send via SMS if phone available
      if (customer.phone) {
        await sendSMS(customer.phone, message.sms);
      }

      // Send via email if email available
      if (customer.email) {
        await sendEmail(customer.email, message.email.subject, message.email.body);
      }

      // Log outreach
      await logOutreach({
        stormId,
        teamId,
        customerId: customer.id,
        outreachType: 'past_customer_alert',
        method: customer.phone && customer.email ? 'all' : customer.phone ? 'sms' : 'email',
        messageTemplate: 'past_customer_alert',
        messageSent: customer.phone ? message.sms : message.email.body,
        subjectLine: message.email.subject
      });

      // Create or update storm lead
      await createOrUpdateStormLead({
        stormId,
        teamId,
        customerId: customer.id,
        source: 'past_customer',
        homeownerName: customer.name,
        address: customer.address || '',
        city: customer.city,
        state: customer.state,
        zipCode: customer.zip_code,
        phone: customer.phone,
        email: customer.email
      });

      sent++;
    } catch (error) {
      console.error(`Error sending outreach to customer ${customer.id}:`, error);
      errors++;
    }
  }

  return { sent, errors };
}

/**
 * Send outreach to past prospects (leads who never converted)
 */
export async function sendPastProspectOutreach(
  stormId: string,
  teamId: string,
  leadIds: string[]
): Promise<{ sent: number; errors: number }> {
  let sent = 0;
  let errors = 0;

  // Fetch lead data
  const { data: leads, error: fetchError } = await supabase
    .from('leads')
    .select('id, first_name, last_name, phone, email, address, city, state, zip')
    .in('id', leadIds)
    .eq('workspace_id', teamId); // Adjust based on your schema

  if (fetchError || !leads) {
    console.error('Error fetching leads:', fetchError);
    return { sent: 0, errors: leadIds.length };
  }

  // Fetch storm data
  const { data: storm } = await supabase
    .from('storm_events')
    .select('storm_type, severity')
    .eq('id', stormId)
    .single();

  if (!storm) {
    return { sent: 0, errors: leads.length };
  }

  const schedulingLink = generateSchedulingLink(teamId, stormId);

  for (const lead of leads) {
    try {
      const name = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Homeowner';
      const message = generatePastProspectMessage({
        recipientName: name,
        recipientPhone: lead.phone || undefined,
        recipientEmail: lead.email || undefined,
        address: lead.address || `${lead.city}, ${lead.state}`,
        stormType: storm.storm_type,
        schedulingLink
      });

      if (lead.phone) {
        await sendSMS(lead.phone, message.sms);
      }

      if (lead.email) {
        await sendEmail(lead.email, message.email.subject, message.email.body);
      }

      await logOutreach({
        stormId,
        teamId,
        stormLeadId: null, // Will be created below
        outreachType: 'past_prospect_revival',
        method: lead.phone && lead.email ? 'all' : lead.phone ? 'sms' : 'email',
        messageTemplate: 'past_prospect_revival',
        messageSent: lead.phone ? message.sms : message.email.body,
        subjectLine: message.email.subject
      });

      // Create storm lead
      const { data: stormLead } = await supabase
        .from('storm_leads')
        .insert({
          storm_id: stormId,
          team_id: teamId,
          lead_id: lead.id,
          source: 'past_prospect',
          homeowner_name: name,
          address: lead.address || '',
          city: lead.city,
          state: lead.state,
          zip_code: lead.zip,
          phone: lead.phone,
          email: lead.email,
          outreach_sent: true,
          outreach_sent_at: new Date().toISOString(),
          outreach_method: lead.phone && lead.email ? 'all' : lead.phone ? 'sms' : 'email'
        })
        .select('id')
        .single();

      if (stormLead) {
        await supabase
          .from('storm_outreach_logs')
          .update({ storm_lead_id: stormLead.id })
          .eq('storm_id', stormId)
          .eq('team_id', teamId)
          .is('storm_lead_id', null);
      }

      sent++;
    } catch (error) {
      console.error(`Error sending outreach to lead ${lead.id}:`, error);
      errors++;
    }
  }

  return { sent, errors };
}

/**
 * Generate past customer message
 */
function generatePastCustomerMessage(params: OutreachMessage): {
  sms: string;
  email: { subject: string; body: string };
} {
  const { recipientName, address, stormType, schedulingLink } = params;
  const stormTypeName = formatStormType(stormType);

  const sms = `Hi ${recipientName}, a ${stormTypeName} just passed near your home at ${address}. We recommend a free roof inspection to check for hidden damage. Schedule instantly: ${schedulingLink}`;

  const email = {
    subject: `Free Roof Inspection After ${stormTypeName}`,
    body: `Hi ${recipientName},\n\nA ${stormTypeName} just passed near your home at ${address}.\n\nWe recommend a free roof inspection to check for hidden damage. Many homeowners don't realize their roof has damage until it's too late.\n\nClick here to schedule your free inspection:\n${schedulingLink}\n\nBest regards,\nYour Roofing Team`
  };

  return { sms, email };
}

/**
 * Generate past prospect message
 */
function generatePastProspectMessage(params: OutreachMessage): {
  sms: string;
  email: { subject: string; body: string };
} {
  const { recipientName, address, stormType, schedulingLink } = params;
  const stormTypeName = formatStormType(stormType);

  const sms = `We noticed the recent ${stormTypeName} affected your neighborhood at ${address}. Would you like a quick, no-cost inspection? Schedule: ${schedulingLink}`;

  const email = {
    subject: `Free Inspection After ${stormTypeName} in Your Area`,
    body: `Hi ${recipientName},\n\nWe noticed the recent ${stormTypeName} affected your neighborhood at ${address}.\n\nWould you like a quick, no-cost inspection? We'll check your roof, gutters, and siding for any storm damage.\n\nSchedule your free inspection:\n${schedulingLink}\n\nNo obligation. Just peace of mind.\n\nBest regards,\nYour Roofing Team`
  };

  return { sms, email };
}

/**
 * Format storm type for display
 */
function formatStormType(stormType: string): string {
  const types: Record<string, string> = {
    hail: 'hailstorm',
    wind: 'windstorm',
    tornado: 'tornado',
    heavy_rain: 'heavy rainstorm',
    snow: 'snowstorm',
    ice: 'ice storm'
  };
  return types[stormType] || stormType;
}

/**
 * Generate scheduling link
 */
function generateSchedulingLink(teamId: string, stormId: string): string {
  // In production, this would generate an actual scheduling link
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.smartsend.ai';
  return `${baseUrl}/schedule?storm=${stormId}&team=${teamId}`;
}

/**
 * Send SMS (placeholder - integrate with Twilio or similar)
 */
async function sendSMS(phone: string, message: string): Promise<void> {
  // TODO: Integrate with actual SMS service (Twilio, etc.)
  console.log(`[SMS] To: ${phone}, Message: ${message}`);
  // In production, use Twilio or similar service
}

/**
 * Send email (placeholder - integrate with email service)
 */
async function sendEmail(email: string, subject: string, body: string): Promise<void> {
  // TODO: Integrate with actual email service
  console.log(`[Email] To: ${email}, Subject: ${subject}`);
  // In production, use your email sending service
}

/**
 * Log outreach to database
 */
async function logOutreach(params: {
  stormId: string;
  teamId: string;
  customerId?: string;
  stormLeadId?: string;
  outreachType: string;
  method: string;
  messageTemplate: string;
  messageSent: string;
  subjectLine?: string;
}): Promise<void> {
  await supabase.from('storm_outreach_logs').insert({
    storm_id: params.stormId,
    team_id: params.teamId,
    customer_id: params.customerId || null,
    storm_lead_id: params.stormLeadId || null,
    outreach_type: params.outreachType,
    method: params.method,
    message_template: params.messageTemplate,
    message_sent: params.messageSent,
    subject_line: params.subjectLine,
    status: 'sent',
    sent_at: new Date().toISOString()
  });
}

/**
 * Create or update storm lead
 */
async function createOrUpdateStormLead(params: {
  stormId: string;
  teamId: string;
  customerId?: string;
  source: string;
  homeownerName?: string;
  address: string;
  city?: string;
  state?: string;
  zipCode?: string;
  phone?: string;
  email?: string;
}): Promise<void> {
  await supabase.from('storm_leads').upsert({
    storm_id: params.stormId,
    team_id: params.teamId,
    customer_id: params.customerId || null,
    source: params.source,
    homeowner_name: params.homeownerName,
    address: params.address,
    city: params.city,
    state: params.state,
    zip_code: params.zipCode,
    phone: params.phone,
    email: params.email,
    outreach_sent: true,
    outreach_sent_at: new Date().toISOString()
  }, {
    onConflict: 'storm_id,team_id,customer_id',
    ignoreDuplicates: false
  });
}






















