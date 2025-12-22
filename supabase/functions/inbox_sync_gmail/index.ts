// deno-lint-ignore-file no-explicit-any

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { gmailFetchBy, sbAdmin } from "../_shared/oauth.ts";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const accountId = url.searchParams.get("account_id");
    if (!accountId) {
      return new Response(JSON.stringify({ ok: false, error: "Missing account_id" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const query = "newer_than:1d";
    const response = await gmailFetchBy(
      { id: accountId },
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}`,
    );

    if (!response.ok) {
      return new Response(await response.text(), { status: response.status });
    }

    const json = await response.json();
    const ids: string[] = Array.isArray(json?.messages) ? json.messages.map((m: any) => m.id).filter(Boolean) : [];

    if (ids.length) {
      const sb = sbAdmin();
      const { error: enqueueError } = await sb.rpc("enqueue_provider_messages", {
        p_account: accountId,
        p_provider: "gmail",
        p_ids: ids,
      });
      if (enqueueError) {
        return new Response(JSON.stringify({ ok: false, error: enqueueError.message }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, enqueued: ids.length }), {
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});


