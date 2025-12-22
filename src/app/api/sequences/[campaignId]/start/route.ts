import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { nextSendAt } from '@/lib/sequences/schedule';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(
  req: NextRequest,
  { params }: { params: { campaignId: string } }
) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();
    
    const { 
      workspaceId, 
      providerAccountId, 
      leadIds, 
      templateVars = {} 
    } = body as {
      workspaceId: string;
      providerAccountId?: string;
      leadIds: string[];
      templateVars?: Record<string, any>;
    };

    // Find the sequence for this campaign
    const { data: seq, error: seqError } = await supabase
      .from('sequences')
      .select('id')
      .eq('campaign_id', params.campaignId)
      .maybeSingle();

    if (seqError) {
      console.error('Sequence lookup error:', seqError);
      return NextResponse.json({ error: seqError.message }, { status: 500 });
    }

    if (!seq) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    // Get all steps
    const { data: steps, error: stepsError } = await supabase
      .from('sequence_steps')
      .select('*')
      .eq('sequence_id', seq.id)
      .order('position');

    if (stepsError) {
      console.error('Steps fetch error:', stepsError);
      return NextResponse.json({ error: stepsError.message }, { status: 500 });
    }

    if (!steps?.length) {
      return NextResponse.json({ error: 'No steps defined' }, { status: 400 });
    }

    const step1 = steps[0];

    // Fetch leads
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id, email, owner_email, name, company')
      .in('id', leadIds);

    if (leadsError) {
      console.error('Leads fetch error:', leadsError);
      return NextResponse.json({ error: leadsError.message }, { status: 500 });
    }

    if (!leads?.length) {
      return NextResponse.json({ error: 'No leads found' }, { status: 400 });
    }

    // Initialize progress rows
    const progressRows = leads!.map(l => ({
      workspace_id: workspaceId,
      campaign_id: params.campaignId,
      lead_id: l.id,
      current_position: 0,
      status: 'active'
    }));

    await supabase
      .from('sequence_progress')
      .upsert(progressRows, { onConflict: 'campaign_id,lead_id' });

    // Enqueue step 1 now (schedule_at within window)
    const scheduleAt = new Date().toISOString();
    
    // Get user_id from workspace
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('user_id')
      .eq('id', workspaceId)
      .maybeSingle();

    const emailJobs = leads!.map(l => ({
      workspace_id: workspaceId,
      campaign_id: params.campaignId,
      lead_id: l.id,
      user_id: workspace?.user_id,
      to_email: l.email,
      subject: step1.subject,
      body_html: step1.body_html,
      scheduled_at: scheduleAt,
      status: 'queued'
    }));

    const { error: queueError } = await supabase
      .from('email_jobs')
      .insert(emailJobs);

    if (queueError) {
      console.error('Queue insert error:', queueError);
      return NextResponse.json({ error: queueError.message }, { status: 500 });
    }

    // Mark onboarding step complete if emails were queued successfully
    if (emailJobs.length > 0 && workspace?.user_id) {
      try {
        // Get org_id from profiles
        const { data: profile } = await supabase
          .from("profiles")
          .select("org_id")
          .eq("id", workspace.user_id)
          .single();
        
        if (profile?.org_id) {
          // Directly upsert onboarding progress
          await supabase
            .from("onboarding_progress")
            .upsert(
              {
                user_id: workspace.user_id,
                org_id: profile.org_id,
                step: 'send_first',
                completed: true,
              },
              {
                onConflict: "user_id,step",
              }
            )
            .catch(() => {
              // Silently fail - onboarding is not critical
            });
        }
      } catch (e) {
        // Silently fail - onboarding is not critical
      }
    }

    return NextResponse.json({ 
      ok: true, 
      enqueued: emailJobs.length, 
      first_step: step1.position 
    });
  } catch (error: any) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
