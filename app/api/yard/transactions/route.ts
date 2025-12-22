/**
 * Block 256200: Yard Transactions API
 * GET /api/yard/transactions - List yard transactions
 * POST /api/yard/transactions - Create a new transaction (check-in, check-out, adjustment, return)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const company_id = searchParams.get('company_id');
    const yard_item_id = searchParams.get('yard_item_id');
    const job_id = searchParams.get('job_id');
    const crew_id = searchParams.get('crew_id');
    const transaction_type = searchParams.get('transaction_type');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!company_id) {
      return NextResponse.json(
        { error: 'company_id is required' },
        { status: 400 }
      );
    }

    let query = supabase
      .from('yard_transactions')
      .select(`
        *,
        yard_items:yard_item_id (
          id,
          material_name,
          material_category,
          unit,
          brand,
          color
        ),
        jobs:job_id (
          id,
          homeowner_name,
          address
        ),
        crews:crew_id (
          id,
          name
        ),
        crew_members:crew_member_id (
          id,
          name
        )
      `)
      .eq('company_id', company_id);

    if (yard_item_id) {
      query = query.eq('yard_item_id', yard_item_id);
    }

    if (job_id) {
      query = query.eq('job_id', job_id);
    }

    if (crew_id) {
      query = query.eq('crew_id', crew_id);
    }

    if (transaction_type) {
      query = query.eq('transaction_type', transaction_type);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: transactions, error } = await query;

    if (error) {
      console.error('Error fetching yard transactions:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      transactions: transactions || [],
    });
  } catch (error: any) {
    console.error('Error in yard transactions API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

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
      transaction_type,
      quantity,
      job_id,
      crew_id,
      crew_member_id,
      notes,
      expected_quantity,
    } = body;

    if (!company_id || !yard_item_id || !transaction_type || !quantity) {
      return NextResponse.json(
        { error: 'company_id, yard_item_id, transaction_type, and quantity are required' },
        { status: 400 }
      );
    }

    if (!['check_in', 'check_out', 'adjustment', 'return', 'damage', 'theft'].includes(transaction_type)) {
      return NextResponse.json(
        { error: 'Invalid transaction_type' },
        { status: 400 }
      );
    }

    // For check_out, ensure quantity is positive (will be made negative in trigger)
    const transactionQuantity = transaction_type === 'check_out' 
      ? -Math.abs(quantity) 
      : Math.abs(quantity);

    const { data: transaction, error } = await supabase
      .from('yard_transactions')
      .insert({
        company_id,
        yard_item_id,
        transaction_type,
        quantity: transactionQuantity,
        job_id: job_id || null,
        crew_id: crew_id || null,
        crew_member_id: crew_member_id || null,
        notes: notes || null,
        expected_quantity: expected_quantity || null,
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
      console.error('Error creating yard transaction:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      transaction,
    });
  } catch (error: any) {
    console.error('Error creating yard transaction:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















