import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateRecommendations } from '@/lib/intelligence/engine';

/**
 * POST /api/hq/intel/recommend
 * Generate AI recommendations for optimization
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { org_id, context, goal, current_metrics } = body;
    
    // Validation
    if (!org_id) {
      return NextResponse.json(
        { error: 'org_id is required' },
        { status: 400 }
      );
    }
    
    if (!context || !goal) {
      return NextResponse.json(
        { error: 'context and goal are required' },
        { status: 400 }
      );
    }
    
    // Validate context
    const validContexts = ['smart_send_campaign', 'opsgrid_workflow', 'agentcloud_deployment', 'general'];
    if (!validContexts.includes(context)) {
      return NextResponse.json(
        { error: `Invalid context. Must be one of: ${validContexts.join(', ')}` },
        { status: 400 }
      );
    }
    
    const supabase = createServiceClient();
    
    // Generate recommendations
    const recommendationResult = await generateRecommendations({
      orgId: org_id,
      context: context as any,
      goal,
      currentMetrics: current_metrics
    });
    
    // Store recommendations in database
    const storedRecommendations = [];
    for (const rec of recommendationResult.recommendations) {
      const { data: stored, error: storeError } = await supabase
        .rpc('create_intel_recommendation', {
          p_org_id: org_id,
          p_recommendation_type: 'optimization',
          p_title: rec.title,
          p_description: rec.description,
          p_priority: rec.priority || 'medium',
          p_suggested_action: rec.action,
          p_action_context: JSON.stringify({}),
          p_estimated_impact: JSON.stringify(rec.estimatedImpact || {}),
          p_confidence: rec.confidence || 0.5,
          p_context: JSON.stringify({ context, goal })
        });
      
      if (storeError) {
        console.error('Error storing recommendation:', storeError);
      } else {
        storedRecommendations.push({
          ...rec,
          id: stored
        });
      }
    }
    
    return NextResponse.json({
      recommendations: storedRecommendations
    });
    
  } catch (error: any) {
    console.error('Recommendation API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate recommendations' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/hq/intel/recommend
 * Get recommendations for an org
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get('org_id');
    const status = searchParams.get('status') || 'pending';
    const limit = parseInt(searchParams.get('limit') || '20');
    
    if (!orgId) {
      return NextResponse.json(
        { error: 'org_id is required' },
        { status: 400 }
      );
    }
    
    const supabase = createServiceClient();
    
    let query = supabase
      .from('intel_recommendations')
      .select('*')
      .eq('org_id', orgId)
      .eq('status', status)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    
    const { data: recommendations, error } = await query;
    
    if (error) {
      console.error('Error fetching recommendations:', error);
      return NextResponse.json(
        { error: 'Failed to fetch recommendations' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      recommendations: recommendations || []
    });
    
  } catch (error: any) {
    console.error('Get recommendations API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch recommendations' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/hq/intel/recommend
 * Update recommendation status (approve, apply, ignore)
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { recommendation_id, status, auto_apply } = body;
    
    if (!recommendation_id || !status) {
      return NextResponse.json(
        { error: 'recommendation_id and status are required' },
        { status: 400 }
      );
    }
    
    const validStatuses = ['pending', 'approved', 'applied', 'ignored', 'rejected'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }
    
    const supabase = createServiceClient();
    
    const updateData: any = {
      status,
      resolved_at: status !== 'pending' ? new Date().toISOString() : null
    };
    
    if (status === 'applied') {
      updateData.applied_at = new Date().toISOString();
    }
    
    if (auto_apply !== undefined) {
      updateData.auto_apply = auto_apply;
    }
    
    const { data: updated, error } = await supabase
      .from('intel_recommendations')
      .update(updateData)
      .eq('id', recommendation_id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating recommendation:', error);
      return NextResponse.json(
        { error: 'Failed to update recommendation' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      recommendation: updated
    });
    
  } catch (error: any) {
    console.error('Update recommendation API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update recommendation' },
      { status: 500 }
    );
  }
}

