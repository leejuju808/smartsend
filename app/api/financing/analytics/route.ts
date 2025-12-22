/**
 * GET /api/financing/analytics
 * Get financing analytics for a team/company
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get('team_id');
    const companyId = searchParams.get('company_id');
    const period = searchParams.get('period') || 'monthly'; // daily, weekly, monthly, yearly
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    if (!teamId && !companyId) {
      return NextResponse.json(
        { error: 'team_id or company_id is required' },
        { status: 400 }
      );
    }

    // Build query
    let query = supabase.from('financing_applications').select('*');

    if (teamId) {
      query = query.eq('team_id', teamId);
    }
    if (companyId) {
      query = query.eq('company_id', companyId);
    }

    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const { data: applications, error: appsError } = await query;

    if (appsError) {
      return NextResponse.json(
        { error: appsError.message },
        { status: 400 }
      );
    }

    // Calculate analytics
    const totalApplications = applications?.length || 0;
    const preApprovedCount =
      applications?.filter((a) => a.status === 'pre_approved').length || 0;
    const approvedCount =
      applications?.filter((a) => a.status === 'approved').length || 0;
    const deniedCount =
      applications?.filter((a) => a.status === 'denied').length || 0;
    const expiredCount =
      applications?.filter((a) => a.status === 'expired').length || 0;

    const totalAmountRequested =
      applications?.reduce((sum, a) => sum + parseFloat(a.amount_requested || 0), 0) || 0;
    const totalAmountApproved =
      applications
        ?.filter((a) => a.status === 'approved')
        .reduce((sum, a) => sum + parseFloat(a.amount_requested || 0), 0) || 0;

    const avgLoanAmount =
      approvedCount > 0 ? totalAmountApproved / approvedCount : 0;

    const approvalRate =
      totalApplications > 0
        ? (approvedCount / totalApplications) * 100
        : 0;

    // Get lender breakdown
    const lenderBreakdown: Record<string, any> = {};
    applications?.forEach((app) => {
      if (app.lender) {
        if (!lenderBreakdown[app.lender]) {
          lenderBreakdown[app.lender] = {
            count: 0,
            amount: 0,
            approved: 0,
          };
        }
        lenderBreakdown[app.lender].count++;
        lenderBreakdown[app.lender].amount += parseFloat(app.amount_requested || 0);
        if (app.status === 'approved') {
          lenderBreakdown[app.lender].approved++;
        }
      }
    });

    // Calculate approval rates per lender
    Object.keys(lenderBreakdown).forEach((lender) => {
      const data = lenderBreakdown[lender];
      data.approvalRate =
        data.count > 0 ? (data.approved / data.count) * 100 : 0;
    });

    // Get jobs that used financing (estimate revenue generated)
    const approvedApplicationIds =
      applications
        ?.filter((a) => a.status === 'approved' && a.job_id)
        .map((a) => a.job_id) || [];

    let revenueGenerated = 0;
    if (approvedApplicationIds.length > 0) {
      const { data: jobs } = await supabase
        .from('jobs')
        .select('contract_value, estimated_value, final_value')
        .in('id', approvedApplicationIds);

      revenueGenerated =
        jobs?.reduce((sum, job) => {
          return (
            sum +
            parseFloat(job.final_value || job.contract_value || job.estimated_value || 0)
          );
        }, 0) || 0;
    }

    return NextResponse.json({
      success: true,
      analytics: {
        period,
        totalApplications,
        preApprovedCount,
        approvedCount,
        deniedCount,
        expiredCount,
        totalAmountRequested,
        totalAmountApproved,
        avgLoanAmount: Math.round(avgLoanAmount * 100) / 100,
        revenueGenerated: Math.round(revenueGenerated * 100) / 100,
        approvalRate: Math.round(approvalRate * 100) / 100,
        lenderBreakdown,
      },
    });
  } catch (error: any) {
    console.error('Error getting financing analytics:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get analytics' },
      { status: 500 }
    );
  }
}





















