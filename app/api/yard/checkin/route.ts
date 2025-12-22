/**
 * Block 256200: Material Check-In API
 * POST /api/yard/checkin - Check in materials (returns, new stock, adjustments)
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
      yard_item_id,
      quantity,
      transaction_type = 'check_in', // 'check_in' or 'return'
      job_id,
      crew_id,
      crew_member_id,
      notes,
    } = body;

    if (!company_id || !yard_item_id || !quantity) {
      return NextResponse.json(
        { error: 'company_id, yard_item_id, and quantity are required' },
        { status: 400 }
      );
    }

    // Create check-in transaction
    const { data: transaction, error } = await supabase
      .from('yard_transactions')
      .insert({
        company_id,
        yard_item_id,
        transaction_type,
        quantity: Math.abs(quantity), // Positive for check-in
        job_id: job_id || null,
        crew_id: crew_id || null,
        crew_member_id: crew_member_id || null,
        notes: notes || null,
        created_by: user.id,
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

    if (error) {
      console.error('Error creating check-in transaction:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // If this is a return and there's a job allocation, update it
    if (transaction_type === 'return' && job_id) {
      const { data: allocation } = await supabase
        .from('yard_job_allocation')
        .select('*')
        .eq('job_id', job_id)
        .eq('yard_item_id', yard_item_id)
        .eq('status', 'checked_out')
        .single();

      if (allocation) {
        const newReturnedQuantity = (allocation.returned_quantity || 0) + quantity;
        const newStatus = newReturnedQuantity >= allocation.allocated_quantity ? 'returned' : 'checked_out';

        await supabase
          .from('yard_job_allocation')
          .update({
            returned_quantity: newReturnedQuantity,
            return_transaction_id: transaction.id,
            returned_at: newReturnedQuantity >= allocation.allocated_quantity ? new Date().toISOString() : null,
            status: newStatus,
          })
          .eq('id', allocation.id);
      }
    }

    return NextResponse.json({
      ok: true,
      transaction,
      message: `Successfully checked in ${quantity} ${transaction.yard_items?.unit || 'units'}`,
    });
  } catch (error: any) {
    console.error('Error in check-in API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















