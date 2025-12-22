import { NextRequest, NextResponse } from 'next/server'
import { AUREVExchange } from '@/lib/aurev4/exchange'
import { requireWorkspace } from '@/lib/workspace/withWorkspace'

/**
 * POST /api/aurev4/exchange/contracts/[contractId]/settle
 * Settle a contract (atomic settlement)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { contractId: string } }
) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { workspace_id } = gate
    const { contractId } = params
    const body = await req.json()

    const { settlement_method, settlement_provider } = body

    if (!settlement_method) {
      return NextResponse.json(
        { error: 'Missing required field: settlement_method' },
        { status: 400 }
      )
    }

    const exchange = new AUREVExchange()

    // Verify contract belongs to workspace
    const contract = await exchange.getContract(contractId, workspace_id)
    if (!contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      )
    }

    const settlement = await exchange.settleContract({
      contract_id: contractId,
      org_id: workspace_id,
      settlement_method,
      settlement_provider,
    })

    return NextResponse.json({ settlement })
  } catch (error: any) {
    console.error('Error settling contract:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to settle contract' },
      { status: 500 }
    )
  }
}

