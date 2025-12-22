import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { MeshProtocol } from '@/lib/aurev3/mesh-protocol'

/**
 * POST /api/mesh/heartbeat
 * Send heartbeat from mesh node
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase()
    
    // Allow auth via API key (for node-to-node communication)
    const apiKey = req.headers.get('x-aurev-mesh-key')
    const nodeId = req.headers.get('x-aurev-node-id')
    
    if (!nodeId) {
      // Try user auth as fallback
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }
    
    const body = await req.json()
    const { 
      nodeId: bodyNodeId,
      totalAgents,
      totalDecisionsToday,
      localModelAccuracy,
    } = body
    
    const targetNodeId = bodyNodeId || nodeId
    if (!targetNodeId) {
      return NextResponse.json({ error: 'nodeId required' }, { status: 400 })
    }
    
    const protocol = new MeshProtocol()
    await protocol.sendHeartbeat(targetNodeId, {
      totalAgents,
      totalDecisionsToday,
      localModelAccuracy,
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error sending heartbeat:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send heartbeat' },
      { status: 500 }
    )
  }
}

