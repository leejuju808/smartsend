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
    const status = searchParams.get('status') || 'active'

    let query = supabase
      .from('suppliers')
      .select(`
        *,
        vendor_ratings (
          rating_accuracy,
          rating_timeliness,
          rating_quality
        )
      `)
      .order('name', { ascending: true })

    if (companyId) {
      query = query.eq('company_id', companyId)
    }

    if (status) {
      query = query.eq('status', status)
    }

    const { data: suppliers, error } = await query

    if (error) {
      console.error('Error fetching suppliers:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Calculate vendor scores for each supplier
    const suppliersWithScores = suppliers?.map(supplier => {
      const ratings = supplier.vendor_ratings || []
      
      if (ratings.length === 0) {
        return {
          ...supplier,
          vendor_score: null,
          category: 'No Ratings',
          po_count: 0,
          balance: 0
        }
      }

      const accuracy = ratings.reduce((sum: number, r: any) => sum + (r.rating_accuracy || 0), 0) / ratings.length * 20
      const timeliness = ratings.reduce((sum: number, r: any) => sum + (r.rating_timeliness || 0), 0) / ratings.length * 20
      const quality = ratings.reduce((sum: number, r: any) => sum + (r.rating_quality || 0), 0) / ratings.length * 20
      const vendorScore = (accuracy + timeliness + quality) / 3

      let category = 'Risk Vendor'
      if (vendorScore >= 90) category = 'Elite Vendor'
      else if (vendorScore >= 80) category = 'Reliable'
      else if (vendorScore >= 60) category = 'Needs Improvement'

      return {
        ...supplier,
        vendor_score: Math.round(vendorScore * 100) / 100,
        category,
        po_count: 0, // Will be calculated separately
        balance: 0 // Will be calculated separately
      }
    }) || []

    // Get PO counts and balances
    for (const supplier of suppliersWithScores) {
      const { count } = await supabase
        .from('purchase_orders')
        .select('*', { count: 'exact', head: true })
        .eq('supplier_id', supplier.id)

      supplier.po_count = count || 0

      // Get outstanding balance
      const { data: statements } = await supabase
        .from('supplier_credit_statements')
        .select('balance_due')
        .eq('supplier_id', supplier.id)
        .eq('paid', false)

      supplier.balance = statements?.reduce((sum, s) => sum + (s.balance_due || 0), 0) || 0
    }

    return NextResponse.json({ suppliers: suppliersWithScores })
  } catch (error: any) {
    console.error('Error in GET /api/workforce/suppliers:', error)
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
    const { company_id, name, contact_name, phone, email, credit_terms, address } = body

    if (!company_id || !name) {
      return NextResponse.json({ error: 'company_id and name are required' }, { status: 400 })
    }

    const { data: supplier, error } = await supabase
      .from('suppliers')
      .insert({
        company_id,
        name,
        contact_name,
        phone,
        email,
        credit_terms,
        address,
        status: 'active'
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating supplier:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ supplier })
  } catch (error: any) {
    console.error('Error in POST /api/workforce/suppliers:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
























