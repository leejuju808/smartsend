// supabase/functions/workforce_compliance_digest/index.ts
// Daily compliance digest that checks for expired/expiring certs and high-risk training

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // 1) Get expiring / expired certs
    const { data: certs, error: certError } = await supabase
      .from("workforce_certification_status")
      .select("*")
      .in("status", ["expired", "expiring_30", "expiring_7"]);

    if (certError) {
      console.error("certError", certError);
    }

    // 2) Get high-risk training
    const { data: training, error: trainingError } = await supabase
      .from("workforce_training_risk")
      .select("*")
      .eq("risk_level", "high");

    if (trainingError) {
      console.error("trainingError", trainingError);
    }

    // If nothing risky, just return
    if ((!certs || certs.length === 0) && (!training || training.length === 0)) {
      return new Response(
        JSON.stringify({ message: "No compliance issues today." }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build summary text (you can change to HTML/email template later)
    const certLines =
      certs?.map((c: any) => {
        const statusLabel = c.status === "expired" 
          ? "EXPIRED" 
          : c.status === "expiring_7"
          ? "EXPIRING IN 7 DAYS"
          : "EXPIRING IN 30 DAYS";
        
        return `- ${c.first_name} ${c.last_name} (${c.role || "N/A"}) – ${
          c.cert_name || "Unknown"
        } – ${statusLabel}${
          c.expiry_date ? ` (expires ${c.expiry_date})` : ""
        }`;
      }) ?? [];

    const trainingLines =
      training?.map((t: any) => {
        return `- ${t.first_name} ${t.last_name} (${t.role || "N/A"}) – ${t.completion_percent}% of required training completed (${t.completed_required}/${t.total_required})`;
      }) ?? [];

    const lines: string[] = [];
    lines.push("SmartSend Workforce Compliance Digest");
    lines.push("");
    lines.push(`Date: ${new Date().toLocaleDateString()}`);
    lines.push("");

    if (certLines.length) {
      lines.push("Certifications at risk:");
      lines.push(...certLines);
      lines.push("");
    }

    if (trainingLines.length) {
      lines.push("High-risk training (incomplete required modules):");
      lines.push(...trainingLines);
      lines.push("");
    }

    const digestText = lines.join("\n");

    // 3) Send digest somewhere (Slack/webhook/email)
    // For now we just log, but you should:
    // - call a Slack webhook
    // - OR call your Next.js API route that uses Resend/SendGrid
    console.log(digestText);

    // Example: POST to your own internal webhook (Next.js API route)
    const webhookUrl = Deno.env.get("COMPLIANCE_WEBHOOK_URL");
    if (webhookUrl) {
      try {
        const webhookRes = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            text: digestText,
            certs: certs || [],
            training: training || [],
            timestamp: new Date().toISOString()
          }),
        });

        if (!webhookRes.ok) {
          console.error("Webhook failed:", await webhookRes.text());
        }
      } catch (webhookError) {
        console.error("Webhook error:", webhookError);
      }
    }

    return new Response(
      JSON.stringify({ 
        message: "Digest processed",
        certs_count: certs?.length || 0,
        training_count: training?.length || 0,
        digest: digestText
      }), 
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    console.error("Error in compliance digest:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process compliance digest", details: String(error) }),
      { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
});
























