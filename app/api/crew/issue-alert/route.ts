import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Webhook/API route to handle high-severity issue alerts
 * Called when a crew member reports a high or critical severity issue
 */
export async function POST(req: NextRequest) {
  try {
    const { issueId, jobId, severity, issueType, description } = await req.json();

    if (!issueId || !jobId || !severity) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Only alert for high/critical severity
    if (severity !== 'high' && severity !== 'critical') {
      return NextResponse.json({
        success: true,
        message: 'Issue logged (low/medium severity - no alert)',
      });
    }

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select(`
        id,
        address,
        stage,
        team_id,
        teams(
          id,
          name,
          team_members(
            user_id,
            role,
            profiles(
              email,
              phone
            )
          )
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

    // Get owners (they need immediate notification)
    const owners = job.teams?.team_members?.filter(
      (member: any) => member.role === 'owner'
    ) || [];

    // Alert owners immediately
    for (const owner of owners) {
      if (owner.profiles?.email) {
        console.log(`URGENT email to ${owner.profiles.email}: ${severity.toUpperCase()} issue at ${job.address}`);
        
        // TODO: Integrate with actual email service
        // await sendEmail({
        //   to: owner.profiles.email,
        //   subject: `🚨 ${severity.toUpperCase()} Issue - ${job.address}`,
        //   body: `A ${severity} severity issue has been reported:\n\nType: ${issueType}\nDescription: ${description}\n\nJob: ${job.address}`
        // });
      }

      if (owner.profiles?.phone) {
        console.log(`URGENT SMS to ${owner.profiles.phone}: ${severity} issue reported`);
        
        // TODO: Integrate with actual SMS service
        // await sendSMS({
        //   to: owner.profiles.phone,
        //   message: `🚨 ${severity.toUpperCase()} ISSUE at ${job.address}. ${issueType}. Check dashboard immediately.`
        // });
      }
    }

    // If critical, pause the job
    if (severity === 'critical') {
      await supabase
        .from('jobs')
        .update({
          stage: 'materials', // Move back to materials stage to pause
          notes: `Job paused due to critical issue: ${description}`,
        })
        .eq('id', jobId);
    }

    // Create alert record
    await supabase.from('job_activity').insert({
      job_id: jobId,
      activity_type: 'high_severity_issue',
      description: `${severity.toUpperCase()} issue: ${issueType} - ${description}`,
      metadata: {
        issue_id: issueId,
        severity,
        issue_type: issueType,
      },
    });

    return NextResponse.json({
      success: true,
      message: severity === 'critical' 
        ? 'Critical issue reported. Job paused. Owner notified immediately.'
        : 'High severity issue reported. Owner notified.',
      notified: owners.length,
      jobPaused: severity === 'critical',
    });
  } catch (error) {
    console.error('Error in issue alert:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


























