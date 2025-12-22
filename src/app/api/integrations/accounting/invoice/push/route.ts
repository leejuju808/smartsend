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
    const { invoice_id, invoice_data } = body

    if (!invoice_id || !invoice_data) {
      return NextResponse.json({ error: 'Missing invoice_id or invoice_data' }, { status: 400 })
    }

    // Get QuickBooks integration
    const { data: qbIntegration, error: integrationError } = await supabase
      .from('integration_accounts')
      .select('*')
      .eq('roofing_company_id', companyId)
      .eq('integration_type', 'quickbooks')
      .eq('is_active', true)
      .maybeSingle()

    if (integrationError || !qbIntegration) {
      return NextResponse.json({ error: 'QuickBooks not connected' }, { status: 400 })
    }

    // Refresh token if needed
    let accessToken = qbIntegration.access_token
    if (qbIntegration.expires_at && new Date(qbIntegration.expires_at) < new Date()) {
      accessToken = await refreshQuickBooksToken(qbIntegration.refresh_token, qbIntegration.config?.realm_id)
    }

    const realmId = qbIntegration.config?.realm_id
    if (!realmId) {
      return NextResponse.json({ error: 'QuickBooks company not connected' }, { status: 400 })
    }

    // Create invoice in QuickBooks
    const qbInvoice = {
      Line: invoice_data.line_items?.map((item: any) => ({
        Amount: item.amount,
        DetailType: 'SalesItemLineDetail',
        SalesItemLineDetail: {
          ItemRef: { value: item.item_id || '1' }, // Default item
          UnitPrice: item.unit_price,
          Qty: item.quantity,
        },
        Description: item.description,
      })) || [],
      CustomerRef: {
        value: invoice_data.customer_id || invoice_data.customer_qb_id,
      },
      TxnDate: invoice_data.date || new Date().toISOString().split('T')[0],
      DueDate: invoice_data.due_date || invoice_data.date,
      TotalAmt: invoice_data.total_amount,
      DocNumber: invoice_data.invoice_number,
    }

    const res = await fetch(`https://sandbox-quickbooks.api.intuit.com/v3/company/${realmId}/invoice`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(qbInvoice),
    })

    if (!res.ok) {
      const error = await res.text()
      console.error('QuickBooks API error:', error)
      return NextResponse.json({ error: 'Failed to create invoice in QuickBooks' }, { status: 500 })
    }

    const qbData = await res.json()
    const qbInvoiceId = qbData.QueryResponse?.Invoice?.[0]?.Id

    return NextResponse.json({ 
      success: true, 
      quickbooks_invoice_id: qbInvoiceId,
      invoice: qbData.QueryResponse?.Invoice?.[0],
    })
  } catch (error: any) {
    console.error('Error pushing invoice to QuickBooks:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

async function refreshQuickBooksToken(refreshToken: string, realmId: string): Promise<string> {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('QuickBooks OAuth not configured')
  }

  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    throw new Error('Failed to refresh QuickBooks token')
  }

  const data = await res.json()
  return data.access_token
}

























