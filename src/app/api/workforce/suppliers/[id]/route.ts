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

    const { data: supplier, error } = await supabase
      .from('suppliers')
      .select(`
        *,
        vendor_ratings (
          id,
          job_id,
          rating_accuracy,
          rating_timeliness,
          rating_quality,
          notes,
          created_at
        )
      `)
      .eq('id', params.id)
      .single()

    if (error) {
      console.error('Error fetching supplier:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get PO count
    const { count: poCount } = await supabase
      .from('purchase_orders')
      .select('*', { count: 'exact', head: true })
      .eq('supplier_id', params.id)

    // Get outstanding balance
    const { data: statements } = await supabase
      .from('supplier_credit_statements')
      .select('balance_due')
      .eq('supplier_id', params.id)
      .eq('paid', false)

    const balance = statements?.reduce((sum, s) => sum + (s.balance_due || 0), 0) || 0

    // Calculate vendor score
    const ratings = supplier.vendor_ratings || []
    let vendorScore = null
    let category = 'No Ratings'

    if (ratings.length > 0) {
      const accuracy = ratings.reduce((sum: number, r: any) => sum + (r.rating_accuracy || 0), 0) / ratings.length * 20
      const timeliness = ratings.reduce((sum: number, r: any) => sum + (r.rating_timeliness || 0), 0) / ratings.length * 20
      const quality = ratings.reduce((sum: number, r: any) => sum + (r.rating_quality || 0), 0) / ratings.length * 20
      vendorScore = (accuracy + timeliness + quality) / 3

      if (vendorScore >= 90) category = 'Elite Vendor'
      else if (vendorScore >= 80) category = 'Reliable'
      else if (vendorScore >= 60) category = 'Needs Improvement'
      else category = 'Risk Vendor'
    }

    return NextResponse.json({
      supplier: {
        ...supplier,
        po_count: poCount || 0,
        balance,
        vendor_score: vendorScore ? Math.round(vendorScore * 100) / 100 : null,
        category
      }
    })
  } catch (error: any) {
    console.error('Error in GET /api/workforce/suppliers/[id]:', error)
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
    const { name, contact_name, phone, email, credit_terms, address, status } = body

    const { data: supplier, error } = await supabase
      .from('suppliers')
      .update({
        ...(name && { name }),
        ...(contact_name !== undefined && { contact_name }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email }),
        ...(credit_terms !== undefined && { credit_terms }),
        ...(address !== undefined && { address }),
        ...(status && { status })
      })
      .eq('id', params.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating supplier:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ supplier })
  } catch (error: any) {
    console.error('Error in PATCH /api/workforce/suppliers/[id]:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
























