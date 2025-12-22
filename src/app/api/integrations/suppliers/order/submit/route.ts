import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { getCurrentCompanyId } from '@/lib/company-helpers'

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name: string) => cookieStore.get(name)?.value,
          set: () => {},
          remove: () => {},
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const companyId = await getCurrentCompanyId()
    if (!companyId) {
      return NextResponse.json({ error: 'No company found' }, { status: 400 })
    }

    const body = await req.json()
    const { supplier_type, supplier_name, order_data, job_id, delivery_address, estimated_delivery_date } = body

    if (!supplier_type || !supplier_name || !order_data) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Store order in supplier_orders table
    // When supplier APIs become available, we'll submit to their API here
    const { data: supplierOrder, error: insertError } = await supabase
      .from('supplier_orders')
      .insert({
        roofing_company_id: companyId,
        supplier_type,
        supplier_name,
        order_data,
        job_id: job_id || null,
        status: 'pending',
        delivery_address,
        estimated_delivery_date,
        created_by_user_id: user.id,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error storing supplier order:', insertError)
      return NextResponse.json({ error: 'Failed to store order' }, { status: 500 })
    }

    // TODO: When supplier APIs are available, submit order here
    // For now, we just store it and mark as 'submitted'
    // Example for future:
    // if (supplier_type === 'abc_supply' && integration_accounts has ABC Supply API key) {
    //   await submitToABCSupply(order_data)
    //   supplierOrder.status = 'submitted'
    // }

    // Trigger webhook for supplier_order.sent event
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/integrations/webhooks/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'supplier_order.sent',
          event_data: {
            order_id: supplierOrder.id,
            supplier_type,
            supplier_name,
            job_id,
          },
          company_id: companyId,
        }),
      })
    } catch (webhookError) {
      console.error('Error triggering webhook:', webhookError)
      // Don't fail the request if webhook fails
    }

    return NextResponse.json({ success: true, order: supplierOrder })
  } catch (error: any) {
    console.error('Error submitting supplier order:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

























