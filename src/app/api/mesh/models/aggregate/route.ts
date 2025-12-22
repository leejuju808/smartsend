import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { FederatedBrain } from '@/lib/aurev3/federated-brain'

/**
 * POST /api/mesh/models/aggregate
 * Trigger model aggregation (admin/system only)
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Check admin access (in production, check specific role/permission)
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', user.id)
      .single()
    
    // For now, allow if user email contains @aurev or admin
    const isAdmin = profile?.email?.includes('@aurev') || 
                    profile?.email?.includes('admin')
    
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    
    const body = await req.json()
    const { modelName, aggregationMethod } = body
    
    if (!modelName) {
      return NextResponse.json(
        { error: 'modelName required' },
        { status: 400 }
      )
    }
    
    const brain = new FederatedBrain()
    const aggregatedModel = await brain.aggregateModel(
      modelName,
      aggregationMethod || 'fedavg'
    )
    
    return NextResponse.json({
      success: true,
      model: aggregatedModel,
    })
  } catch (error) {
    console.error('Error aggregating model:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to aggregate model' },
      { status: 500 }
    )
  }
}

