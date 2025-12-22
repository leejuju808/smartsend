import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const EDGE_URL = Deno.env.get("SUPABASE_EDGE_URL") ||
  Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") + "/functions/v1";
const APP_URL = Deno.env.get("APP_URL") || Deno.env.get("NEXT_PUBLIC_BASE_URL") || "http://localhost:3000";

async function render(md: string, lead: any): Promise<string> {
  // Simple template render: replace {{var}} with lead properties
  return md.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = lead?.[key] || lead?.[key.toLowerCase()] || "";
    return String(value);
  });
}

serve(async () => {
  try {
    // 1) Lock a batch of due items
    const now = new Date().toISOString();
    const { data: due, error: dueError } = await supabase
      .from("followup_queue")
      .select(`
        id,
        org_id,
        enrollment_id,
        step_number,
        due_at,
        sequence_enrollments!inner (
          lead_id,
          sequence_id
        )
      `)
      .is("sent_at", null)
      .is("locked_at", null)
      .lte("due_at", now)
      .limit(25);

    if (dueError) {
      console.error("Error fetching due items:", dueError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch due items" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!due || due.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0 }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Lock items
    const lockIds = due.map((row: any) => row.id);
    await Promise.all(
      lockIds.map((id: string) =>
        supabase.from("followup_queue").update({ locked_at: now }).eq("id", id)
      )
    );

    // 2) Process each item
    for (const row of due) {
      try {
        const enrollment = (row as any).sequence_enrollments;

        if (!enrollment) {
          throw new Error("Missing enrollment data");
        }

        // Fetch lead separately
        const { data: lead, error: leadError } = await supabase
          .from("leads")
          .select("*")
          .eq("id", enrollment.lead_id)
          .maybeSingle();

        if (leadError || !lead) {
          throw new Error("Lead not found");
        }

        // Get step details
        const { data: step, error: stepError } = await supabase
          .from("sequence_steps")
          .select("*")
          .eq("sequence_id", enrollment.sequence_id)
          .eq("step_number", row.step_number)
          .maybeSingle();

        if (stepError || !step) {
          throw new Error("Step not found");
        }

        // Render templates
        const subject = await render(step.subject_template, lead);
        const body = await render(step.body_md, lead);

        // 3) Check daily cap before sending (simplified - check org_send_settings)
        const { data: settings } = await supabase
          .from("org_send_settings")
          .select("daily_cap")
          .eq("org_id", row.org_id)
          .maybeSingle();

        const dailyCap = settings?.daily_cap || 300;

        // Count sends today (simplified check)
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);
        const { count: todaySends } = await supabase
          .from("followup_queue")
          .select("*", { count: "exact", head: true })
          .eq("org_id", row.org_id)
          .gte("sent_at", todayStart.toISOString());

        if ((todaySends ?? 0) >= dailyCap) {
          throw new Error("Daily cap exceeded");
        }

        // 4) Get sender email from org (simplified - use first available connected account)
        // Get org owner's email as fallback
        const { data: orgData } = await supabase
          .from("organizations")
          .select("owner_id")
          .eq("id", row.org_id)
          .maybeSingle();

        let fromEmail = "noreply@smartsend.ai";
        
        if (orgData?.owner_id) {
          const { data: accountData } = await supabase
            .from("connected_accounts")
            .select("email")
            .eq("user_id", orgData.owner_id)
            .limit(1)
            .maybeSingle();
          if (accountData?.email) {
            fromEmail = accountData.email;
          }
        }

        // Send via existing send API
        const sendResponse = await fetch(`${APP_URL}/api/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId: lead.id,
            fromEmail,
            toEmail: lead.email,
            subject,
            text: body, // Convert markdown to plain text or keep as is
          }),
        });

        if (!sendResponse.ok) {
          const errorText = await sendResponse.text();
          throw new Error(`Send failed: ${errorText}`);
        }

        // 5) Mark sent
        await supabase
          .from("followup_queue")
          .update({ sent_at: new Date().toISOString() })
          .eq("id", row.id);

        // 6) Schedule next step if exists
        const { count: nextStepCount } = await supabase
          .from("sequence_steps")
          .select("*", { count: "exact", head: true })
          .eq("sequence_id", enrollment.sequence_id)
          .gt("step_number", row.step_number);

        if ((nextStepCount ?? 0) > 0) {
          // Get next step
          const { data: nextStep } = await supabase
            .from("sequence_steps")
            .select("*")
            .eq("sequence_id", enrollment.sequence_id)
            .eq("step_number", row.step_number + 1)
            .maybeSingle();

          if (nextStep) {
            // Compute next due time
            const dueResp = await fetch(`${EDGE_URL}/seq-next-due`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                org_id: row.org_id,
                base_from: now,
                wait_days: nextStep.wait_days,
              }),
            });

            if (dueResp.ok) {
              const dueData = await dueResp.json();

              // Queue next step
              await supabase.from("followup_queue").insert({
                org_id: row.org_id,
                enrollment_id: row.enrollment_id,
                step_number: row.step_number + 1,
                due_at: dueData.due_at,
              });

              // Update enrollment
              await supabase
                .from("sequence_enrollments")
                .update({
                  current_step: row.step_number,
                  last_sent_at: new Date().toISOString(),
                  next_due_at: dueData.due_at,
                })
                .eq("id", row.enrollment_id);
            }
          }
        } else {
          // Sequence completed
          await supabase
            .from("sequence_enrollments")
            .update({
              status: "completed",
              current_step: row.step_number,
              last_sent_at: new Date().toISOString(),
              next_due_at: null,
            })
            .eq("id", row.enrollment_id);
        }
      } catch (e: any) {
        // Mark error
        await supabase
          .from("followup_queue")
          .update({
            error: String(e),
            locked_at: null, // Unlock for retry
          })
          .eq("id", row.id);
        console.error(`Error processing queue item ${row.id}:`, e);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed: due.length }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

