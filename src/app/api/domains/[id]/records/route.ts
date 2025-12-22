import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from "@/lib/supabase/server"

export async function GET(
  _: NextRequest, 
  { params }: { params: { id: string } }
) {
  try {
    const { data: domain } = await supabaseAdmin()
      .from("custom_domains")
      .select("*")
      .eq("id", params.id)
      .single()
      
    if (!domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 })
    }
    
    const { data: recs } = await supabaseAdmin()
      .from("domain_dns_records")
      .select("*")
      .eq("domain_id", params.id)
      
    return NextResponse.json({ domain, records: recs || [] })
  } catch (error: any) {
    console.error('Error fetching records:', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch records' }, { status: 500 })
  }
} 