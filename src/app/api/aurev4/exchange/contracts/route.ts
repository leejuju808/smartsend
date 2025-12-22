import { NextRequest, NextResponse } from 'next/server'
import { AUREVExchange } from '@/lib/aurev4/exchange'
import { requireWorkspace } from '@/lib/workspace/withWorkspace'

/**
 * POST /api/aurev4/exchange/contracts
 * Create a new smart contract
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { workspace_id, user } = gate
    const body = await req.json()

    const {
      buyer_agent_id,
      seller_agent_id,
      contract_type,
      service_name,
      service_description,
      price_per_unit,
      units,
      currency,
      escrow_enabled,
      delivery_deadline,
      contract_terms,
    } = body

    if (!contract_type || !service_name || !price_per_unit || !units) {
      return NextResponse.json(
        { error: 'Missing required fields: contract_type, service_name, price_per_unit, units' },
        { status: 400 }
      )
    }

    const exchange = new AUREVExchange()
    const contract = await exchange.createContract({
      org_id: workspace_id,
      buyer_agent_id,
      seller_agent_id,
      contract_type,
      service_name,
      service_description,
      price_per_unit: parseFloat(price_per_unit),
      units: parseInt(units),
      currency,
      escrow_enabled,
      delivery_deadline: delivery_deadline ? new Date(delivery_deadline) : undefined,
      contract_terms,
    })

    return NextResponse.json({ contract })
  } catch (error: any) {
    console.error('Error creating contract:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create contract' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/aurev4/exchange/contracts
 * List contracts for workspace
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { workspace_id } = gate
    const { searchParams } = new URL(req.url)

    const exchange = new AUREVExchange()
    const contracts = await exchange.listContracts(workspace_id, {
      status: searchParams.get('status') as any,
      type: searchParams.get('type') as any,
      buyer_agent_id: searchParams.get('buyer_agent_id') || undefined,
      seller_agent_id: searchParams.get('seller_agent_id') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined,
    })

    return NextResponse.json({ contracts })
  } catch (error: any) {
    console.error('Error listing contracts:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to list contracts' },
      { status: 500 }
    )
  }
}

