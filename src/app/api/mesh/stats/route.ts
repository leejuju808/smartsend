import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { MeshProtocol } from '@/lib/aurev3/mesh-protocol'

/**
 * GET /api/mesh/stats
 * Get global network statistics
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const protocol = new MeshProtocol()
    const stats = await protocol.getNetworkStats()
    
    return NextResponse.json({ stats })
  } catch (error) {
    console.error('Error fetching mesh stats:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch stats' },
      { status: 500 }
    )
  }
}

