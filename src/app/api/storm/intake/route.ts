/**
 * Block 255000 — Storm Job Intake Form API
 * POST /api/storm/intake - Create job from storm lead intake form
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      stormId,
      teamId,
      name,
      address,
      city,
      state,
      zipCode,
      phone,
      email,
      stormType,
      visibleDamage,
      hasInsurance,
      preferredTime,
      notes
    } = body;

    if (!stormId || !teamId || !name || !address) {
      return NextResponse.json(
        { error: 'stormId, teamId, name, and address are required' },
        { status: 400 }
      );
    }

    // Create or update storm lead
    const { data: stormLead, error: leadError } = await supabase
      .from('storm_leads')
      .upsert({
        storm_id: stormId,
        team_id: teamId,
        homeowner_name: name,
        address,
        city,
        state,
        zip_code: zipCode,
        phone,
        email,
        source: 'inbound',
        status: 'scheduled',
        inspection_requested: true,
        inspection_scheduled: preferredTime ? true : false,
        inspection_scheduled_at: preferredTime || null,
        metadata: {
          storm_type: stormType,
          visible_damage: visibleDamage,
          has_insurance: hasInsurance,
          preferred_time: preferredTime,
          notes
        }
      }, {
        onConflict: 'storm_id,team_id,address',
        ignoreDuplicates: false
      })
      .select('id')
      .single();

    if (leadError) {
      return NextResponse.json({ error: leadError.message }, { status: 500 });
    }

    // Create job if visible damage reported
    let jobId = null;
    if (visibleDamage === 'yes' || visibleDamage === true) {
      // Determine job type based on your schema
      const { data: job, error: jobError } = await supabase
        .from('roofing_jobs')
        .insert({
          team_id: teamId,
          homeowner_name: name,
          address,
          city,
          state,
          zip_code: zipCode,
          phone,
          email,
          job_type: 'inspection',
          status: 'scheduled',
          source: 'storm_intake',
          storm_lead_id: stormLead.id,
          notes: `Storm intake form submission. Storm type: ${stormType}. Visible damage: ${visibleDamage}. Insurance: ${hasInsurance ? 'Yes' : 'No'}. ${notes || ''}`
        })
        .select('id')
        .single();

      if (!jobError && job) {
        jobId = job.id;

        // Update storm lead with job ID
        await supabase
          .from('storm_leads')
          .update({
            job_id: job.id,
            job_created: true,
            status: 'scheduled'
          })
          .eq('id', stormLead.id);
      }
    }

    return NextResponse.json({
      success: true,
      stormLeadId: stormLead.id,
      jobId,
      message: jobId 
        ? 'Job created successfully. Our team will contact you soon.'
        : 'Inspection request received. Our team will contact you to schedule.'
    });
  } catch (error: any) {
    console.error('Error processing storm intake:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}






















