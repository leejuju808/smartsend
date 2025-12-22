import { NextRequest, NextResponse } from 'next/server'
import { AUREVProofOfIntelligence } from '@/lib/aurev4/proof-of-intelligence'
import { requireWorkspace } from '@/lib/workspace/withWorkspace'

/**
 * POST /api/aurev4/poi/claims
 * Submit a Proof of Intelligence claim
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { workspace_id } = gate
    const body = await req.json()

    const {
      agent_id,
      intelligence_type,
      claim_description,
      claim_data,
      metadata,
    } = body

    if (!intelligence_type || !claim_description) {
      return NextResponse.json(
        { error: 'Missing required fields: intelligence_type, claim_description' },
        { status: 400 }
      )
    }

    const poi = new AUREVProofOfIntelligence()
    const claim = await poi.submitClaim({
      org_id: workspace_id,
      agent_id,
      intelligence_type,
      claim_description,
      claim_data,
      metadata,
    })

    return NextResponse.json({ claim })
  } catch (error: any) {
    console.error('Error submitting PoI claim:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to submit PoI claim' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/aurev4/poi/claims
 * List Proof of Intelligence claims
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { workspace_id } = gate
    const { searchParams } = new URL(req.url)

    const poi = new AUREVProofOfIntelligence()
    const claims = await poi.listClaims({
      org_id: workspace_id,
      agent_id: searchParams.get('agent_id') || undefined,
      intelligence_type: searchParams.get('intelligence_type') as any,
      validation_status: searchParams.get('validation_status') as any,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined,
    })

    return NextResponse.json({ claims })
  } catch (error: any) {
    console.error('Error listing PoI claims:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to list PoI claims' },
      { status: 500 }
    )
  }
}

