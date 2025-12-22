import { NextRequest, NextResponse } from 'next/server'
import { AUREVReputation } from '@/lib/aurev4/reputation'

/**
 * GET /api/aurev4/reputation/[entityType]/[entityId]
 * Get reputation for an entity
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { entityType: string; entityId: string } }
) {
  try {
    const { entityType, entityId } = params

    if (!['agent', 'org', 'service', 'model'].includes(entityType)) {
      return NextResponse.json(
        { error: 'Invalid entity type. Must be: agent, org, service, or model' },
        { status: 400 }
      )
    }

    const reputation = new AUREVReputation()
    const rep = await reputation.getReputation(
      entityType as any,
      entityId
    )

    if (!rep) {
      return NextResponse.json(
        { error: 'Reputation not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ reputation: rep })
  } catch (error: any) {
    console.error('Error getting reputation:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get reputation' },
      { status: 500 }
    )
  }
}

