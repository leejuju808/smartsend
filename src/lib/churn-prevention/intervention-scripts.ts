/**
 * Block 23610 — Retention Intervention Scripts
 * Word-for-word scripts to use when intervening with roofers
 */

export interface InterventionScript {
  id: string;
  name: string;
  template: string;
  variables?: string[]; // Variables that can be replaced in template
}

export const INTERVENTION_SCRIPTS: Record<string, InterventionScript> = {
  script_a_easy_win: {
    id: 'script_a_easy_win',
    name: 'Easy Win Fix (Day 7)',
    template: `Hey — let's get you a quick win.

If you send me ANY list you have (CRM screenshot, spreadsheet, old customers), I'll upload it and launch a campaign for you.

You should see replies within 24–48 hours.`,
    variables: []
  },
  
  script_b_low_reply: {
    id: 'script_b_low_reply',
    name: 'Low Reply Fix (Day 3-5)',
    template: `Your open rate is fine, we just need a different angle.

I can launch a repair-focused campaign for you — these pull replies fast.

Want me to activate it?`,
    variables: []
  },
  
  script_c_dashboard_ghost: {
    id: 'script_c_dashboard_ghost',
    name: 'Dashboard Ghost (Haven\'t logged in)',
    template: `No worries if you've been busy — SmartSend runs without you.

I can walk you through your leads in 2 minutes whenever you're free.`,
    variables: []
  },
  
  script_d_busy_excuse: {
    id: 'script_d_busy_excuse',
    name: 'I\'ve been slammed',
    template: `Perfect — SmartSend was built for that.

Let me launch a campaign that books you estimates automatically while you're slammed.`,
    variables: []
  },
  
  monthly_checkin: {
    id: 'monthly_checkin',
    name: 'Monthly Success Check-In',
    template: `Here's your SmartSend summary this month:

• {{REPLIES_COUNT}} replies
• {{LEADS_COUNT}} leads created
• Estimated job value: ${{ESTIMATED_VALUE}}

Want me to launch your next campaign to keep momentum going?`,
    variables: ['REPLIES_COUNT', 'LEADS_COUNT', 'ESTIMATED_VALUE']
  },
  
  winback_attempt: {
    id: 'winback_attempt',
    name: 'Win-Back Script',
    template: `Before I close your account entirely, I want to send one win your way.

If I revive one job for you — and it turns into an estimate — would you want to restart SmartSend?

I can launch a revival campaign for you today.`,
    variables: []
  },
  
  campaign_ladder_launch: {
    id: 'campaign_ladder_launch',
    name: 'Campaign Ladder Launch Notification',
    template: `I just launched a {{CAMPAIGN_TYPE}} campaign for you. Expect replies soon.`,
    variables: ['CAMPAIGN_TYPE']
  },
  
  '90_day_retention_play': {
    id: '90_day_retention_play',
    name: '90-Day Retention Play',
    template: `I just launched a new campaign to revive your older leads. Expect replies soon.`,
    variables: []
  }
};

/**
 * Render a script template with variables
 */
export function renderScript(
  scriptId: string,
  variables: Record<string, string | number> = {}
): string {
  const script = INTERVENTION_SCRIPTS[scriptId];
  if (!script) {
    throw new Error(`Script ${scriptId} not found`);
  }
  
  let rendered = script.template;
  
  // Replace variables
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    rendered = rendered.replace(new RegExp(placeholder, 'g'), String(value));
  }
  
  return rendered;
}

/**
 * Get campaign type display name
 */
export function getCampaignTypeDisplayName(type: string): string {
  const displayNames: Record<string, string> = {
    'lead_revival': 'Lead Revival Campaign',
    'free_estimate': 'Free Estimate Campaign',
    'storm_damage': 'Storm Damage Campaign',
    'seasonal': 'Seasonal Campaign',
    'referral_booster': 'Referral Booster Campaign',
    'review_5star': '5-Star Review Campaign',
    'upsell_gutters': 'Gutters Upsell Campaign',
    'upsell_fascia': 'Fascia Upsell Campaign',
    'upsell_siding': 'Siding Upsell Campaign'
  };
  
  return displayNames[type] || type;
}






































