// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

/** Minimal mustache-ish renderer with filters: |lower |upper |title |fallback:"x" */
function render(template: string, ctx: Record<string, any>): string {
  if (!template) return "";
  return template.replace(/\{\{\s*([^\}|]+)(\|[^\}]+)?\s*\}\}/g, (_, path: string, pipes: string) => {
    const val = get(ctx, path.trim());
    let out = val == null ? "" : String(val);
    if (pipes) {
      for (const raw of pipes.split("|").slice(1)) {
        const p = raw.trim();
        if (p === "lower") out = out.toLowerCase();
        else if (p === "upper") out = out.toUpperCase();
        else if (p === "title") out = out.replace(/\b\w/g, c => c.toUpperCase());
        else if (p.startsWith("fallback:")) {
          // Support both fallback:"text" and fallback:text
          const m = p.match(/fallback:\s*(?:"([^"]*)"|([^"]+))/);
          if (m) {
            const fallbackValue = m[1] || m[2];
            if (fallbackValue && (!out || out.trim() === "")) out = fallbackValue;
          }
        }
      }
    }
    return out;
  });
}

function get(obj: any, path: string): any {
  return path.split(".").reduce((acc, k) => (acc && k in acc ? acc[k] : undefined), obj);
}

function b64url(data: string) {
  return btoa(unescape(encodeURIComponent(data))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

async function ensureTrackingToken(campaign_id: string, lead_id: string, step_no: number, url: string) {
  // token derived from a stable hash; fallback to random
  const token = b64url(`${campaign_id}.${lead_id}.${step_no}.${url}`).slice(0, 32);
  // upsert by unique token
  await supabase.from("tracking_links").upsert({
    token, campaign_id, lead_id, step_no, dest_url: url
  }, { onConflict: "token" });
  return token;
}

async function rewriteLinks(html: string, campaign_id: string, lead_id: string, step_no: number) {
  if (!html) return html;
  const hrefRe = /href\s*=\s*"(.*?)"/gi;
  const parts: Array<string | Promise<string>> = [];
  let lastIndex = 0;
  for (const m of html.matchAll(hrefRe)) {
    const url = m[1];
    const start = m.index ?? 0;
    parts.push(html.slice(lastIndex, start));
    parts.push((async () => {
      try {
        const token = await ensureTrackingToken(campaign_id, lead_id, step_no, url);
        const redirect = `${Deno.env.get("SUPABASE_URL")}/functions/v1/tracking/t/r?u=${encodeURIComponent(token)}`;
        return `href="${redirect}"`;
      } catch {
        return `href="${url}"`;
      }
    })());
    lastIndex = start + m[0].length;
  }
  parts.push(html.slice(lastIndex));
  const resolved = await Promise.all(parts.map(p => p instanceof Promise ? p : Promise.resolve(p)));
  return resolved.join("");
}

Deno.serve(async (req) => {
  try {
    const { campaign_id, lead_id, step_no } = await req.json();
    if (!campaign_id || !lead_id || !step_no) {
      return new Response(
        JSON.stringify({ error: "campaign_id, lead_id, step_no required" }), 
        { status: 400, headers: { "content-type":"application/json" } }
      );
    }

    const [{ data: step }, { data: ctx }, { data: lead }] = await Promise.all([
      supabase.from("campaign_steps")
        .select("subject_template, body_html_template")
        .eq("campaign_id", campaign_id)
        .eq("step_no", step_no)
        .eq("enabled", true)
        .maybeSingle(),
      supabase.rpc("render_context", { p_campaign: campaign_id, p_lead: lead_id }),
      supabase.from("leads").select("unsubscribe_token").eq("id", lead_id).maybeSingle()
    ]);

    if (!step) throw new Error("step not found or disabled");
    const context = ctx ?? {};
    const subject = render(step.subject_template ?? "", context);
    
    // Get or ensure unsubscribe token
    let unsubToken = lead?.unsubscribe_token;
    if (!unsubToken) {
      const { data: tokenData } = await supabase.rpc("ensure_unsub_token", { p_lead: lead_id });
      unsubToken = tokenData || lead?.unsubscribe_token;
    }
    const unsubUrl = unsubToken 
      ? `${Deno.env.get("SUPABASE_URL")}/functions/v1/unsubscribe/u/${unsubToken}`
      : '#';
    
    let body_html = [
      render(step.body_html_template ?? "", context),
      `<p style="color:#888;font-size:12px;margin-top:24px;">`,
      `If you'd rather not hear from me again, <a href="${unsubUrl}">unsubscribe</a>.`,
      `</p>`,
      `<img src="${Deno.env.get("SUPABASE_URL")}/functions/v1/tracking/t/pixel?lead=${lead_id}&c=${campaign_id}&s=${step_no}" width="1" height="1" style="display:none;" alt="">`
    ].join("");

    body_html = await rewriteLinks(body_html, campaign_id, lead_id, step_no);

    return new Response(
      JSON.stringify({ ok: true, subject, body_html }), 
      { headers: { "content-type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }), 
      { status: 500, headers: { "content-type":"application/json" } }
    );
  }
});

