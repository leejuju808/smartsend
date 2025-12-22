// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sign } from "../_lib/tokens.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth:{persistSession:false} });
const APP_URL = Deno.env.get("APP_PUBLIC_URL")!;
const UNSUBSCRIBE_SECRET = Deno.env.get("UNSUBSCRIBE_SECRET")!;

type Bag = Record<string, any>;

function applyFilter(val: string, f: string) {
  if (val == null) return val;
  switch (f) {
    case "lower": return String(val).toLowerCase();
    case "upper": return String(val).toUpperCase();
    case "title": return String(val).replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
    case "capitalize": return String(val).charAt(0).toUpperCase() + String(val).slice(1);
    case "trim": return String(val).trim();
    default: return val;
  }
}

/**
 * Syntax supported:
 *  {{ first_name }}
 *  {{ company | upper }}
 *  {{ title || 'your role' }}
 *  {{ city || state || 'your area' }}
 * Filters chain: {{ first_name | capitalize | trim }}
 */
function renderString(tpl: string, bag: Bag) {
  const re = /\{\{\s*([^}]+)\s*\}\}/g;
  return tpl.replace(re, (_m, expr) => {
    // split fallbacks: a || b || 'Default'
    const parts = expr.split("||").map(s => s.trim());
    let chosen: any = "";
    for (const p of parts) {
      // handle filters: key | filter | filter2
      const [left, ...filters] = p.split("|").map(s => s.trim());
      let val: any;
      if ((left.startsWith("'") && left.endsWith("'")) || (left.startsWith('"') && left.endsWith('"'))) {
        val = left.slice(1, -1);
      } else {
        // nested path a.b.c allowed
        const path = left.split(".");
        let v:any = bag;
        for (const k of path) v = v?.[k];
        val = v ?? "";
      }
      for (const f of filters) val = applyFilter(val, f);
      if (val !== undefined && val !== null && String(val).trim() !== "") {
        chosen = val;
        break;
      }
    }
    return chosen ?? "";
  });
}

Deno.serve(async (req) => {
  try {
    const { campaign_id, lead_id, subject_template, html_template, step_no, variant_id } = await req.json();

    if (!campaign_id || !lead_id) return new Response("campaign_id and lead_id required", { status: 400 });

    let subj = subject_template ?? "";
    let html = html_template ?? "";
    let chosenVariantId: string | null = variant_id ?? null;

    if (step_no) {
      if (!chosenVariantId) {
        const { data: picked, error: pickErr } = await sb.rpc("pick_variant_for_lead", { 
          p_campaign: campaign_id, 
          p_step: step_no, 
          p_lead: lead_id 
        });
        if (pickErr) throw pickErr;
        chosenVariantId = (picked as any) ?? null;
      }
      if (chosenVariantId) {
        const { data: v, error: vErr } = await sb
          .from("campaign_step_variants")
          .select("subject_template, body_html_template")
          .eq("id", chosenVariantId)
          .maybeSingle();
        if (vErr) throw vErr;
        if (v) {
          subj = v.subject_template ?? subj;
          html = v.body_html_template ?? html;
        }
      }
    }

    const { data: bagRow, error: bagErr } = await sb.rpc("merge_vars_for_lead", { p_campaign: campaign_id, p_lead: lead_id });
    if (bagErr) throw bagErr;
    const bag: Bag = bagRow || {};

    const renderedSubject = renderString(subj, bag);
    const renderedHtml = renderString(html, bag);

    return new Response(JSON.stringify({ ok:true, subject: renderedSubject, html: renderedHtml, bag, variant_id: chosenVariantId }), {
      headers:{ "content-type":"application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status: 500, headers:{ "content-type":"application/json" } });
  }
});

