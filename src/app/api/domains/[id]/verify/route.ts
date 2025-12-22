import { NextRequest, NextResponse } from 'next/server'
import dns from "dns/promises"
import { supabaseAdmin } from "@/lib/supabase/server"

export const runtime = "nodejs" // ensure Node for dns module

async function hasTxt(host: string, mustContain: string) {
  try {
    const sets = await dns.resolveTxt(host)
    return sets.some(arr => arr.join("").includes(mustContain))
  } catch { 
    return false 
  }
}

async function hasCname(host: string, target: string) {
  try {
    const cn = await dns.resolveCname(host)
    return cn.some(v => v.replace(/\.$/, "") === target.replace(/\.$/, "").toLowerCase())
  } catch { 
    return false 
  }
}

export async function POST(
  _: NextRequest, 
  { params }: { params: { id: string } }
) {
  try {
    // load domain + records
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
      .eq("domain_id", domain.id)
      
    let allOk = true

    for (const r of recs || []) {
      let ok = false
      if (r.type === "CNAME") {
        ok = await hasCname(r.host, r.value)
      }
      if (r.type === "TXT") {
        ok = await hasTxt(r.host, r.value)
      }
      
      await supabaseAdmin()
        .from("domain_dns_records")
        .update({ verified: ok })
        .eq("id", r.id)
        
      if (!ok && r.required) {
        allOk = false
      }
    }

    await supabaseAdmin()
      .from("custom_domains")
      .update({
        status: allOk ? "verified" : "pending",
        verified_at: allOk ? new Date().toISOString() : null
      })
      .eq("id", domain.id)

    return NextResponse.json({ ok: allOk })
  } catch (error: any) {
    console.error('Error verifying DNS:', error)
    return NextResponse.json({ error: error.message || 'Failed to verify DNS' }, { status: 500 })
  }
} 