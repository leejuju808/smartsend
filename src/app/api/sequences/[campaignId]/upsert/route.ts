import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(
  req: NextRequest,
  { params }: { params: { campaignId: string } }
) {
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const body = await req.json();
    
    const { workspaceId, name, steps } = body as {
      workspaceId: string;
      name: string;
      steps: Array<{ 
        position: number; 
        subject: string; 
        body_html: string; 
        wait_days: number; 
        send_window?: any 
      }>;
    };

    // Upsert sequence
    const { data: seq, error: seqError } = await supabase
      .from('sequences')
      .upsert(
        { 
          workspace_id: workspaceId, 
          campaign_id: params.campaignId, 
          name 
        },
        { onConflict: 'campaign_id' }
      )
      .select('*')
      .single();

    if (seqError) {
      console.error('Sequence upsert error:', seqError);
      return NextResponse.json({ error: seqError.message }, { status: 400 });
    }

    // Replace steps (delete all, insert new)
    await supabase
      .from('sequence_steps')
      .delete()
      .eq('sequence_id', seq.id);

    const insert = steps.map(s => ({
      sequence_id: seq.id,
      position: s.position,
      subject: s.subject,
      body_html: s.body_html,
      wait_days: s.wait_days,
      send_window: s.send_window ?? {
        tz: 'America/Los_Angeles',
        start: '09:00',
        end: '16:30',
        weekdays: [1, 2, 3, 4, 5]
      }
    }));

    const { error: stepError } = await supabase
      .from('sequence_steps')
      .insert(insert);

    if (stepError) {
      console.error('Steps insert error:', stepError);
      return NextResponse.json({ error: stepError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, sequence_id: seq.id });
  } catch (error: any) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
