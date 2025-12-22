import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { email_id, sender, subject, snippet } = await req.json();

    if (!email_id) {
      return new Response(
        JSON.stringify({ success: false, error: "email_id is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Extract email from sender
    let senderEmail: string | null = null;
    if (sender) {
      const angleBracketMatch = sender.match(/<([^>]+)>/);
      if (angleBracketMatch) {
        senderEmail = angleBracketMatch[1].toLowerCase().trim();
      } else {
        const emailPatternMatch = sender.match(
          /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
        );
        if (emailPatternMatch) {
          senderEmail = emailPatternMatch[1].toLowerCase().trim();
        } else {
          senderEmail = sender.toLowerCase().trim();
        }
      }
    }

    // Check for unsubscribe intent
    function looksLikeUnsub(text: string) {
      const t = text.toLowerCase();
      return [
        "unsubscribe", "remove me", "stop emailing", "opt out", "do not contact",
        "take me off", "please remove", "no longer interested"
      ].some(p => t.includes(p));
    }

    const combinedText = ((subject || "") + " " + (snippet || "")).trim();
    const isUnsub = looksLikeUnsub(combinedText);

    if (isUnsub && senderEmail) {
      // Find lead to get project_id/org_id
      const { data: lead } = await supabase
        .from("leads")
        .select("id, project_id, org_id, workspace_id, email")
        .eq("email", senderEmail)
        .maybeSingle();

      if (lead) {
        const project_id = lead.project_id || lead.org_id || lead.workspace_id || null;
        
        if (project_id) {
          // Add to suppression as unsubscribe
          await supabase.from("suppress_list").upsert({
            project_id: project_id,
            org_id: lead.org_id || null,
            workspace_id: lead.workspace_id || null,
            email: senderEmail,
            reason: "Unsubscribe via reply",
            kind: "unsubscribe",
            source: "reply"
          }, { 
            onConflict: lead.org_id ? "org_id,email" : lead.workspace_id ? "workspace_id,email" : "project_id,email" 
          });

          // Cancel queued sends for this lead
          await supabase
            .from("send_queue")
            .update({ state: "Skipped" })
            .eq("lead_id", lead.id)
            .eq("state", "Queued");
        }
      }

      await supabase.from("reply_logs").insert({
        email_id,
        sender,
        subject,
        snippet,
        detected: false, // unsubscribe is not a reply
      });

      return new Response(JSON.stringify({ success: true, detected: false, unsubscribed: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // ✅ Basic AI-style keyword detection
    const isReply =
      (snippet?.toLowerCase().includes("thank") ||
        snippet?.toLowerCase().includes("interested") ||
        snippet?.toLowerCase().includes("let's") ||
        subject?.toLowerCase().startsWith("re:")) ?? false;

    await supabase.from("reply_logs").insert({
      email_id,
      sender,
      subject,
      snippet,
      detected: isReply,
    });

    if (isReply && senderEmail && senderEmail.includes("@")) {
      // Update lead status in the leads table
      await supabase
        .from("leads")
        .update({ status: "Replied" })
        .eq("email", senderEmail);
    }

    return new Response(JSON.stringify({ success: true, detected: isReply }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in detectReply:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
