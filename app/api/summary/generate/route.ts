// Block 19100 — SmartSend Smart Summary v1
// POST /api/summary/generate - Generate smart summary for a contact

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { applyLawsToSummary, getStateFromContact } from '@/src/lib/laws/state-law-helpers';

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { contact_id, summary_mode = 'default' } = body;

    if (!contact_id) {
      return NextResponse.json({ error: 'contact_id is required' }, { status: 400 });
    }

    // Validate summary_mode
    if (!['default', 'sales', 'prep', 'office'].includes(summary_mode)) {
      return NextResponse.json({ error: 'Invalid summary_mode' }, { status: 400 });
    }

    // Call the database function to generate summary
    const { data, error } = await supabase.rpc('generate_smart_summary', {
      p_contact_id: contact_id,
      p_summary_mode: summary_mode
    });

    if (error) {
      console.error('Error generating smart summary:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Apply state law reminders to summary
    try {
      const stateCode = await getStateFromContact(contact_id);
      if (stateCode && data?.summary_text) {
        const enhanced = await applyLawsToSummary(
          data.summary_text,
          stateCode,
          contact_id
        );
        
        // Update summary text with state rule reminders
        if (enhanced.summary !== data.summary_text) {
          data.summary_text = enhanced.summary;
          data.state_rule_reminder = enhanced.state_rule_reminder;
        }
      }
    } catch (legalError) {
      // Non-fatal: if legal filtering fails, continue with original summary
      console.error('[Smart Summary] Legal filtering error (non-fatal):', legalError);
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error in POST /api/summary/generate:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

