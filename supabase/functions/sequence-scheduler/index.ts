import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function esc(s: string){return s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");}
function render(tpl: string, vars: Record<string,any>, raw=false){
  return tpl.replace(/\{\{\{?\s*([\w\.]+)(?:\|([^}]+))?\s*\}?\}\}/g,(m,p,def)=>{
    const v=p.split(".").reduce<any>((a,k)=>a!=null?a[k]:undefined,vars);
    const val=(v===undefined||v===null||String(v)==="")?(def??""):String(v);
    return raw?val:esc(val);
  });
}
function renderBoth(subjTpl: string, htmlTpl: string, vars: Record<string,any>){
  return { subject: render(subjTpl, vars), html: render(htmlTpl, vars) };
}

function passesRule(rule: string, lastEvent?: string | null) {
  switch (rule) {
    case "always":     return true;
    case "if_no_open": return lastEvent !== "opened" && lastEvent !== "clicked";
    case "if_no_click":return lastEvent !== "clicked";
    case "if_open":    return lastEvent === "opened" || lastEvent === "clicked";
    case "if_click":   return lastEvent === "clicked";
    default: return true;
  }
}

function toTzDate(date: Date, tz: string) {
  // returns parts in target tz
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false,
    year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit" });
  const parts = Object.fromEntries(f.formatToParts(date).map(p=>[p.type,p.value]));
  const y = Number(parts.year), m = Number(parts.month), d = Number(parts.day),
        H = Number(parts.hour),  M = Number(parts.minute), S = Number(parts.second);
  return { y,m,d,H,M,S };
}

function fromTzParts({y,m,d,H,M,S}:{y:number,m:number,d:number,H:number,M:number,S:number}, tz:string){
  // construct a Date in that tz by parsing as if local then correcting offset via Date.parse trick
  const iso = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}T${String(H).padStart(2,"0")}:${String(M).padStart(2,"0")}:${String(S).padStart(2,"0")}`;
  // Interpret iso in tz by using the offset at that wall time:
  const offMin = -new Date(new Intl.DateTimeFormat("en-US",{ timeZone: tz, timeStyle:"long", dateStyle:"short" }).format(new Date(`${iso}Z`))).getTimezoneOffset?.() ?? 0;
  // Fallback: just return UTC parse if above is not supported
  return new Date(iso + "Z");
}

function nextWindowTimestamp(now: Date, tz: string, start: string, end: string): Date {
  const { y,m,d,H,M,S } = toTzDate(now, tz);
  const [sH,sM] = start.split(":").map(Number);
  const [eH,eM] = end.split(":").map(Number);
  const inMinutes = H*60+M;
  const sMin = sH*60+sM, eMin = eH*60+eM;

  if (inMinutes < sMin) {
    // today at start
    const dt = new Date(Date.UTC(y, m-1, d, sH, sM, 0));
    return dt; // treat as UTC timestamp; your queue sends relative to UTC anyway
  }
  if (inMinutes > eMin) {
    // tomorrow at start
    const dt = new Date(Date.UTC(y, m-1, d+1, sH, sM, 0));
    return dt;
  }
  // within window → now
  return now;
}

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const nowIso = new Date().toISOString();

  // 1) fetch due enrollments (cap per run)
  const { data: due } = await supabase
    .from("sequence_enrollments")
    .select("id,workspace_id,sequence_id,to_email,vars,current_position,status,next_scheduled_at")
    .eq("status","active")
    .lte("next_scheduled_at", nowIso)
    .order("next_scheduled_at", { ascending: true })
    .limit(200);

  if (!due?.length) return new Response(JSON.stringify({ ok:true, scheduled:0 }), { status: 200 });

  let scheduled = 0;

  for (const enr of due) {
    // 2) sequence active?
    const { data: seq } = await supabase.from("sequences").select("id,status,campaign_id").eq("id", enr.sequence_id).maybeSingle();
    if (!seq || seq.status !== "active") {
      await supabase.from("sequence_enrollments").update({ status: seq ? "paused" : "stopped" }).eq("id", enr.id);
      continue;
    }

    // 3) next step
    const nextPos = (enr.current_position || 0) + 1;
    const { data: step } = await supabase
      .from("sequence_steps")
      .select("id,position,template_id,subject_override,html_override,advance_rule,wait_seconds,window_start,window_end")
      .eq("sequence_id", enr.sequence_id).eq("position", nextPos).maybeSingle();

    if (!step) {
      // done
      await supabase.from("sequence_enrollments").update({ status: "completed", next_scheduled_at: null }).eq("id", enr.id);
      continue;
    }

    // 4) campaign status guard if attached
    if (seq.campaign_id) {
      const { data: camp } = await supabase.from("campaigns").select("status").eq("id", seq.campaign_id).maybeSingle();
      if (!camp || camp.status !== "active") {
        // push out a bit; scheduler will recheck later
        await supabase.from("sequence_enrollments").update({
          next_scheduled_at: new Date(Date.now() + 60_000).toISOString()
        }).eq("id", enr.id);
        continue;
      }
    }

    // 5) suppression guard
    const emailLc = String(enr.to_email).toLowerCase(); const domain = emailLc.split("@")[1];
    const [{ data: supE }, { data: supD }] = await Promise.all([
      supabase.from("suppressions").select("id").eq("workspace_id", enr.workspace_id).eq("type","email").eq("value", emailLc).maybeSingle(),
      supabase.from("suppressions").select("id").eq("workspace_id", enr.workspace_id).eq("type","domain").eq("value", domain).maybeSingle()
    ]);
    if (supE || supD) {
      await supabase.from("sequence_enrollments").update({ status:"stopped", last_event:"suppressed", next_scheduled_at:null }).eq("id", enr.id);
      continue;
    }

    // read last_event & evaluate rule against previous step (when nextPos > 1)
    const { data: cur } = await supabase
      .from("sequence_enrollments")
      .select("last_event,current_position")
      .eq("id", enr.id).single();

    if (nextPos > 1) {
      // fetch prior step to read its rule (position = nextPos-1)
      const { data: prior } = await supabase
        .from("sequence_steps")
        .select("advance_rule")
        .eq("sequence_id", enr.sequence_id)
        .eq("position", nextPos - 1)
        .single();

      if (prior && !passesRule(prior.advance_rule, cur?.last_event)) {
        // push next check until prior step's wait elapses (already set) — skip enqueue now
        await supabase.from("sequence_enrollments").update({
          next_scheduled_at: new Date(Date.now() + 60_000).toISOString()
        }).eq("id", enr.id);
        continue;
      }
    }

    // 6) fetch template (or overrides) with A/B variant support
    let subject = step.subject_override || "";
    let html = step.html_override || "";
    let variantId: string | null = null;

    // Try to pick a variant first
    const { data: vPick } = await supabase.rpc("pick_step_variant", { 
      p_step: step.id
    });
    
    if (vPick) {
      variantId = vPick as string;
      const { data: vRow } = await supabase
        .from("sequence_step_variants")
        .select("subject, body")
        .eq("id", variantId)
        .maybeSingle();
      
      if (vRow) {
        subject = vRow.subject || subject;
        html = vRow.body || html;
      }
    }

    // Fallback to template if no variant or variant missing content
    if (!subject || !html) {
      const { data: tpl } = await supabase.from("templates").select("subject_tpl,html_tpl").eq("id", step.template_id).maybeSingle();
      if (!tpl) { // skip step if template missing
        await supabase.from("sequence_enrollments").update({ current_position: nextPos, updated_at: nowIso }).eq("id", enr.id);
        continue;
      }
      const r = renderBoth(tpl.subject_tpl, tpl.html_tpl, enr.vars || {});
      subject = subject || r.subject; html = html || r.html;
    }

    // 7) calculate send time with timezone window
    let scheduledFor = new Date(Date.now() + 1000).toISOString(); // default: send shortly
    
    if (step.window_start && step.window_end) {
      // Get contact's timezone (default to UTC if not set)
      const contactTz = enr.vars?.timezone || "UTC";
      const scheduledAt = nextWindowTimestamp(new Date(), contactTz, step.window_start, step.window_end);
      scheduledFor = scheduledAt.toISOString();
    }

    // 8) enqueue email job
    const { error: insErr, data: inserted } = await supabase.from("email_jobs").insert({
      workspace_id: enr.workspace_id,
      to_email: enr.to_email,
      subject,
      body_html: html,
      status: "queued",
      scheduled_for: scheduledFor,
      max_attempts: 5,
      campaign_id: seq.campaign_id ?? null,
      template_id: step.template_id ?? null,
      render_vars: enr.vars ?? null,
      variant_id: variantId
    }).select("id").single();

    if (insErr) {
      // retry later
      await supabase.from("sequence_enrollments").update({
        next_scheduled_at: new Date(Date.now() + 60_000).toISOString()
      }).eq("id", enr.id);
      continue;
    }

    // Store back the job to the enrollment (so webhooks can match precisely)
    if (!insErr && inserted?.id) {
      await supabase.from("sequence_enrollments").update({ last_job_id: inserted.id }).eq("id", enr.id);
    }

    // 8) set state → awaiting signals for this step; schedule tentatively for next step time (will be validated by event handler)
    const nextAt = new Date(Date.now() + (step.wait_seconds ?? 0) * 1000).toISOString();
    await supabase.from("sequence_enrollments").update({
      current_position: nextPos,
      last_job_id: inserted?.id ?? null,
      next_scheduled_at: step.wait_seconds > 0 ? nextAt : new Date().toISOString(),
      updated_at: nowIso
    }).eq("id", enr.id);

    scheduled++;
  }

  return new Response(JSON.stringify({ ok:true, scheduled, picked: due.length }), { status: 200 });
});