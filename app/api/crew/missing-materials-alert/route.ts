import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Webhook/API route to handle missing materials alerts
 * Called when crew verifies materials and some are missing
 */
export async function POST(req: NextRequest) {
  try {
    const { verificationId, jobId, missingMaterials } = await req.json();

    if (!verificationId || !jobId || !missingMaterials) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select(`
        id,
        address,
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

    // Get production managers and owners
    const managers = job.teams?.team_members?.filter(
      (member: any) => member.role === 'owner' || member.role === 'manager'
    ) || [];

    // Build missing materials list
    const missingList = missingMaterials
      .map((m: any) => `${m.name}: Expected ${m.expected} ${m.unit}, Received ${m.received}`)
      .join('\n');

    // Alert production managers and owners
    for (const manager of managers) {
      if (manager.profiles?.email) {
        console.log(`Alert email to ${manager.profiles.email}: Missing materials at ${job.address}`);
        
        // TODO: Integrate with actual email service
        // await sendEmail({
        //   to: manager.profiles.email,
        //   subject: `⚠️ Missing Materials - ${job.address}`,
        //   body: `The crew has reported missing materials:\n\n${missingList}\n\nJob: ${job.address}`
        // });
      }

      if (manager.profiles?.phone) {
        console.log(`Alert SMS to ${manager.profiles.phone}: Missing materials`);
        
        // TODO: Integrate with actual SMS service
        // await sendSMS({
        //   to: manager.profiles.phone,
        //   message: `Missing materials at ${job.address}. Check dashboard for details.`
        // });
      }
    }

    // Create alert/notification record
    await supabase.from('job_activity').insert({
      job_id: jobId,
      activity_type: 'missing_materials',
      description: `Missing materials reported: ${missingList}`,
      metadata: {
        verification_id: verificationId,
        missing_materials: missingMaterials,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Alerts sent to production managers',
      notified: managers.length,
    });
  } catch (error) {
    console.error('Error in missing materials alert:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


























