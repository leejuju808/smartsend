import { NextRequest, NextResponse } from 'next/server'
import { AUREVCommerce } from '@/lib/aurev4/commerce'
import { requireWorkspace } from '@/lib/workspace/withWorkspace'

/**
 * POST /api/aurev4/commerce/services/purchase
 * Purchase a service (creates smart contract)
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { workspace_id } = gate
    const body = await req.json()

    const { buyer_agent_id, service_listing_id, units } = body

    if (!service_listing_id || !units) {
      return NextResponse.json(
        { error: 'Missing required fields: service_listing_id, units' },
        { status: 400 }
      )
    }

    const commerce = new AUREVCommerce()
    const contract_id = await commerce.purchaseService({
      org_id: workspace_id,
      buyer_agent_id,
      service_listing_id,
      units: parseInt(units),
    })

    return NextResponse.json({ contract_id })
  } catch (error: any) {
    console.error('Error purchasing service:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to purchase service' },
      { status: 500 }
    )
  }
}

