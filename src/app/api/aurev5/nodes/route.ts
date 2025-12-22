/**
 * AUREV Protocol v5 - Nodes API
 * 
 * Register and manage cognitive nodes (human, AI, org)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getProtocolEngine } from '@/lib/aurev5/protocol-engine'
import { getServerSupabase } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { nodeType, nodeIdentifier, displayName, description, cognitiveProfile } = body
    
    if (!nodeType || !nodeIdentifier) {
      return NextResponse.json(
        { error: 'nodeType and nodeIdentifier are required' },
        { status: 400 }
      )
    }
    
    const protocol = getProtocolEngine()
    const node = await protocol.registerNode(
      nodeType,
      nodeIdentifier,
      {
        displayName,
        description,
        cognitiveProfile,
      }
    )
    
    return NextResponse.json({ node }, { status: 201 })
  } catch (error: any) {
    console.error('Error registering node:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to register node' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const nodeIdentifier = searchParams.get('identifier')
    
    if (!nodeIdentifier) {
      return NextResponse.json(
        { error: 'nodeIdentifier is required' },
        { status: 400 }
      )
    }
    
    const protocol = getProtocolEngine()
    const node = await protocol.getNode(nodeIdentifier)
    
    if (!node) {
      return NextResponse.json(
        { error: 'Node not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({ node })
  } catch (error: any) {
    console.error('Error fetching node:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch node' },
      { status: 500 }
    )
  }
}

