import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { outlookFetchBy } from "../_shared/oauth.ts";

Deno.serve(async (req) => {
  try {
    const { account_id, to, subject, html } = await req.json();
    if (!account_id || !to || !html) {
      return new Response(JSON.stringify({ ok: false, error: "Missing required fields" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const payload = {
      message: {
        subject: subject ?? "",
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: true,
    };

    const response = await outlookFetchBy(
      { id: account_id },
      "https://graph.microsoft.com/v1.0/me/sendMail",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      return new Response(await response.text(), { status: response.status });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});




