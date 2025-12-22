// Block 252500 — Subcontractor Compliance Expiration Alerts
// Daily edge function to check for expired/expiring subcontractor documents
// Sends alerts to project managers when COIs, licenses, or other docs expire

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get all expiring documents (within next 30 days) and expired documents
    const today = new Date().toISOString().split("T")[0]
    const thirtyDaysFromNow = new Date()
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
    const thirtyDaysFromNowStr = thirtyDaysFromNow.toISOString().split("T")[0]

    // Get expiring documents
    const { data: expiringDocs, error: expiringError } = await supabase
      .from("subcontractor_documents")
      .select(
        `
        *,
        subcontractors:sub_id (
          id,
          name,
          company_id,
          roofing_companies:company_id (
            id,
            name,
            owner_id
          )
        )
      `
      )
      .not("expires_at", "is", null)
      .lte("expires_at", thirtyDaysFromNowStr)
      .gte("expires_at", today)
      .order("expires_at", { ascending: true })

    if (expiringError) {
      console.error("Error fetching expiring documents:", expiringError)
      throw expiringError
    }

    // Get expired documents
    const { data: expiredDocs, error: expiredError } = await supabase
      .from("subcontractor_documents")
      .select(
        `
        *,
        subcontractors:sub_id (
          id,
          name,
          company_id,
          roofing_companies:company_id (
            id,
            name,
            owner_id
          )
        )
      `
      )
      .not("expires_at", "is", null)
      .lt("expires_at", today)
      .order("expires_at", { ascending: true })

    if (expiredError) {
      console.error("Error fetching expired documents:", expiredError)
      throw expiredError
    }

    // Group by company and send alerts
    const alertsByCompany: Record<
      string,
      {
        companyName: string
        ownerId: string
        expiring: Array<{
          subName: string
          docType: string
          expiresAt: string
          daysUntil: number
        }>
        expired: Array<{
          subName: string
          docType: string
          expiresAt: string
          daysOverdue: number
        }>
      }
    > = {}

    // Process expiring documents
    if (expiringDocs) {
      for (const doc of expiringDocs) {
        const sub = doc.subcontractors
        if (!sub || !sub.roofing_companies) continue

        const companyId = sub.company_id
        const company = sub.roofing_companies
        const expiresAt = new Date(doc.expires_at!)
        const todayDate = new Date(today)
        const daysUntil = Math.ceil(
          (expiresAt.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)
        )

        if (!alertsByCompany[companyId]) {
          alertsByCompany[companyId] = {
            companyName: company.name,
            ownerId: company.owner_id,
            expiring: [],
            expired: [],
          }
        }

        alertsByCompany[companyId].expiring.push({
          subName: sub.name,
          docType: doc.doc_type,
          expiresAt: doc.expires_at!,
          daysUntil,
        })
      }
    }

    // Process expired documents
    if (expiredDocs) {
      for (const doc of expiredDocs) {
        const sub = doc.subcontractors
        if (!sub || !sub.roofing_companies) continue

        const companyId = sub.company_id
        const company = sub.roofing_companies
        const expiresAt = new Date(doc.expires_at!)
        const todayDate = new Date(today)
        const daysOverdue = Math.ceil(
          (todayDate.getTime() - expiresAt.getTime()) / (1000 * 60 * 60 * 24)
        )

        if (!alertsByCompany[companyId]) {
          alertsByCompany[companyId] = {
            companyName: company.name,
            ownerId: company.owner_id,
            expiring: [],
            expired: [],
          }
        }

        alertsByCompany[companyId].expired.push({
          subName: sub.name,
          docType: doc.doc_type,
          expiresAt: doc.expires_at!,
          daysOverdue,
        })
      }
    }

    // Send alerts for each company
    const results = []
    for (const [companyId, alertData] of Object.entries(alertsByCompany)) {
      // Skip if no alerts
      if (alertData.expiring.length === 0 && alertData.expired.length === 0) {
        continue
      }

      // Get project managers for this company
      const { data: pmUsers } = await supabase
        .from("roofing_company_members")
        .select("user_id, auth.users:user_id (email)")
        .eq("roofing_company_id", companyId)
        .eq("is_active", true)
        .in("role", ["owner", "admin", "ops"])

      const recipients = pmUsers?.map((m: any) => m.auth?.users?.email).filter(Boolean) || []

      // If no PMs found, use owner email
      if (recipients.length === 0) {
        const { data: owner } = await supabase
          .from("auth.users")
          .select("email")
          .eq("id", alertData.ownerId)
          .single()

        if (owner?.email) {
          recipients.push(owner.email)
        }
      }

      // Build email content
      let emailSubject = "⚠️ Subcontractor Compliance Alert"
      let emailBody = `Subcontractor Compliance Alert for ${alertData.companyName}\n\n`

      if (alertData.expired.length > 0) {
        emailBody += "🚨 EXPIRED DOCUMENTS:\n"
        for (const expired of alertData.expired) {
          emailBody += `\n• ${expired.subName} — ${expired.docType} expired ${expired.daysOverdue} days ago (${expired.expiresAt})\n`
          emailBody += `  ⚠️ BLOCKED from new job assignments until updated.\n`
        }
        emailBody += "\n"
      }

      if (alertData.expiring.length > 0) {
        emailBody += "⚠️ EXPIRING DOCUMENTS (within 30 days):\n"
        for (const expiring of alertData.expiring) {
          emailBody += `\n• ${expiring.subName} — ${expiring.docType} expires in ${expiring.daysUntil} days (${expiring.expiresAt})\n`
        }
        emailBody += "\n"
      }

      emailBody +=
        "\nPlease update these documents in SmartSend to ensure compliance and avoid assignment blocks.\n\n"
      emailBody += "View in SmartSend: https://app.smartsend.ai/workforce/subs\n"

      // TODO: Send email via your email service (Resend, SendGrid, etc.)
      // For now, we'll log it
      console.log(`Sending alert to ${recipients.join(", ")}`)
      console.log(`Subject: ${emailSubject}`)
      console.log(`Body:\n${emailBody}`)

      // Update sub status to pending_docs if they have expired critical docs
      if (alertData.expired.length > 0) {
        const subsWithExpiredCriticalDocs = new Set<string>()
        for (const expired of alertData.expired) {
          if (expired.docType === "COI" || expired.docType === "License") {
            // Find the sub ID
            const expiredDoc = expiredDocs?.find(
              (d) =>
                d.subcontractors?.name === expired.subName &&
                d.doc_type === expired.docType
            )
            if (expiredDoc) {
              subsWithExpiredCriticalDocs.add(expiredDoc.sub_id)
            }
          }
        }

        // Update status to pending_docs
        for (const subId of subsWithExpiredCriticalDocs) {
          await supabase
            .from("subcontractors")
            .update({ status: "pending_docs" })
            .eq("id", subId)
        }
      }

      results.push({
        companyId,
        companyName: alertData.companyName,
        recipients,
        expiredCount: alertData.expired.length,
        expiringCount: alertData.expiring.length,
      })
    }

    return new Response(
      JSON.stringify({
        success: true,
        companiesChecked: Object.keys(alertsByCompany).length,
        alertsSent: results.length,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    )
  } catch (error) {
    console.error("Error in sub-compliance-alerts:", error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    )
  }
})
























