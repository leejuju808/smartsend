import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { detectAnomalies } from '@/lib/intelligence/engine';

/**
 * GET /api/hq/intel/anomalies
 * Detect anomalies in org metrics
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get('org_id');
    
    if (!orgId) {
      return NextResponse.json(
        { error: 'org_id is required' },
        { status: 400 }
      );
    }
    
    const anomalies = await detectAnomalies(orgId);
    
    return NextResponse.json({
      anomalies
    });
    
  } catch (error: any) {
    console.error('Anomalies API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to detect anomalies' },
      { status: 500 }
    );
  }
}

