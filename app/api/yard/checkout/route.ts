/**
 * Block 256200: Material Check-Out API
 * POST /api/yard/checkout - Check out materials for a job/crew
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
      crew_id,
      crew_member_id,
      materials, // Array of { yard_item_id, quantity, expected_quantity? }
      notes,
    } = body;

    if (!company_id || !materials || !Array.isArray(materials) || materials.length === 0) {
      return NextResponse.json(
        { error: 'company_id and materials array are required' },
        { status: 400 }
      );
    }

    const transactions = [];
    const allocations = [];

    // Create transactions and allocations for each material
    for (const material of materials) {
      const { yard_item_id, quantity, expected_quantity } = material;

      if (!yard_item_id || !quantity) {
        continue;
      }

      // Create check-out transaction
      const { data: transaction, error: txError } = await supabase
        .from('yard_transactions')
        .insert({
          company_id,
          yard_item_id,
          transaction_type: 'check_out',
          quantity: -Math.abs(quantity), // Negative for check-out
          job_id: job_id || null,
          crew_id: crew_id || null,
          crew_member_id: crew_member_id || null,
          notes: notes || null,
          expected_quantity: expected_quantity || null,
          created_by: user.id,
        })
        .select()
        .single();

      if (txError) {
        console.error('Error creating checkout transaction:', txError);
        return NextResponse.json(
          { error: `Error checking out ${yard_item_id}: ${txError.message}` },
          { status: 500 }
        );
      }

      transactions.push(transaction);

      // Create job allocation if job_id is provided
      if (job_id) {
        const { data: allocation, error: allocError } = await supabase
          .from('yard_job_allocation')
          .insert({
            company_id,
            job_id,
            yard_item_id,
            allocated_quantity: quantity,
            crew_id: crew_id || null,
            crew_member_id: crew_member_id || null,
            checkout_transaction_id: transaction.id,
            status: 'checked_out',
            checked_out_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (allocError) {
          console.error('Error creating allocation:', allocError);
          // Continue even if allocation fails
        } else {
          allocations.push(allocation);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      transactions,
      allocations,
      message: `Successfully checked out ${transactions.length} material(s)`,
    });
  } catch (error: any) {
    console.error('Error in checkout API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















