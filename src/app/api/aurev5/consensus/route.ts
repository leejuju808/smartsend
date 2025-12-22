/**
 * AUREV Protocol v5 - Consensus API
 * 
 * Submit and verify knowledge claims
 */

import { NextRequest, NextResponse } from 'next/server'
import { getProtocolEngine } from '@/lib/aurev5/protocol-engine'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, ...params } = body
    
    const protocol = getProtocolEngine()
    
    if (action === 'submit') {
      const { nodeId, claimType, claimContent, context, expiresAt } = params
      
      if (!nodeId || !claimType || !claimContent) {
        return NextResponse.json(
          { error: 'nodeId, claimType, and claimContent are required' },
          { status: 400 }
        )
      }
      
      const claim = await protocol.submitClaim(
        nodeId,
        claimType,
        claimContent,
        { context, expiresAt: expiresAt ? new Date(expiresAt) : undefined }
      )
      
      return NextResponse.json({ claim }, { status: 201 })
    }
    
    if (action === 'verify') {
      const { claimId, verifyingNodeId, verificationScore, dispute, evidence } = params
      
      if (!claimId || !verifyingNodeId || verificationScore === undefined) {
        return NextResponse.json(
          { error: 'claimId, verifyingNodeId, and verificationScore are required' },
          { status: 400 }
        )
      }
      
      await protocol.verifyClaim(
        claimId,
        verifyingNodeId,
        verificationScore,
        { dispute, evidence }
      )
      
      // Reward consensus participation
      await protocol.rewardConsensusParticipation(claimId, verifyingNodeId)
      
      return NextResponse.json({ success: true })
    }
    
    return NextResponse.json(
      { error: 'Invalid action. Use "submit" or "verify"' },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('Error in consensus API:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process consensus request' },
      { status: 500 }
    )
  }
}

