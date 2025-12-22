import { NextRequest, NextResponse } from 'next/server'
import { AUREVCommerce } from '@/lib/aurev4/commerce'

/**
 * GET /api/aurev4/commerce/services
 * Search service marketplace
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    const commerce = new AUREVCommerce()
    const services = await commerce.searchServices({
      service_type: searchParams.get('service_type') as any,
      category: searchParams.get('category') || undefined,
      tags: searchParams.get('tags')?.split(',') || undefined,
      max_price: searchParams.get('max_price') ? parseFloat(searchParams.get('max_price')!) : undefined,
      min_success_rate: searchParams.get('min_success_rate') ? parseFloat(searchParams.get('min_success_rate')!) : undefined,
      available_only: searchParams.get('available_only') !== 'false',
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined,
    })

    return NextResponse.json({ services })
  } catch (error: any) {
    console.error('Error searching services:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to search services' },
      { status: 500 }
    )
  }
}

