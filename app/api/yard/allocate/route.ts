/**
 * Block 256200: Yard → Job Material Allocation API
 * POST /api/yard/allocate - Allocate materials from yard to a job
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      company_id,
      job_id,
      materials, // Array of { yard_item_id, quantity, expected_quantity? }
      crew_id,
      crew_member_id,
      notes,
    } = body;

    if (!company_id || !job_id || !materials || !Array.isArray(materials) || materials.length === 0) {
      return NextResponse.json(
        { error: 'company_id, job_id, and materials array are required' },
        { status: 400 }
      );
    }

    // Verify job exists and get job details
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', job_id)
      .eq('company_id', company_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    const allocations = [];
    const allocationSummary = [];

    // Create allocations for each material
    for (const material of materials) {
      const { yard_item_id, quantity, expected_quantity } = material;

      if (!yard_item_id || !quantity) {
        continue;
      }

      // Verify yard item exists and has sufficient quantity
      const { data: yardItem, error: itemError } = await supabase
        .from('yard_items')
        .select('*')
        .eq('id', yard_item_id)
        .eq('company_id', company_id)
        .single();

      if (itemError || !yardItem) {
        continue; // Skip invalid items
      }

      if (yardItem.quantity < quantity) {
        allocationSummary.push({
          material_name: yardItem.material_name,
          requested: quantity,
          available: yardItem.quantity,
          status: 'insufficient',
        });
        continue;
      }

      // Create allocation
      const { data: allocation, error: allocError } = await supabase
        .from('yard_job_allocation')
        .insert({
          company_id,
          job_id,
          yard_item_id,
          allocated_quantity: quantity,
          crew_id: crew_id || null,
          crew_member_id: crew_member_id || null,
          status: 'allocated',
          notes: notes || null,
        })
        .select(`
          *,
          yard_items:yard_item_id (
            id,
            material_name,
            material_category,
            unit,
            quantity
          )
        `)
        .single();

      if (allocError) {
        console.error('Error creating allocation:', allocError);
        continue;
      }

      allocations.push(allocation);
      allocationSummary.push({
        material_name: yardItem.material_name,
        quantity,
        unit: yardItem.unit,
        status: 'allocated',
      });
    }

    return NextResponse.json({
      ok: true,
      allocations,
      summary: allocationSummary,
      message: `Successfully allocated ${allocations.length} material(s) to job`,
    });
  } catch (error: any) {
    console.error('Error in allocation API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















