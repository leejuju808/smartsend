// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

async function gmailSend(rawMimeB64Url: string, threadId: string | undefined, token: string) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(threadId ? { raw: rawMimeB64Url, threadId } : { raw: rawMimeB64Url }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function b64url(s: string) {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // pick up to N ready items respecting not_before
  const nowIso = new Date().toISOString();
  const { data: items } = await supabase
    .from("send_queue")
    .select("*")
    .eq("state", "Queued")
    .or(`not_before.is.null,not_before.lte.${nowIso}`)
    .order("priority", { ascending: false })
    .order("not_before", { ascending: true, nullsFirst: true })
    .limit(25);

  if (!items?.length) return new Response(JSON.stringify({ sent: 0 }));

  let sent = 0;
  for (const item of items) {
    // lock
    const lockTs = new Date().toISOString();
    await supabase.from("send_queue").update({
      state: "Locked",
      locked_at: lockTs,
      worker_id: "sendWorker"
    }).eq("id", item.id);

    try {
      const currentTime = new Date();
      // Re-check window alignment
      if (item.not_before) {
        const windowStart = new Date(item.not_before);
        if (currentTime < windowStart) {
          await supabase.from("send_queue").update({
            state: "Queued",
            locked_at: null,
            worker_id: null
          }).eq("id", item.id);
          continue;
        }

        const windowMissCutoff = new Date(windowStart.getTime() + 3 * 3600 * 1000);
        if (currentTime >= windowMissCutoff && item.lead_id) {
          const { data: nextSto } = await supabase.rpc("next_best_send_ts", {
            p_lead: item.lead_id
          });

          await supabase.from("send_queue").update({
            state: "Queued",
            not_before: nextSto ?? windowMissCutoff.toISOString(),
            locked_at: null,
            worker_id: null
          }).eq("id", item.id);

          continue;
        }
      }

      // enforce daily cap per campaign
      const { data: camp } = await supabase.from("campaigns").select("*").eq("id", item.campaign_id).single();
      if (!camp || camp.status === "Paused") {
        await supabase.from("send_queue").update({ 
          state: "Queued", 
          locked_at: null, 
          worker_id: null 
        }).eq("id", item.id);
        continue;
      }

      // Enforce plan limits: fetch owner user_id for this campaign
      const { data: ownerData } = await supabase.rpc("get_campaign_owner", { p_campaign_id: item.campaign_id });
      if (!ownerData) {
        console.error("Could not get campaign owner for campaign:", item.campaign_id);
        await supabase.from("send_queue").update({ 
          state: "Queued", 
          locked_at: null, 
          worker_id: null 
        }).eq("id", item.id);
        continue;
      }
      const ownerUserId = ownerData as string;

      // get usage + plan
      const { data: usage } = await supabase.rpc("get_user_usage", { p_user: ownerUserId });
      const { data: limits } = await supabase.from("plan_limits").select("*").eq("plan", usage?.plan || 'free').single();

      // Enforce daily/monthly caps
      if (usage && (usage.status !== 'active' && usage.status !== 'trialing')) {
        // pause campaign until active
        await supabase.from("campaigns").update({ status: "Paused" }).eq("id", item.campaign_id);
        await supabase.from("send_queue").update({ 
          state: "Queued", 
          not_before: new Date(Date.now() + 6*3600*1000).toISOString(), 
          locked_at: null, 
          worker_id: null 
        }).eq("id", item.id);
        continue;
      }

      if (usage && limits && (usage.daily >= limits.daily_sends || usage.monthly >= limits.monthly_sends)) {
        // push to next day if daily cap hit; or to next month if monthly cap hit
        const delayMs = usage.daily >= limits.daily_sends
          ? (24*3600*1000)  // 1 day
          : (7*24*3600*1000); // soft push a week; adjust as you like
        await supabase.from("send_queue").update({
          state: "Queued",
          not_before: new Date(Date.now() + delayMs).toISOString(),
          locked_at: null, 
          worker_id: null
        }).eq("id", item.id);
        continue;
      }

      // count sent today for campaign
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count: sentToday } = await supabase
        .from("campaign_leads")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", item.campaign_id)
        .not("sent_at", "is", null)
        .gte("sent_at", todayStart.toISOString());

      if (camp.daily_cap && (sentToday || 0) >= camp.daily_cap) {
        // delay until tomorrow 08:00 local (approx: add 24h)
        const tmr = new Date(Date.now() + 24 * 3600 * 1000);
        tmr.setHours(8, 0, 0, 0);
        await supabase.from("send_queue").update({ 
          state: "Queued", 
          not_before: tmr.toISOString(), 
          locked_at: null, 
          worker_id: null 
        }).eq("id", item.id);
        continue;
      }

      // get user token (owner of campaign) — assume campaigns has workspace_id → workspace_members(user_id) → email_accounts
      const { data: tokenData, error: tokenErr } = await supabase
        .rpc("get_campaign_owner_token", { p_campaign_id: item.campaign_id });
      
      if (tokenErr || !tokenData || tokenData.error) {
        throw new Error(tokenData?.error || tokenErr?.message || "Missing Gmail token");
      }

      const token = tokenData.access_token as string | undefined;
      if (!token) throw new Error("Missing Gmail token");

      // Simple template renderer for footer (supports {{key}} and {{key|default}})
      function render(tpl: string, vars: Record<string, any>): string {
        return tpl.replace(/\{\{\s*([\w.]+)(?:\|([^}]+))?\s*\}\}/g, (_m, key: string, fallback?: string) => {
          const parts = key.split(".");
          let val: any = vars;
          for (const p of parts) {
            if (val && typeof val === "object" && p in val) val = val[p];
            else val = undefined;
          }
          return val != null ? String(val) : (fallback || "");
        });
      }

      // Get lead info for footer template variables
      let leadData: any = null;
      if (item.lead_id) {
        const { data: lead } = await supabase
          .from("leads")
          .select("first_name, last_name, company, email, title, custom")
          .eq("id", item.lead_id)
          .maybeSingle();
        leadData = lead || {};
      }

      // Build template variables
      const varsObj = {
        first_name: leadData?.first_name || "",
        last_name: leadData?.last_name || "",
        company: leadData?.company || "",
        email: leadData?.email || item.to_email || "",
        title: leadData?.title || "",
        ...(leadData?.custom || {})
      };

      // Block 15200: Check if current step has A/B testing enabled
      let abVariant: string | null = item.ab_variant || null;
      let finalSubject = item.subject || "";
      
      if (item.step_no) {
        // Get step to check A/B testing
        const { data: currentStep } = await supabase
          .from("campaign_steps")
          .select("ab_test_enabled, ab_test_winner, subject_variant_a, subject_variant_b, subject_template")
          .eq("campaign_id", item.campaign_id)
          .eq("step_no", item.step_no)
          .maybeSingle();
        
        if (currentStep?.ab_test_enabled) {
          // If winner is determined, use winner variant
          if (currentStep.ab_test_winner === "A" || currentStep.ab_test_winner === "B") {
            abVariant = currentStep.ab_test_winner;
            const subjectTemplate = abVariant === "A" 
              ? (currentStep.subject_variant_a || currentStep.subject_template || "")
              : (currentStep.subject_variant_b || currentStep.subject_template || "");
            finalSubject = render(subjectTemplate, varsObj);
          } else if (!abVariant) {
            // No winner yet and no variant set - do 50/50 split
            const useVariantA = Math.random() < 0.5;
            abVariant = useVariantA ? "A" : "B";
            const subjectTemplate = useVariantA
              ? (currentStep.subject_variant_a || currentStep.subject_template || "")
              : (currentStep.subject_variant_b || currentStep.subject_template || "");
            finalSubject = render(subjectTemplate, varsObj);
            
            // Update queue item with variant
            await supabase.from("send_queue")
              .update({ ab_variant: abVariant })
              .eq("id", item.id);
          } else {
            // Variant already set, render the appropriate template
            const subjectTemplate = abVariant === "A"
              ? (currentStep.subject_variant_a || currentStep.subject_template || "")
              : (currentStep.subject_variant_b || currentStep.subject_template || "");
            finalSubject = render(subjectTemplate, varsObj);
          }
        }
      }

      // Compose final body with footer if enabled
      let bodyFinal = item.body || item.body_html || "";
      if (camp.add_footer && camp.footer_text) {
        const footerText = render(camp.footer_text, varsObj);
        bodyFinal = `${bodyFinal}\n\n${footerText}`;
      }

      // Get base URL for tracking
      const trackBase = Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("PUBLIC_BASE_URL") || Deno.env.get("NEXT_PUBLIC_APP_URL") || "https://smartsendhq.com";

      // Convert to HTML if plain text (simple conversion)
      let htmlBody = bodyFinal;
      if (!htmlBody.includes("<") && !htmlBody.includes(">")) {
        // Plain text - convert to HTML
        htmlBody = htmlBody
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br/>");
      }

      // Block 165: Add open tracking pixel with HMAC signature
      const campaignId = item.campaign_id;
      const leadId = item.lead_id;
      
      if (campaignId && leadId) {
        // Generate HMAC signature for tracking
        const unsubSecret = Deno.env.get("UNSUB_SECRET") || Deno.env.get("SMARTSEND_UNSUB_SECRET") || "";
        if (unsubSecret) {
          const base = `${leadId}.${campaignId}`;
          const encoder = new TextEncoder();
          const keyData = encoder.encode(unsubSecret);
          const messageData = encoder.encode(base);
          const cryptoKey = await crypto.subtle.importKey(
            "raw",
            keyData,
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"]
          );
          const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
          const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
          
          const openPixel = `<img src="${trackBase}/track/open?c=${campaignId}&l=${leadId}&sig=${encodeURIComponent(sigB64)}" width="1" height="1" style="display:none" alt="" />`;

          // Replace links with tracked redirector (Block 165 format)
          const bodyTracked = htmlBody.replace(
            /href=["'](https?:\/\/[^"']+)["']/gi,
            (_match: string, url: string) => {
              const trackedUrl = `${trackBase}/track/click?u=${encodeURIComponent(url)}&c=${campaignId}&l=${leadId}&sig=${encodeURIComponent(sigB64)}`;
              return `href="${trackedUrl}"`;
            }
          );
          
          htmlBody = bodyTracked;
          
          // Add pixel before </body> or append
          if (htmlBody.includes("</body>")) {
            htmlBody = htmlBody.replace("</body>", `${openPixel}</body>`);
          } else {
            htmlBody = htmlBody + openPixel;
          }
        } else {
          // Fallback to legacy tracking if secret not available
          const openPixel = `<img src="${trackBase}/api/track/open?cid=${campaignId}&lid=${leadId}" width="1" height="1" style="display:none" alt="" />`;
          htmlBody = htmlBody + "\n" + openPixel;
        }
      }

      // Also handle plain URLs in text (not in href attributes) - only if not using Block 165 tracking
      let finalHtmlBody = htmlBody;
      if (!campaignId || !leadId || !Deno.env.get("UNSUB_SECRET")) {
        const fallbackPixel = `<img src="${trackBase}/api/track/open?cid=${campaignId}&lid=${leadId}" width="1" height="1" style="display:none" alt="" />`;
        const bodyWithTrackedLinks = htmlBody.replace(
          /(https?:\/\/[^\s<"')]+)/gi,
          (url: string) => {
            // Skip if already in an href
            if (htmlBody.includes(`href="${url}"`) || htmlBody.includes(`href='${url}'`)) {
              return url;
            }
            return `<a href="${trackBase}/api/track/click?cid=${campaignId}&lid=${leadId}&t=${encodeURIComponent(url)}">${url}</a>`;
          }
        );
        finalHtmlBody = `${bodyWithTrackedLinks}${fallbackPixel}`;
      }

      // Generate plain text fallback
      const textFallback = finalHtmlBody
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();

      // compose MIME with multipart/alternative
      const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const mime = [
        `To: ${item.to_email}`,
        `Subject: ${finalSubject}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        ``,
        `--${boundary}`,
        `Content-Type: text/plain; charset="UTF-8"`,
        `Content-Transfer-Encoding: 7bit`,
        ``,
        textFallback,
        ``,
        `--${boundary}`,
        `Content-Type: text/html; charset="UTF-8"`,
        `Content-Transfer-Encoding: 7bit`,
        ``,
        finalHtmlBody,
        ``,
        `--${boundary}--`
      ].join("\n");
      const raw = b64url(mime);

      const resp = await gmailSend(raw, undefined, token);

      // Block 15200: Record ab_variant in email_messages if table exists
      if (abVariant && item.step_no) {
        // Try to insert/update email_messages with ab_variant
        const { data: existingMessage } = await supabase
          .from("email_messages")
          .select("id")
          .eq("campaign_id", item.campaign_id)
          .eq("lead_id", item.lead_id)
          .eq("step_id", item.step_no)
          .maybeSingle();
        
        if (existingMessage) {
          await supabase.from("email_messages")
            .update({ ab_variant: abVariant })
            .eq("id", existingMessage.id);
        } else {
          // Try to insert if table structure supports it
          await supabase.from("email_messages")
            .insert({
              campaign_id: item.campaign_id,
              lead_id: item.lead_id,
              step_id: item.step_no,
              ab_variant: abVariant,
              subject: finalSubject,
              direction: "outbound"
            })
            .catch(() => {
              // Ignore if table doesn't exist or columns don't match
            });
        }
      }

      // mark done
      await supabase.from("send_queue").update({ 
        state: "Done", 
        updated_at: new Date().toISOString() 
      }).eq("id", item.id);
      
      // Get current step from campaign_leads
      const { data: cl } = await supabase
        .from("campaign_leads")
        .select("campaign_id, lead_id, current_step")
        .eq("campaign_id", item.campaign_id)
        .eq("lead_id", item.lead_id)
        .single();
      
      const currentStep = cl?.current_step ?? 1;
      
      await supabase.from("campaign_leads")
        .update({ 
          state: "Sent", 
          sent_at: new Date().toISOString(), 
          sent_message_id: resp.id,
          last_step_sent_at: new Date().toISOString()
        })
        .eq("campaign_id", item.campaign_id)
        .eq("lead_id", item.lead_id);
      
      // Update leads table if it has the required columns (optional - may not exist)
      const { error: leadsUpdateErr } = await supabase.from("leads")
        .update({ 
          status: "Sent", 
          email_id: resp.id, 
          last_message_snippet: (item.body || "").slice(0, 140) 
        })
        .eq("id", item.lead_id);
      
      // Ignore errors if columns don't exist - this is optional
      if (leadsUpdateErr) {
        console.log("Note: Could not update leads table:", leadsUpdateErr.message);
      }

      // Auto-schedule next step if it exists
      const nextStepNo = currentStep + 1;
      const { data: stepRows } = await supabase
        .from("campaign_steps")
        .select("*")
        .eq("campaign_id", item.campaign_id)
        .eq("active", true)
        .order("step_no", { ascending: true });
      
      const next = stepRows?.find((s: any) => s.step_no === nextStepNo);
      
      if (next) {
        // Fetch lead data for template rendering
        const { data: leadRow } = await supabase
          .from("leads")
          .select("email, name, company, first_name, last_name")
          .eq("id", item.lead_id)
          .single();
        
        // Build vars object for template rendering
        const varsObj = {
          name: leadRow?.name || leadRow?.first_name || "",
          company: leadRow?.company || "",
          email: leadRow?.email || item.to_email || "",
          first_name: leadRow?.first_name || "",
          last_name: leadRow?.last_name || ""
        };
        
        // Block 15200: A/B Subject Line Testing
        let subjectTemplate = next.subject_template || "";
        let abVariant: string | null = null;
        
        if (next.ab_test_enabled) {
          // If winner is determined, use winner variant
          if (next.ab_test_winner === "A" || next.ab_test_winner === "B") {
            abVariant = next.ab_test_winner;
            subjectTemplate = abVariant === "A" 
              ? (next.subject_variant_a || next.subject_template || "")
              : (next.subject_variant_b || next.subject_template || "");
          } else {
            // No winner yet - do 50/50 split
            const useVariantA = Math.random() < 0.5;
            abVariant = useVariantA ? "A" : "B";
            subjectTemplate = useVariantA
              ? (next.subject_variant_a || next.subject_template || "")
              : (next.subject_variant_b || next.subject_template || "");
          }
        }
        
        // Render templates
        const subject = render(subjectTemplate, varsObj);
        const body = render(next.body_template, varsObj);
        
        const delayMs = (next.delay_days ?? 0) * 24 * 3600 * 1000;
        const notBefore = new Date(Date.now() + delayMs).toISOString();
        
        // Insert next step into queue (tentative - will be cancelled if reply arrives)
        await supabase.from("send_queue").insert({
          campaign_id: item.campaign_id,
          lead_id: item.lead_id,
          to_email: varsObj.email,
          subject: subject,
          body: body,
          body_html: body,
          provider: item.provider || "gmail",
          priority: 100,
          not_before: notBefore,
          state: "Queued",
          step_no: nextStepNo,
          ab_variant: abVariant // Block 15200: Track which variant
        });
        
        // Update campaign_leads to track next step
        await supabase.from("campaign_leads")
          .update({ 
            current_step: nextStepNo,
            last_step_sent_at: new Date().toISOString()
          })
          .eq("campaign_id", item.campaign_id)
          .eq("lead_id", item.lead_id);
      }

      sent++;

      // throttle per rate_per_min
      if (camp.rate_per_min && camp.rate_per_min > 0) {
        await new Promise(r => setTimeout(r, Math.ceil(60000 / camp.rate_per_min)));
      }
    } catch (err: any) {
      const attempts = (item.attempts ?? 0) + 1;
      const failState = attempts >= (item.max_attempts ?? 3) ? "Error" : "Queued";
      const delay = Math.min(30, attempts * 5); // backoff seconds
      await supabase.from("send_queue").update({
        state: failState,
        attempts,
        error: String(err?.message || err),
        not_before: new Date(Date.now() + delay * 1000).toISOString(),
        locked_at: null,
        worker_id: null
      }).eq("id", item.id);

      if (failState === "Error") {
        await supabase.from("campaign_leads").update({ 
          state: "Error", 
          last_error: String(err?.message || err) 
        })
          .eq("campaign_id", item.campaign_id)
          .eq("lead_id", item.lead_id);
      }
    }
  }

  return new Response(JSON.stringify({ sent }), { headers: { "Content-Type": "application/json" } });
});
