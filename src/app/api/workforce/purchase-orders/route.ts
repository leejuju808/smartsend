import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = req.nextUrl.searchParams
    const companyId = searchParams.get('company_id')
    const jobId = searchParams.get('job_id')
    const supplierId = searchParams.get('supplier_id')
    const status = searchParams.get('status')

    let query = supabase
      .from('purchase_orders')
      .select(`
        *,
        suppliers (
          id,
          name,
          contact_name,
          phone,
          email
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
        )
      `)
      .order('created_at', { ascending: false })

    if (companyId) {
      query = query.eq('company_id', companyId)
    }

    if (jobId) {
      query = query.eq('job_id', jobId)
    }

    if (supplierId) {
      query = query.eq('supplier_id', supplierId)
    }

    if (status) {
      query = query.eq('status', status)
    }

    const { data: purchaseOrders, error } = await query

    if (error) {
      console.error('Error fetching purchase orders:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Calculate invoice variance for each PO
    const posWithVariance = purchaseOrders?.map(po => {
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

      return {
        ...po,
        invoice_total: invoiceTotal,
        variance,
        variance_percent: Math.round(variancePercent * 100) / 100,
        variance_status: varianceStatus
      }
    }) || []

    return NextResponse.json({ purchase_orders: posWithVariance })
  } catch (error: any) {
    console.error('Error in GET /api/workforce/purchase-orders:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { company_id, job_id, supplier_id, items } = body

    if (!company_id || !supplier_id || !items || items.length === 0) {
      return NextResponse.json(
        { error: 'company_id, supplier_id, and items are required' },
        { status: 400 }
      )
    }

    // Create PO
    const { data: po, error: poError } = await supabase
      .from('purchase_orders')
      .insert({
        company_id,
        job_id,
        supplier_id,
        status: 'draft'
      })
      .select()
      .single()

    if (poError) {
      console.error('Error creating purchase order:', poError)
      return NextResponse.json({ error: poError.message }, { status: 500 })
    }

    // Create PO items
    const poItems = items.map((item: any) => ({
      po_id: po.id,
      material_name: item.material_name,
      quantity: item.quantity,
      unit_cost: item.unit_cost || 0
    }))

    const { error: itemsError } = await supabase
      .from('purchase_order_items')
      .insert(poItems)

    if (itemsError) {
      console.error('Error creating PO items:', itemsError)
      // Clean up PO if items fail
      await supabase.from('purchase_orders').delete().eq('id', po.id)
      return NextResponse.json({ error: itemsError.message }, { status: 500 })
    }

    // Fetch complete PO with items
    const { data: completePo, error: fetchError } = await supabase
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
      .eq('id', po.id)
      .single()

    if (fetchError) {
      console.error('Error fetching complete PO:', fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    return NextResponse.json({ purchase_order: completePo })
  } catch (error: any) {
    console.error('Error in POST /api/workforce/purchase-orders:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
























