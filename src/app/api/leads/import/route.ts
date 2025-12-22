import { NextRequest, NextResponse } from 'next/server'
import { parse } from 'csv-parse/sync'
import { createServerClient } from '@/lib/supabase/service'

type MapKeys = 'email'|'first_name'|'last_name'|'company'|'title'|'phone'|'website'|'linkedin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File
    const teamId = form.get('teamId') as string
    const mapping = JSON.parse(String(form.get('mapping') || '{}')) as Record<string, MapKeys|`custom.${string}`>

    if (!file || !teamId) {
      return NextResponse.json({ error: 'Missing file or teamId' }, { status: 400 })
    }

    const supabase = createServerClient()

    const text = await file.text()
    const rows: any[] = parse(text, { columns: true, skip_empty_lines: true, trim: true })

    // Known fields that map to lead columns
    const known = ["email", "first_name", "last_name", "full_name", "company", "title", "website", "city", "state", "country", "domain", "phone", "linkedin"];
    
    // Transform rows using mapping
    const toInsert = rows.map((r) => {
      const base: any = { team_id: teamId, custom_fields: {} as Record<string, any> }
      const mappedCols = new Set(Object.keys(mapping));
      
      // Process mapped columns
      for (const [csvCol, field] of Object.entries(mapping)) {
        const val = r[csvCol] ?? null
        if (!field) continue
        if (field.startsWith('custom.')) {
          // Block 8600: Store custom fields in custom_fields JSONB column
          const customKey = field.split('.').slice(1).join('.')
          base.custom_fields[customKey] = val
        } else if (known.includes(field)) {
          base[field] = val
        } else {
          // Unknown field goes to custom_fields
          base.custom_fields[field] = val
        }
      }
      
      // Put unmapped columns into custom_fields
      for (const [csvCol, val] of Object.entries(r)) {
        if (!mappedCols.has(csvCol) && val != null && val !== '') {
          base.custom_fields[csvCol] = val
        }
      }
      
      return base
    }).filter(x => x.email) // require email

    if (toInsert.length === 0) {
      return NextResponse.json({ error: 'No valid rows with email found' }, { status: 400 })
    }

    // Check limits before importing
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const checkLimitsRes = await fetch(`${supabaseUrl}/functions/v1/checkLimits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ teamId, type: 'lead' }),
    })

    const checkLimits = await checkLimitsRes.json()
    if (!checkLimits.allowed) {
      return NextResponse.json({ 
        error: 'Lead limit reached. Upgrade to add more leads.',
        upgradeRequired: true 
      }, { status: 403 })
    }

    // Use RPC function for bulk upsert with proper conflict handling on unique index
    const { data: rpcResult, error: rpcError } = await supabase.rpc('upsert_leads_bulk', {
      p_team_id: teamId,
      p_leads: toInsert
    })

    if (rpcError) {
      return NextResponse.json({ 
        error: rpcError.message || 'Import failed',
        details: rpcError 
      }, { status: 400 })
    }

    const imported = rpcResult?.imported || 0
    return NextResponse.json({ imported })
  } catch (e: any) {
    return NextResponse.json({ 
      error: `Import error: ${e?.message || e}` 
    }, { status: 500 })
  }
}
