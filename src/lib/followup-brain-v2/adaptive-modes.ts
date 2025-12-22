// Block 24900 — Follow-Up Brain v2: Adaptive Follow-Up Modes
// 4 modes: Direct, Reassurance, Authority, Revival

export type FollowUpMode = 'direct' | 'reassurance' | 'authority' | 'revival';

export interface FollowUpMessage {
  subject: string;
  body: string;
  mode: FollowUpMode;
}

/**
 * Generates a follow-up message based on mode and context
 */
export function generateFollowUpMessage(
  mode: FollowUpMode,
  context: {
    firstName?: string;
    leadType?: 'hot' | 'warm' | 'not_ready' | 'objection';
    previousMessage?: string;
    customData?: Record<string, any>;
  }
): FollowUpMessage {
  const firstName = context.firstName || 'there';
  
  switch (mode) {
    case 'direct':
      return generateDirectMode(firstName, context);
    
    case 'reassurance':
      return generateReassuranceMode(firstName, context);
    
    case 'authority':
      return generateAuthorityMode(firstName, context);
    
    case 'revival':
      return generateRevivalMode(firstName, context);
  }
}

/**
 * Mode 1: Direct Mode (for decisive homeowners)
 * Short, fast, no fluff
 */
function generateDirectMode(
  firstName: string,
  context: any
): FollowUpMessage {
  if (context.leadType === 'hot') {
    return {
      subject: 'Tomorrow at 10 AM works. Can I confirm your address?',
      body: `Hey ${firstName},

Tomorrow at 10 AM works. Can I confirm your address?

We'll take a look and get you a quote same day.

Thanks!`,
      mode: 'direct',
    };
  }

  return {
    subject: 'Quick question',
    body: `Hey ${firstName},

Want morning or afternoon for the inspection?

Let me know what works best.

Thanks!`,
    mode: 'direct',
  };
}

/**
 * Mode 2: Reassurance Mode (for nervous homeowners)
 * Warm, comforting, educational
 */
function generateReassuranceMode(
  firstName: string,
  context: any
): FollowUpMessage {
  return {
    subject: 'No pressure — just want to help',
    body: `Hey ${firstName},

No pressure at all — we'll walk you through everything.

Want me to explain how insurance works for roof replacements? Most homeowners don't realize their insurance often covers the full cost.

Happy to answer any questions you have.

Best!`,
    mode: 'reassurance',
  };
}

/**
 * Mode 3: Authority Mode (for logical homeowners)
 * Professional, detailed, proof-driven
 */
function generateAuthorityMode(
  firstName: string,
  context: any
): FollowUpMessage {
  return {
    subject: 'Here's exactly what we check during your roof inspection',
    body: `Hi ${firstName},

Before we come out, here's exactly what we check during your roof inspection:

1. Shingle condition and age
2. Flashing integrity
3. Ventilation system
4. Gutter condition
5. Signs of leaks or damage

We'll provide a detailed report with photos and recommendations.

Want to schedule that inspection?

Best!`,
    mode: 'authority',
  };
}

/**
 * Mode 4: Revival Mode (for unresponsive homeowners)
 * Curiosity-based
 */
function generateRevivalMode(
  firstName: string,
  context: any
): FollowUpMessage {
  return {
    subject: 'Still want me to save your spot for an inspection this week?',
    body: `Hey ${firstName},

Still want me to save your spot for an inspection this week?

We have openings tomorrow and Thursday. Just reply and I'll lock you in.

No pressure — just want to make sure you're covered.

Thanks!`,
    mode: 'revival',
  };
}

/**
 * Generates objection-handling reply based on objection type
 */
export function generateObjectionReply(
  objectionType: 'price_too_high' | 'already_have_contractor' | 'not_now' | 'maybe_later' | 'insurance_delay' | 'other',
  context: {
    firstName?: string;
    objectionText?: string;
  }
): FollowUpMessage {
  const firstName = context.firstName || 'there';

  switch (objectionType) {
    case 'price_too_high':
      return {
        subject: 'Totally understand — let me show you the difference',
        body: `Hey ${firstName},

Totally understand. Roofing is a big decision.

Want me to show you the difference between shingle options and pricing? Sometimes there's a middle ground that works better.

Happy to walk through it.

Best!`,
        mode: 'reassurance',
      };

    case 'already_have_contractor':
      return {
        subject: 'Want me to walk you through your other estimate?',
        body: `Hey ${firstName},

Great! Want me to walk you through your other estimate to check for missing items?

Sometimes contractors miss things like:
- Proper ventilation
- Code compliance
- Warranty details

No pressure — just want to make sure you're covered.

Best!`,
        mode: 'authority',
      };

    case 'not_now':
    case 'maybe_later':
      return {
        subject: 'No problem — want me to check back next month?',
        body: `Hey ${firstName},

No problem at all — want me to check back next month or after insurance responds?

I'll mark it in my calendar.

All the best!`,
        mode: 'reassurance',
      };

    case 'insurance_delay':
      return {
        subject: 'We can help with the insurance process',
        body: `Hey ${firstName},

We can help if the adjuster needs documentation or if there are any delays.

Want us to call the insurance company with you? Sometimes a quick call speeds things up.

Let me know!

Best!`,
        mode: 'reassurance',
      };

    default:
      return {
        subject: 'Thanks for letting me know',
        body: `Hey ${firstName},

Thanks for letting me know. I'll close the loop on my side.

If anything changes, just reach out anytime.

All the best!`,
        mode: 'reassurance',
      };
  }
}






































