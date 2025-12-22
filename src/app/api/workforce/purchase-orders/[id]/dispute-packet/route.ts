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

    // Get complete PO data
    const { data: po, error: poError } = await supabase
      .from('purchase_orders')
      .select(`
        *,
        suppliers (
          id,
          name,
          contact_name,
          phone,
          email,
          address
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

    if (poError || !po) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    }

    // Calculate variance
    const invoices = po.supplier_invoices || []
    const invoiceTotal = invoices.reduce((sum: number, inv: any) => sum + (inv.amount || 0), 0)
    const poTotal = po.total_estimated || 0
    const variance = invoiceTotal - poTotal
    const variancePercent = poTotal > 0 ? (variance / poTotal) * 100 : 0

    // Generate PDF content (simplified - in production, use a PDF library like pdfkit or puppeteer)
    // For now, we'll return JSON that can be used to generate PDF on client or server
    const disputePacket = {
      po_number: po.po_number,
      created_at: po.created_at,
      supplier: {
        name: po.suppliers?.name,
        contact_name: po.suppliers?.contact_name,
        phone: po.suppliers?.phone,
        email: po.suppliers?.email,
        address: po.suppliers?.address
      },
      job: {
        address: po.jobs?.address,
        homeowner_name: po.jobs?.homeowner_name
      },
      items: po.purchase_order_items || [],
      po_total: poTotal,
      invoices: invoices.map((inv: any) => ({
        invoice_number: inv.invoice_number,
        amount: inv.amount,
        received_at: inv.received_at,
        invoice_url: inv.invoice_url
      })),
      invoice_total: invoiceTotal,
      variance,
      variance_percent: Math.round(variancePercent * 100) / 100,
      delivery_records: (po.supplier_delivery_records || []).map((dr: any) => ({
        delivered_at: dr.delivered_at,
        notes: dr.notes,
        photo_url: dr.photo_url
      })),
      generated_at: new Date().toISOString(),
      generated_by: user.id
    }

    // In production, generate actual PDF here using a library
    // For now, return JSON that can be used to generate PDF
    return NextResponse.json(disputePacket, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="dispute-packet-${po.po_number}.json"`
      }
    })

    // TODO: Implement actual PDF generation using pdfkit or similar
    // const PDFDocument = require('pdfkit')
    // const doc = new PDFDocument()
    // ... generate PDF content
    // return new NextResponse(pdfBuffer, {
    //   headers: {
    //     'Content-Type': 'application/pdf',
    //     'Content-Disposition': `attachment; filename="dispute-packet-${po.po_number}.pdf"`
    //   }
    // })
  } catch (error: any) {
    console.error('Error generating dispute packet:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
























