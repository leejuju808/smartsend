import { NextRequest, NextResponse } from 'next/server'
import { splitHost, makeSelector, generateDKIMPair, verifyToken, trackingTarget } from "@/lib/domains"
import { supabaseAdmin } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const { workspace_id, hostname } = await req.json()
    
    if (!workspace_id || !hostname) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 })
    }

    // (Optional) gate Pro plan — skip if not gating
    // const gate = await checkFeature(workspace_id, "custom_domains");
    // if (!gate.ok) return NextResponse.json(gate, { status: 402 });

    const { tracking_subdomain, root_domain } = splitHost(hostname)
    const selector = makeSelector()
    const { publicTxt, privatePem } = generateDKIMPair()
    const ownershipTxt = verifyToken()

    // Create domain
    const { data: domain, error } = await supabaseAdmin()
      .from("custom_domains")
      .insert({
        workspace_id, 
        hostname, 
        tracking_subdomain, 
        root_domain
      })
      .select("*")
      .single()
      
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Records: CNAME for tracking, TXT for ownership, TXT for DKIM
    const records = [
      {
        domain_id: domain.id,
        type: "CNAME",
        host: hostname,                        // send.acme.com
        value: trackingTarget() + ".",         // trk.smartsend.ai.
      },
      {
        domain_id: domain.id,
        type: "TXT",
        host: `smartsend-verify.${root_domain}`, // smartsend-verify.acme.com
        value: ownershipTxt
      },
      {
        domain_id: domain.id,
        type: "TXT",
        host: `${selector}._domainkey.${root_domain}`, // smartsend._domainkey.acme.com
        value: publicTxt
      }
    ]

    const { error: recErr } = await supabaseAdmin()
      .from("domain_dns_records")
      .insert(records)
      
    if (recErr) {
      return NextResponse.json({ error: recErr.message }, { status: 400 })
    }

    // Store private DKIM securely (KMS/Secrets). For demo, keep in DB (not recommended for prod).
    await supabaseAdmin()
      .from("custom_domains")
      .update({ /* dkim_private_key: privatePem */ })
      .eq("id", domain.id)

    return NextResponse.json({ ok: true, domain_id: domain.id })
  } catch (error: any) {
    console.error('Error creating domain:', error)
    return NextResponse.json({ error: error.message || 'Failed to create domain' }, { status: 500 })
  }
} 