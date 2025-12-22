import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Webhook/API route to handle crew clock-in notifications
 * Called when a crew member clocks in for a job
 */
export async function POST(req: NextRequest) {
  try {
    const { timeEntryId, jobId, crewMemberId } = await req.json();

    if (!timeEntryId || !jobId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get job and homeowner details
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select(`
        id,
        address,
        lead_id,
        leads(
          id,
          name,
          phone,
          email
        )
      `)
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      console.error('Error fetching job:', jobError);
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Get crew member details
    const { data: crewMember } = await supabase
      .from('crew_members')
      .select(`
        id,
        name,
        crews(
          id,
          name
        )
      `)
      .eq('id', crewMemberId)
      .single();

    // Notify homeowner via SMS (if phone exists)
    if (job.leads?.phone) {
      // This would integrate with Twilio or similar
      // For now, we'll log it
      console.log(`SMS to ${job.leads.phone}: Your roofing crew has arrived at ${job.address}!`);
      
      // TODO: Integrate with actual SMS service
      // await sendSMS({
      //   to: job.leads.phone,
      //   message: `Your roofing crew has arrived at ${job.address}!`
      // });
    }

    // Notify homeowner via email (if email exists)
    if (job.leads?.email) {
      // This would integrate with email service
      console.log(`Email to ${job.leads.email}: Crew arrival notification`);
      
      // TODO: Integrate with actual email service
      // await sendEmail({
      //   to: job.leads.email,
      //   subject: 'Your Roofing Crew Has Arrived',
      //   body: `Your roofing crew has arrived at ${job.address} and work is beginning.`
      // });
    }

    // Log activity
    await supabase.from('job_activity').insert({
      job_id: jobId,
      activity_type: 'crew_clock_in',
      description: `Crew member ${crewMember?.name || 'Unknown'} clocked in`,
      metadata: {
        time_entry_id: timeEntryId,
        crew_member_id: crewMemberId,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Homeowner notified of crew arrival',
    });
  } catch (error) {
    console.error('Error in clock-in notification:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


























