/**
 * Block 256200: Yard Reconciliation API
 * GET /api/yard/reconciliation - Get reconciliation summaries
 * POST /api/yard/reconciliation - Create/run end-of-day reconciliation
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
    const reconciliation_date = searchParams.get('reconciliation_date') || new Date().toISOString().split('T')[0];
    const period_type = searchParams.get('period_type') || 'daily';

    if (!company_id) {
      return NextResponse.json(
        { error: 'company_id is required' },
        { status: 400 }
      );
    }

    const { data: reconciliation, error } = await supabase
      .from('yard_reconciliation')
      .select('*')
      .eq('company_id', company_id)
      .eq('reconciliation_date', reconciliation_date)
      .eq('period_type', period_type)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      console.error('Error fetching reconciliation:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      reconciliation: reconciliation || null,
    });
  } catch (error: any) {
    console.error('Error in reconciliation API:', error);
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
      reconciliation_date = new Date().toISOString().split('T')[0],
      period_type = 'daily',
    } = body;

    if (!company_id) {
      return NextResponse.json(
        { error: 'company_id is required' },
        { status: 400 }
      );
    }

    // Calculate date range based on period type
    const startDate = new Date(reconciliation_date);
    let endDate = new Date(reconciliation_date);
    
    if (period_type === 'weekly') {
      endDate.setDate(endDate.getDate() + 6);
    } else if (period_type === 'monthly') {
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(endDate.getDate() - 1);
    }

    // Get transactions for the period
    const { data: transactions, error: txError } = await supabase
      .from('yard_transactions')
      .select('*')
      .eq('company_id', company_id)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (txError) {
      console.error('Error fetching transactions:', txError);
      return NextResponse.json(
        { error: txError.message },
        { status: 500 }
      );
    }

    // Calculate summary metrics
    const summary = {
      total_transactions: transactions?.length || 0,
      check_ins_count: transactions?.filter(t => t.transaction_type === 'check_in').length || 0,
      check_outs_count: transactions?.filter(t => t.transaction_type === 'check_out').length || 0,
      adjustments_count: transactions?.filter(t => t.transaction_type === 'adjustment').length || 0,
      returns_count: transactions?.filter(t => t.transaction_type === 'return').length || 0,
      items_missing_count: transactions?.filter(t => t.variance && t.variance < 0).length || 0,
      items_returned_count: transactions?.filter(t => t.transaction_type === 'return').length || 0,
      total_variance_amount: transactions?.reduce((sum, t) => {
        if (t.variance && t.variance < 0) {
          // Get cost from yard_item if available
          return sum + Math.abs(t.variance) * 50; // Placeholder cost calculation
        }
        return sum;
      }, 0) || 0,
    };

    // Get shrinkage alerts for the period
    const { data: shrinkageAlerts } = await supabase
      .from('yard_shrinkage_alerts')
      .select('*')
      .eq('company_id', company_id)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    summary.items_missing_count = shrinkageAlerts?.length || 0;
    summary.critical_shrinkage_count = shrinkageAlerts?.filter(a => a.severity === 'critical').length || 0;
    summary.estimated_loss_total = shrinkageAlerts?.reduce((sum, a) => sum + (a.estimated_loss_amount || 0), 0) || 0;

    // Calculate inventory balance percentage (simplified)
    const totalItems = await supabase
      .from('yard_items')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company_id)
      .eq('is_active', true);

    const balancedItems = (summary.total_transactions - summary.items_missing_count);
    const inventory_balance_percentage = summary.total_transactions > 0
      ? (balancedItems / summary.total_transactions) * 100
      : 100;

    // Generate summary text
    const summaryText = `YARD SUMMARY (${reconciliation_date}):
- ${summary.items_missing_count} items missing
- ${summary.items_returned_count} items returned
- ${summary.critical_shrinkage_count} critical shrinkage alerts
- Estimated loss: $${summary.estimated_loss_total.toFixed(2)}
- Balanced Inventory: ${inventory_balance_percentage.toFixed(1)}%`;

    // Create or update reconciliation
    const { data: reconciliation, error } = await supabase
      .from('yard_reconciliation')
      .upsert({
        company_id,
        reconciliation_date,
        period_type,
        ...summary,
        inventory_balance_percentage,
        summary_text: summaryText,
        status: 'completed',
      }, {
        onConflict: 'company_id,reconciliation_date,period_type',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating reconciliation:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      reconciliation,
    });
  } catch (error: any) {
    console.error('Error in reconciliation API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















