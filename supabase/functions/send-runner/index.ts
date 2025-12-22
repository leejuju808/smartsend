// supabase/functions/send-runner/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const { campaignId } = await req.json();
  if (!campaignId) {
    return new Response("missing campaignId", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // 1) Load first batch of pending queue with lead bounce and unsubscribe status
  const { data: batch } = await supabase
    .from("send_queue")
    .select("*, leads(bounced, email, unsubscribed)")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .limit(100);

  if (!batch || batch.length === 0) {
    return new Response("No pending messages", { status: 200 });
  }

  // 2) Filter out bounced and unsubscribed leads and mark them as skipped
  const validRows: any[] = [];
  for (const row of batch) {
    // skip if lead is bounced
    if (row.leads?.bounced) {
      await supabase
        .from("send_queue")
        .update({ status: "skipped", skip_reason: "bounced" })
        .eq("id", row.id);
      continue;
    }
    // skip if lead is unsubscribed
    if (row.leads?.unsubscribed) {
      await supabase
        .from("send_queue")
        .update({ status: "skipped", skip_reason: "unsubscribed" })
        .eq("id", row.id);
      continue;
    }
    validRows.push(row);
  }

  if (validRows.length === 0) {
    return new Response("No valid messages after filtering bounces", { status: 200 });
  }

  // 3) Mark valid rows as sending
  const ids = validRows.map((b) => b.id);
  await supabase.from("send_queue").update({ status: "sending" }).in("id", ids);

  // 4) Push emails to your mail provider (MailerSend, Resend, SMTP etc.)
  // -- placeholder --
  for (const row of validRows) {
    console.log("send email to", row.lead_id);

    // After sending:
    await supabase
      .from("send_queue")
      .update({ status: "sent" })
      .eq("id", row.id);
  }

  // 4) Trigger next wave if more pending
  const { count } = await supabase
    .from("send_queue")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "pending");

  if (count && count > 0) {
    // Trigger next wave by calling this function again
    await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify({ campaignId }),
    });
  }

  return new Response("Wave processed", { status: 200 });
});
