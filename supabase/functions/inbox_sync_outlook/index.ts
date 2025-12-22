// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { outlookFetchBy, sbAdmin } from "../_shared/oauth.ts";

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

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const filter = encodeURIComponent(`receivedDateTime ge ${since}`);
    const res = await outlookFetchBy(
      { id: accountId },
      `https://graph.microsoft.com/v1.0/me/messages?$top=50&$select=id&$orderby=receivedDateTime desc&$filter=${filter}`,
    );

    if (!res.ok) {
      return new Response(await res.text(), { status: res.status });
    }

    const json = await res.json();
    const ids: string[] = Array.isArray(json?.value) ? json.value.map((m: any) => m.id).filter(Boolean) : [];

    if (ids.length) {
      const sb = sbAdmin();
      const { error: enqueueError } = await sb.rpc("enqueue_provider_messages", {
        p_account: accountId,
        p_provider: "outlook",
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




