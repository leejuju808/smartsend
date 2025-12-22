import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN")!;
const phoneId = Deno.env.get("WHATSAPP_PHONE_ID")!;

Deno.serve(async (req) => {
  const { lead_id, body } = await req.json();

  const { data: lead } = await supabase
    .from("leads")
    .select("phone, org_id")
    .eq("id", lead_id)
    .single();

  if (!lead?.phone) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing phone" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const res = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: lead.phone,
      type: "text",
      text: { body },
    }),
  });

  const ok = res.ok;
  const responseData = await res.json().catch(() => ({}));

  await supabase.from("channel_messages").insert({
    org_id: lead.org_id,
    lead_id,
    channel: "whatsapp",
    direction: "outbound",
    body,
    status: ok ? "delivered" : "failed",
    metadata: responseData,
  });

  // Track usage: Get user_id from org_id (use first org owner or member)
  if (ok && lead.org_id) {
    try {
      const { data: orgMember } = await supabase
        .from("org_members")
        .select("user_id")
        .eq("org_id", lead.org_id)
        .eq("role", "owner")
        .limit(1)
        .maybeSingle();
      
      // Fallback to any member if no owner found
      if (!orgMember) {
        const { data: anyMember } = await supabase
          .from("org_members")
          .select("user_id")
          .eq("org_id", lead.org_id)
          .limit(1)
          .maybeSingle();
        
        if (anyMember?.user_id) {
          await supabase.rpc("increment_usage", {
            p_user_id: anyMember.user_id,
            p_metric: "whatsapp_msgs"
          });
        }
      } else if (orgMember.user_id) {
        await supabase.rpc("increment_usage", {
          p_user_id: orgMember.user_id,
          p_metric: "whatsapp_msgs"
        });
      }
    } catch (error) {
      console.warn("Failed to track WhatsApp usage:", error);
    }
  }

  return new Response(
    JSON.stringify({ ok }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});

