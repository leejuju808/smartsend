import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAIL_API_KEY = Deno.env.get("MAIL_API_KEY")!;
const APP_URL = Deno.env.get("APP_URL")!;

type InvitePayload = {
  campaign_id?: string;
  email?: string;
  role?: "viewer" | "editor" | "owner";
};

async function sendMail(email: string, role: string, acceptUrl: string) {
  const body = {
    from: "SmartSend <invites@smartsendhq.com>",
    to: [email],
    subject: "You’ve been invited to a SmartSend campaign",
    text: `You've been invited to collaborate on a SmartSend campaign.
Role: ${role}
Accept your invite: ${acceptUrl}

This link expires in 7 days.`,
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MAIL_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Mail send failed: ${await res.text()}`);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const payload = (await req.json()) as InvitePayload;
    const { campaign_id, email, role = "viewer" } = payload;

    if (!campaign_id || !email) {
      return new Response("Missing params", { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: token, error: inviteError } = await supabase.rpc("create_campaign_invite", {
      p_campaign: campaign_id,
      p_email: email,
      p_role: role,
    });

    if (inviteError) {
      throw new Error(inviteError.message);
    }

    const acceptUrl = `${APP_URL}/accept-invite?token=${encodeURIComponent(token as string)}`;

    await sendMail(email, role, acceptUrl);

    const { data: campaign } = await supabase.from("campaigns").select("id").eq("id", campaign_id).single();
    if (campaign) {
      await supabase.rpc("log_event", {
        p_campaign: campaign_id,
        p_thread: null,
        p_lead: null,
        p_user: null,
        p_kind: "invite_sent",
        p_note: email,
        p_meta: { role },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal Error";
    console.error("campaign-invite-send error", err);
    return new Response(message, { status: 500 });
  }
});





