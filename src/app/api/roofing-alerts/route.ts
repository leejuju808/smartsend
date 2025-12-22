/**
 * Block 24860 — SmartSend Roofing Alerts & Automations v1
 * 
 * GET /api/roofing-alerts
 * Fetches roofing alerts for the current workspace
 * 
 * POST /api/roofing-alerts/scan
 * Triggers alert scan for all jobs
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserAndWorkspace } from "@/src/lib/api-helpers";

export async function GET(req: NextRequest) {
  try {
    const { user, workspaceId, supabase } = await getUserAndWorkspace();
    const { searchParams } = new URL(req.url);

    // Query parameters
    const category = searchParams.get('category'); // homeowner, crew, supplier, insurance, payment, job_risk
    const priority = searchParams.get('priority'); // critical, high, medium, low
    const status = searchParams.get('status') || 'active';
    const job_id = searchParams.get('job_id');
    const escalated = searchParams.get('escalated'); // true/false
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Build query
    let query = supabase
      .from('roofing_alerts')
      .select(`
        *,
        job:roofing_jobs(id, title, status, job_value),
        lead:leads(id, first_name, last_name, email),
        crew:crews(id, name),
        supplier:suppliers(id, name),
        invoice:job_invoices(id, amount, due_date),
        insurance_claim:job_insurance_claims(id, claim_number, carrier_name)
      `)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (category) {
      query = query.eq('category', category);
    }
    if (priority) {
      query = query.eq('priority', priority);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (job_id) {
      query = query.eq('job_id', job_id);
    }
    if (escalated === 'true') {
      query = query.eq('escalated_to_owner', true);
    } else if (escalated === 'false') {
      query = query.eq('escalated_to_owner', false);
    }

    const { data: alerts, error } = await query;

    if (error) {
      console.error('Error fetching roofing alerts:', error);
      return NextResponse.json(
        { error: 'Failed to fetch alerts', details: error.message },
        { status: 500 }
      );
    }

    // Get counts by category and priority
    const { data: counts } = await supabase
      .from('roofing_alerts')
      .select('category, priority, status')
      .eq('workspace_id', workspaceId)
      .eq('status', 'active');

    const summary = {
      total: alerts?.length || 0,
      active: counts?.filter(c => c.status === 'active').length || 0,
      escalated: counts?.filter(c => c.escalated_to_owner).length || 0,
      by_category: {
        homeowner: counts?.filter(c => c.category === 'homeowner').length || 0,
        crew: counts?.filter(c => c.category === 'crew').length || 0,
        supplier: counts?.filter(c => c.category === 'supplier').length || 0,
        insurance: counts?.filter(c => c.category === 'insurance').length || 0,
        payment: counts?.filter(c => c.category === 'payment').length || 0,
        job_risk: counts?.filter(c => c.category === 'job_risk').length || 0,
      },
      by_priority: {
        critical: counts?.filter(c => c.priority === 'critical').length || 0,
        high: counts?.filter(c => c.priority === 'high').length || 0,
        medium: counts?.filter(c => c.priority === 'medium').length || 0,
        low: counts?.filter(c => c.priority === 'low').length || 0,
      },
    };

    return NextResponse.json({
      alerts: alerts || [],
      summary,
    });
  } catch (error: any) {
    console.error('Error in GET /api/roofing-alerts:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, workspaceId, supabase } = await getUserAndWorkspace();
    const body = await req.json();
    const action = body.action;

    if (action === 'scan') {
      // Trigger alert scan
      const { data: count, error } = await supabase.rpc('scan_and_create_alerts', {
        p_workspace_id: workspaceId,
      });

      if (error) {
        console.error('Error scanning alerts:', error);
        return NextResponse.json(
          { error: 'Failed to scan alerts', details: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        alerts_created: count || 0,
        message: `Created ${count || 0} new alerts`,
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Error in POST /api/roofing-alerts:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}






































