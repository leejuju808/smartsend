import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Webhook/API route to auto-generate final report when job is completed
 * Called when job stage changes to 'completed'
 */
export async function POST(req: NextRequest) {
  try {
    const { jobId } = await req.json();

    if (!jobId) {
      return NextResponse.json(
        { error: 'Missing jobId' },
        { status: 400 }
      );
    }

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select(`
        id,
        address,
        job_type,
        contract_value,
        stage,
        lead_id,
        leads(
          id,
          name,
          email,
          phone
        )
      `)
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    if (job.stage !== 'completed') {
      return NextResponse.json({
        success: true,
        message: 'Job not yet completed',
      });
    }

    // Get all photos
    const { data: photos } = await supabase
      .from('job_photos')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });

    // Get time entries
    const { data: timeEntries } = await supabase
      .from('crew_time_entries')
      .select(`
        *,
        crew_members(
          name
        )
      `)
      .eq('job_id', jobId);

    // Get checklists
    const { data: checklists } = await supabase
      .from('job_checklists')
      .select('*')
      .eq('job_id', jobId);

    // Get safety logs
    const { data: safetyLogs } = await supabase
      .from('safety_logs')
      .select('*')
      .eq('job_id', jobId);

    // Calculate total hours
    const totalHours = timeEntries?.reduce((sum, entry) => {
      return sum + (parseFloat(entry.total_hours) || 0);
    }, 0) || 0;

    // Generate report data
    const reportData = {
      job: {
        id: job.id,
        address: job.address,
        job_type: job.job_type,
        contract_value: job.contract_value,
        completed_at: new Date().toISOString(),
      },
      homeowner: {
        name: job.leads?.name,
        email: job.leads?.email,
        phone: job.leads?.phone,
      },
      photos: photos || [],
      timeTracking: {
        total_hours: totalHours,
        entries: timeEntries || [],
      },
      checklists: checklists || [],
      safetyLogs: safetyLogs || [],
    };

    // Store report (this would typically generate a PDF and store it)
    // For now, we'll create a record in job_activity
    await supabase.from('job_activity').insert({
      job_id: jobId,
      activity_type: 'final_report_generated',
      description: 'Final report auto-generated upon job completion',
      metadata: reportData,
    });

    // TODO: Generate actual PDF report
    // const pdfUrl = await generatePDFReport(reportData);
    // await supabase.from('job_documents').insert({
    //   job_id: jobId,
    //   document_type: 'final_report',
    //   document_url: pdfUrl,
    // });

    // Email report to homeowner (if email exists)
    if (job.leads?.email) {
      console.log(`Final report email to ${job.leads.email}`);
      
      // TODO: Integrate with actual email service
      // await sendEmail({
      //   to: job.leads.email,
      //   subject: `Final Report - ${job.address}`,
      //   body: `Your roofing job is complete! View your final report: [link]`,
      //   attachments: [pdfUrl]
      // });
    }

    return NextResponse.json({
      success: true,
      message: 'Final report generated',
      reportData,
    });
  } catch (error) {
    console.error('Error generating final report:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


























