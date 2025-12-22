import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { MeshProtocol } from '@/lib/aurev3/mesh-protocol'
import { getActiveOrg } from '@/lib/org'

/**
 * POST /api/mesh/register
 * Register or update a mesh node for the organization
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const org = await getActiveOrg()
    if (!org) {
      return NextResponse.json({ error: 'Organization required' }, { status: 400 })
    }
    
    const body = await req.json()
    const { nodeType, nodeIdentifier, meshEndpoint, metadata } = body
    
    if (!nodeType || !nodeIdentifier) {
      return NextResponse.json(
        { error: 'nodeType and nodeIdentifier required' },
        { status: 400 }
      )
    }
    
    const protocol = new MeshProtocol()
    const node = await protocol.registerNode(
      org.id,
      nodeType,
      nodeIdentifier,
      meshEndpoint,
      metadata
    )
    
    return NextResponse.json({ node })
  } catch (error) {
    console.error('Error registering mesh node:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to register node' },
      { status: 500 }
    )
  }
}

