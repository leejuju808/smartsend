// Block 19100 — SmartSend Smart Summary v1
// GET /api/summary/[contactId] - Get smart summary for a contact
// POST /api/summary/[contactId] - Generate/update smart summary for a contact

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { applyLawsToSummary, getStateFromContact } from '@/src/lib/laws/state-law-helpers';

export async function GET(
  req: NextRequest,
  { params }: { params: { contactId: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { contactId } = params;
    const { searchParams } = new URL(req.url);
    const summary_mode = searchParams.get('mode') || 'default';

    // Validate summary_mode
    if (!['default', 'sales', 'prep', 'office'].includes(summary_mode)) {
      return NextResponse.json({ error: 'Invalid summary_mode' }, { status: 400 });
    }

    // Get existing summary
    const { data: summary, error } = await supabase
      .from('lead_smart_summary')
      .select('*')
      .eq('contact_id', contactId)
      .eq('summary_mode', summary_mode)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      console.error('Error fetching smart summary:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If summary doesn't exist, generate it
    if (!summary) {
      const { data: generated, error: genError } = await supabase.rpc('generate_smart_summary', {
        p_contact_id: contactId,
        p_summary_mode: summary_mode
      });

      if (genError) {
        console.error('Error generating smart summary:', genError);
        return NextResponse.json({ error: genError.message }, { status: 500 });
      }

      // Apply state law reminders
      try {
        const stateCode = await getStateFromContact(contactId);
        if (stateCode && generated?.summary_text) {
          const enhanced = await applyLawsToSummary(
            generated.summary_text,
            stateCode,
            contactId
          );
          if (enhanced.summary !== generated.summary_text) {
            generated.summary_text = enhanced.summary;
            generated.state_rule_reminder = enhanced.state_rule_reminder;
          }
        }
      } catch (legalError) {
        console.error('[Smart Summary] Legal filtering error (non-fatal):', legalError);
      }

      return NextResponse.json({ summary: generated });
    }

    return NextResponse.json({ summary });
  } catch (error: any) {
    console.error('Error in GET /api/summary/[contactId]:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { contactId: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { contactId } = params;
    const body = await req.json();
    const { summary_mode = 'default' } = body;

    // Validate summary_mode
    if (!['default', 'sales', 'prep', 'office'].includes(summary_mode)) {
      return NextResponse.json({ error: 'Invalid summary_mode' }, { status: 400 });
    }

    // Generate/update summary
    const { data, error } = await supabase.rpc('generate_smart_summary', {
      p_contact_id: contactId,
      p_summary_mode: summary_mode
    });

    if (error) {
      console.error('Error generating smart summary:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Apply state law reminders
    try {
      const stateCode = await getStateFromContact(contactId);
      if (stateCode && data?.summary_text) {
        const enhanced = await applyLawsToSummary(
          data.summary_text,
          stateCode,
          contactId
        );
        if (enhanced.summary !== data.summary_text) {
          data.summary_text = enhanced.summary;
          data.state_rule_reminder = enhanced.state_rule_reminder;
        }
      }
    } catch (legalError) {
      console.error('[Smart Summary] Legal filtering error (non-fatal):', legalError);
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error in POST /api/summary/[contactId]:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

