import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { invoice_number, amount, invoice_url } = body

    if (!amount) {
      return NextResponse.json({ error: 'amount is required' }, { status: 400 })
    }

    const { data: invoice, error } = await supabase
      .from('supplier_invoices')
      .insert({
        po_id: params.id,
        invoice_number,
        amount,
        invoice_url,
        uploaded_by: user.id
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating invoice:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Calculate variance
    const { data: po } = await supabase
      .from('purchase_orders')
      .select('total_estimated')
      .eq('id', params.id)
      .single()

    const poTotal = po?.total_estimated || 0
    const variance = amount - poTotal
    const variancePercent = poTotal > 0 ? (variance / poTotal) * 100 : 0

    let varianceStatus = 'ok'
    if (Math.abs(variancePercent) > 10) {
      varianceStatus = 'discrepancy'
    } else if (Math.abs(variancePercent) > 5) {
      varianceStatus = 'warning'
    }

    return NextResponse.json({
      invoice,
      variance,
      variance_percent: Math.round(variancePercent * 100) / 100,
      variance_status: varianceStatus
    })
  } catch (error: any) {
    console.error('Error in POST /api/workforce/purchase-orders/[id]/invoice:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
























