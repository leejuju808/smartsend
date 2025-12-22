import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { FederatedBrain } from '@/lib/aurev3/federated-brain'

/**
 * POST /api/mesh/gradients/contribute
 * Contribute encrypted gradients from a local node
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = getServerSupabase()
    
    // Allow auth via API key for node-to-node
    const apiKey = req.headers.get('x-aurev-mesh-key')
    const nodeId = req.headers.get('x-aurev-node-id')
    
    if (!apiKey || !nodeId) {
      return NextResponse.json(
        { error: 'x-aurev-mesh-key and x-aurev-node-id headers required' },
        { status: 401 }
      )
    }
    
    const body = await req.json()
    const {
      modelName,
      gradientData, // Base64 encoded
      trainingSamples,
      validationAccuracy,
      trainingLoss,
      metadata,
    } = body
    
    if (!modelName || !gradientData || !trainingSamples) {
      return NextResponse.json(
        { error: 'modelName, gradientData, and trainingSamples required' },
        { status: 400 }
      )
    }
    
    // Decode gradient data
    const gradientBuffer = Buffer.from(gradientData, 'base64')
    
    const brain = new FederatedBrain()
    const gradientId = await brain.recordGradientContribution(
      nodeId,
      modelName,
      gradientBuffer,
      trainingSamples,
      validationAccuracy || 0,
      trainingLoss || 0,
      metadata
    )
    
    return NextResponse.json({
      success: true,
      gradientId,
      message: 'Gradient contribution recorded',
    })
  } catch (error) {
    console.error('Error contributing gradient:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to contribute gradient' },
      { status: 500 }
    )
  }
}







