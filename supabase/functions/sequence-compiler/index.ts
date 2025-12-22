// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_KEY")!)

async function fetchDueEnrollments() {
  const { data, error } = await supabase
    .from("sequence_enrollments")
    .select("id, campaign_id, lead_id, current_step, next_run_at")
    .eq("status", "active")
    .lte("next_run_at", new Date().toISOString())
    .limit(200)
  if (error) throw error
  return data ?? []
}

async function fetchContext(campaignId: string, leadId: string) {
  const [{ data: campaign }, { data: lead }] = await Promise.all([
    supabase.from("campaigns").select("id, sequence_id, workspace_id").eq("id", campaignId).single(),
    supabase.from("leads").select("id, email, first_name, last_name, status, owner_id, provider").eq("id", leadId).single(),
  ])
  if (!campaign || !lead) throw new Error("Missing campaign/lead")

  const enrollData = await supabase.from("sequence_enrollments").select("current_step").eq("campaign_id", campaignId).eq("lead_id", leadId).single()
  const { data: step } = await supabase
    .from("sequence_steps")
    .select("*")
    .eq("sequence_id", campaign.sequence_id)
    .eq("order_index", enrollData.data?.current_step)
    .single()

  return { campaign, lead, step }
}

function shouldSkip(leadStatus: string, step: any, unsubscribed: boolean) {
  if (step.stop_if_replied && leadStatus === "Replied") return { skip: true, reason: "replied" }
  if (step.stop_if_bounced && leadStatus === "Bounced") return { skip: true, reason: "bounced" }
  if (step.stop_if_unsubscribed && unsubscribed) return { skip: true, reason: "unsubscribed" }
  return { skip: false, reason: "" }
}

serve(async () => {
  const due = await fetchDueEnrollments()
  if (due.length === 0) return new Response("No due enrollments", { status: 200 })

  for (const row of due) {
    try {
      const { campaign, lead, step } = await fetchContext(row.campaign_id, row.lead_id)
      if (!step) {
        await supabase.from("sequence_enrollments").update({ status: "completed", next_run_at: null }).eq("id", row.id)
        continue
      }

      const { data: unsub } = await supabase.from("unsubscribes").select("id").eq("lead_id", lead.id).maybeSingle()
      const gate = shouldSkip(lead.status, step, !!unsub)
      if (gate.skip) {
        await supabase.from("sequence_enrollments").update({ status: "stopped", next_run_at: null }).eq("id", row.id)
        continue
      }

      let senderAccountId = step.sender_account_id as string | null
      if (!senderAccountId) {
        const { data: acct } = await supabase
          .from("sender_accounts").select("id, provider, email").eq("user_id", lead.owner_id).eq("is_active", true).limit(1).single()
        if (!acct) throw new Error("No active sender account")
        senderAccountId = acct.id
      }
      const { data: acct } = await supabase.from("sender_accounts").select("provider, email").eq("id", senderAccountId).single()

      const values = { lead, campaign }
      const subject = step.subject_template || ""
      const html = step.body_html_template || null
      const text = step.body_text_template || null

      // Insert into email_jobs instead of send_queue
      await supabase.from("email_jobs").insert({
        workspace_id: campaign.workspace_id,
        user_id: lead.owner_id,
        lead_id: lead.id,
        campaign_id: campaign.id,
        from_email: acct!.email,
        to_email: lead.email,
        subject: subject,
        body_html: html || text,
        scheduled_for: new Date().toISOString(),
        status: "queued",
        provider: acct!.provider
      })
    } catch (e) {
      console.error("compile error", row.id, e)
      await supabase.from("sequence_enrollments").update({ status: "paused" }).eq("id", row.id)
    }
  }

  return new Response("Compile sweep done ✅", { status: 200 })
})