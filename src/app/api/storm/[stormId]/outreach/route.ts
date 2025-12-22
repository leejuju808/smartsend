/**
 * Block 255000 — Storm Outreach API
 * POST /api/storm/[stormId]/outreach - Send automated outreach
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendPastCustomerOutreach, sendPastProspectOutreach } from '@/lib/storm/outreach-automation';

export async function POST(
  req: NextRequest,
  { params }: { params: { stormId: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { teamId, type, customerIds, leadIds } = body;

    if (!teamId) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 });
    }

    if (type === 'past_customers' && customerIds && Array.isArray(customerIds)) {
      const result = await sendPastCustomerOutreach(params.stormId, teamId, customerIds);
      return NextResponse.json({
        type: 'past_customers',
        sent: result.sent,
        errors: result.errors,
        total: result.sent + result.errors
      });
    }

    if (type === 'past_prospects' && leadIds && Array.isArray(leadIds)) {
      const result = await sendPastProspectOutreach(params.stormId, teamId, leadIds);
      return NextResponse.json({
        type: 'past_prospects',
        sent: result.sent,
        errors: result.errors,
        total: result.sent + result.errors
      });
    }

    return NextResponse.json(
      { error: 'Invalid type or missing IDs. Use type: "past_customers" or "past_prospects" with corresponding IDs.' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Error sending outreach:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}






















