import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: po, error } = await supabase
      .from('purchase_orders')
      .select(`
        *,
        suppliers (
          id,
          name,
          contact_name,
          phone,
          email,
          credit_terms
        ),
        purchase_order_items (
          id,
          material_name,
          quantity,
          unit_cost,
          total_cost
        ),
        supplier_invoices (
          id,
          invoice_number,
          amount,
          invoice_url,
          received_at
        ),
        supplier_delivery_records (
          id,
          delivered_at,
          photo_url,
          notes
        ),
        jobs (
          id,
          address,
          homeowner_name
        )
      `)
      .eq('id', params.id)
      .single()

    if (error) {
      console.error('Error fetching purchase order:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Calculate variance
    const invoices = po.supplier_invoices || []
    const invoiceTotal = invoices.reduce((sum: number, inv: any) => sum + (inv.amount || 0), 0)
    const poTotal = po.total_estimated || 0
    const variance = invoiceTotal - poTotal
    const variancePercent = poTotal > 0 ? (variance / poTotal) * 100 : 0

    let varianceStatus = 'ok'
    if (Math.abs(variancePercent) > 10) {
      varianceStatus = 'discrepancy'
    } else if (Math.abs(variancePercent) > 5) {
      varianceStatus = 'warning'
    }

    return NextResponse.json({
      purchase_order: {
        ...po,
        invoice_total: invoiceTotal,
        variance,
        variance_percent: Math.round(variancePercent * 100) / 100,
        variance_status: varianceStatus
      }
    })
  } catch (error: any) {
    console.error('Error in GET /api/workforce/purchase-orders/[id]:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(
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
    const { status, items } = body

    // Update PO status if provided
    if (status) {
      const { error: updateError } = await supabase
        .from('purchase_orders')
        .update({ status })
        .eq('id', params.id)

      if (updateError) {
        console.error('Error updating PO status:', updateError)
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
    }

    // Update items if provided
    if (items && Array.isArray(items)) {
      // Delete existing items
      await supabase
        .from('purchase_order_items')
        .delete()
        .eq('po_id', params.id)

      // Insert new items
      const poItems = items.map((item: any) => ({
        po_id: params.id,
        material_name: item.material_name,
        quantity: item.quantity,
        unit_cost: item.unit_cost || 0
      }))

      const { error: itemsError } = await supabase
        .from('purchase_order_items')
        .insert(poItems)

      if (itemsError) {
        console.error('Error updating PO items:', itemsError)
        return NextResponse.json({ error: itemsError.message }, { status: 500 })
      }
    }

    // Fetch updated PO
    const { data: po, error: fetchError } = await supabase
      .from('purchase_orders')
      .select(`
        *,
        purchase_order_items (
          id,
          material_name,
          quantity,
          unit_cost,
          total_cost
        )
      `)
      .eq('id', params.id)
      .single()

    if (fetchError) {
      console.error('Error fetching updated PO:', fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    return NextResponse.json({ purchase_order: po })
  } catch (error: any) {
    console.error('Error in PATCH /api/workforce/purchase-orders/[id]:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
























