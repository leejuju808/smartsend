// app/api/segments/[segmentId]/debug/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import {
  evaluateSegmentTreeWithDebug,
  type SegmentRuleNode,
  type SegmentDebugResult,
} from '@/lib/segments/debug';
import { getSupabaseServerClient, requireUserAndAccount } from '@/lib/supabase/server';

type SegmentRow = {
  id: string;
  account_id: string;
  owner_id?: string;
  name: string;
  description?: string | null;
  rule?: any;
  conditions?: any;
};

type LeadRow = {
  id: string;
  account_id?: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  title?: string | null;
  [key: string]: any;
};

export async function POST(
  req: NextRequest,
  { params }: { params: { segmentId: string } }
) {
  try {
    const supabase = getSupabaseServerClient();
    const { account, user } = await requireUserAndAccount(supabase);

    const body = await req.json().catch(() => ({}));
    const sampleSize = Number(body.sampleSize ?? 50);

    // 1) Load segment - try both segments and segment_definitions tables
    let segment: SegmentRow | null = null;
    let segmentError: any = null;

    // Try segments table first (with rule jsonb)
    const { data: segment1, error: err1 } = await supabase
      .from('segments')
      .select('*')
      .eq('id', params.segmentId)
      .eq('account_id', account.id)
      .single<SegmentRow>();

    if (!err1 && segment1) {
      segment = segment1;
    } else {
      // Try segment_definitions table (with filters array)
      const { data: segment2, error: err2 } = await supabase
        .from('segment_definitions')
        .select('*')
        .eq('id', params.segmentId)
        .eq('account_id', account.id)
        .eq('owner_id', user.id)
        .single<SegmentRow>();

      if (!err2 && segment2) {
        segment = segment2;
      } else {
        segmentError = err2 || err1;
      }
    }

    if (segmentError || !segment) {
      return NextResponse.json(
        {
          error: 'segment_not_found',
          details: segmentError?.message ?? 'No segment with that id',
        },
        { status: 404 }
      );
    }

    // Extract rules from either rule jsonb or conditions array
    const rules = segment.rule ?? segment.conditions ?? null;

    // 2) Fetch a sample of leads in this account with companies data
    // Use account_id to filter (RLS will handle access control)
    let leadsQuery = supabase
      .from('leads')
      .select('*, companies(*)')
      .eq('account_id', account.id)
      .limit(sampleSize);

    const { data: leads, error: leadsError } = await leadsQuery;

    if (leadsError) {
      return NextResponse.json(
        {
          error: 'leads_query_failed',
          details: leadsError.message,
        },
        { status: 500 }
      );
    }

    const debugResults: SegmentDebugResult<LeadRow>[] = (leads ?? []).map(
      (lead: LeadRow) => evaluateSegmentTreeWithDebug<LeadRow>(rules, lead)
    );

    const matched = debugResults.filter((r) => r.matched);
    const unmatched = debugResults.filter((r) => !r.matched);

    return NextResponse.json({
      segmentId: segment.id,
      totalSampled: debugResults.length,
      matchedCount: matched.length,
      unmatchedCount: unmatched.length,
      matched,
      unmatched,
    });
  } catch (err: any) {
    console.error('Segment debug error:', err);
    return NextResponse.json(
      {
        error: 'internal_error',
        details: err.message || 'Unexpected error',
      },
      { status: 500 }
    );
  }
}

