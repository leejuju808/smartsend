import { NextRequest, NextResponse } from 'next/server'
import { AUREVDAO } from '@/lib/aurev4/governance'
import { requireWorkspace } from '@/lib/workspace/withWorkspace'

/**
 * POST /api/aurev4/dao/proposals
 * Create a new DAO proposal
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { workspace_id } = gate
    const body = await req.json()

    const {
      proposer_agent_id,
      proposal_type,
      title,
      description,
      proposal_data,
      quorum_required,
      voting_duration_days,
    } = body

    if (!proposal_type || !title || !description) {
      return NextResponse.json(
        { error: 'Missing required fields: proposal_type, title, description' },
        { status: 400 }
      )
    }

    const dao = new AUREVDAO()
    const proposal = await dao.createProposal({
      proposer_org_id: workspace_id,
      proposer_agent_id,
      proposal_type,
      title,
      description,
      proposal_data,
      quorum_required,
      voting_duration_days,
    })

    return NextResponse.json({ proposal })
  } catch (error: any) {
    console.error('Error creating proposal:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create proposal' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/aurev4/dao/proposals
 * List DAO proposals
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    const dao = new AUREVDAO()
    const proposals = await dao.listProposals({
      status: searchParams.get('status') as any,
      type: searchParams.get('type') as any,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined,
    })

    return NextResponse.json({ proposals })
  } catch (error: any) {
    console.error('Error listing proposals:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to list proposals' },
      { status: 500 }
    )
  }
}

