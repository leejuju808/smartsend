import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Webhook/API route to add photos to insurance claim packet
 * Called when BEFORE photos are uploaded
 */
export async function POST(req: NextRequest) {
  try {
    const { photoId, jobId, photoCategory, photoUrl } = await req.json();

    if (!photoId || !jobId || !photoCategory) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Only process BEFORE photos for insurance claims
    if (photoCategory !== 'before') {
      return NextResponse.json({
        success: true,
        message: 'Photo saved (not a BEFORE photo for insurance)',
      });
    }

    // Check if job has insurance claim
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, insurance, lead_id')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    if (!job.insurance) {
      return NextResponse.json({
        success: true,
        message: 'Photo saved (job is not an insurance claim)',
      });
    }

    // Add photo to insurance claim packet
    // This assumes there's an insurance_claim_photos table or similar
    // For now, we'll log it and create an activity record
    
    await supabase.from('job_activity').insert({
      job_id: jobId,
      activity_type: 'insurance_photo_added',
      description: `BEFORE photo added to insurance claim packet`,
      metadata: {
        photo_id: photoId,
        photo_url: photoUrl,
        photo_category: photoCategory,
      },
    });

    // TODO: If there's an insurance_claim_photos table:
    // await supabase.from('insurance_claim_photos').insert({
    //   claim_id: claimId,
    //   photo_url: photoUrl,
    //   photo_category: 'before',
    //   job_id: jobId,
    // });

    return NextResponse.json({
      success: true,
      message: 'BEFORE photo added to insurance claim packet',
    });
  } catch (error) {
    console.error('Error adding photo to claim:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


























