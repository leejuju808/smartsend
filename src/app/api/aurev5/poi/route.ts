/**
 * AUREV Protocol v5 - Proof-of-Intelligence API
 * 
 * Record and verify optimized decisions
 */

import { NextRequest, NextResponse } from 'next/server'
import { getProtocolEngine } from '@/lib/aurev5/protocol-engine'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, ...params } = body
    
    const protocol = getProtocolEngine()
    
    if (action === 'record') {
      const {
        nodeId,
        actionType,
        actionInput,
        actionOutput,
        optimizationScore,
        decisionContext,
        alternativesConsidered,
        reasoningTrace,
      } = params
      
      if (!nodeId || !actionType || !actionInput) {
        return NextResponse.json(
          { error: 'nodeId, actionType, and actionInput are required' },
          { status: 400 }
        )
      }
      
      const poiAction = await protocol.recordPOIAction(
        nodeId,
        actionType,
        actionInput,
        {
          actionOutput,
          optimizationScore,
          decisionContext,
          alternativesConsidered,
          reasoningTrace,
        }
      )
      
      return NextResponse.json({ poiAction }, { status: 201 })
    }
    
    if (action === 'verify') {
      const { actionId, verifyingNodeId, outcomeSuccess, outcomeMetrics } = params
      
      if (!actionId || !verifyingNodeId || outcomeSuccess === undefined) {
        return NextResponse.json(
          { error: 'actionId, verifyingNodeId, and outcomeSuccess are required' },
          { status: 400 }
        )
      }
      
      await protocol.verifyPOIAction(
        actionId,
        verifyingNodeId,
        outcomeSuccess,
        outcomeMetrics
      )
      
      // Reward the PoI action
      const rewardAmountMicro = params.rewardAmountMicro || 1000000 // 1 AUREV default
      const transaction = await protocol.rewardPOIAction(actionId, rewardAmountMicro)
      
      return NextResponse.json({ 
        success: true,
        reward: transaction,
      })
    }
    
    return NextResponse.json(
      { error: 'Invalid action. Use "record" or "verify"' },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('Error in PoI API:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process PoI request' },
      { status: 500 }
    )
  }
}

