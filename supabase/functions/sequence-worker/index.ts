// Deno runtime
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE")!;
const CRON_SECRET = Deno.env.get("SMARTSEND_CRON_SECRET")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "no-reply@smartsend.ai";

// ---- tiny helpers ----
async function sb(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
    },
  });
}

function escapeHtml(s: any) {
  const str = String(s ?? "");
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function lookup(obj: Record<string, any>, path: string) {
  if (!path) return "";
  return path.split(".").reduce((acc, k) => (acc && acc[k] != null ? acc[k] : undefined), obj);
}

function render(tpl: string, data: Record<string, any>) {
  if (!tpl) return "";
  let out = tpl.replace(/\{\{\{([^}]+)\}\}\}/g, (_: any, expr: string) => {
    const [key, def] = String(expr).split("|").map(s => s.trim());
    const val = lookup(data, key);
    return val == null || val === "" ? (def ?? "") : String(val);
  });
  out = out.replace(/\{\{([^}]+)\}\}/g, (_: any, expr: string) => {
    const [key, def] = String(expr).split("|").map(s => s.trim());
    const val = lookup(data, key);
    const v = val == null || val === "" ? (def ?? "") : String(val);
    return escapeHtml(v);
  });
  return out;
}

async function sendResend(to: string, subject: string, html: string, headers?: Record<string,string>) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      headers: headers || {}   // <— add this
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || "Resend error");
  return data; // { id: "..." }
}

type Job = {
  id: string;
  sequence_id: string;
  step_id: string;
  contact_email: string;
  run_at: string;
  retry_count: number;
};

Deno.serve(async (req) => {
  if ((req.headers.get("authorization") || "") !== `Bearer ${CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // 1) Get up to 50 due jobs
    const q1 = await sb(
      `/rest/v1/sequence_jobs?status=eq.queued&run_at=lte.${encodeURIComponent(
        new Date().toISOString()
      )}&limit=50&select=*`
    );
    const jobs: Job[] = await q1.json();

    for (const job of jobs) {
      try {
        // 2) Fetch step + contact
        const stepRes = await sb(
          `/rest/v1/sequence_steps?id=eq.${job.step_id}&select=template_subject,template_body`
        );
        const [step] = await stepRes.json();

        const contactRes = await sb(
          `/rest/v1/contacts?email=eq.${encodeURIComponent(job.contact_email)}&select=email,name,first_name,last_name,company,title,meta`
        );
        const [contact] = await contactRes.json();

        // 3) Build render context
        const ctx = {
          email: job.contact_email,
          name: contact?.name || [contact?.first_name, contact?.last_name].filter(Boolean).join(" "),
          first_name: contact?.first_name,
          last_name: contact?.last_name,
          company: contact?.company,
          title: contact?.title,
          meta: contact?.meta || {},
        };

        // 4) Render subject/body
        const subject = render(step?.template_subject || "", ctx);
        const html = `<div style="font-family:ui-sans-serif,system-ui">${render(step?.template_body || "", ctx)}</div>`;

        // 5) Send (Resend)
        const result = await sendResend(
          job.contact_email,
          subject,
          html,
          { "X-SmartSend-Job": job.id }  // <— correlation header
        );

        // 4) Mark sent
        await sb(`/rest/v1/sequence_jobs?id=eq.${job.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "sent",
            sent_at: new Date().toISOString(),
            last_error: null,
            provider: "resend",
            provider_message_id: result?.id || null,
          }),
        });
      } catch (e) {
        // retry backoff: 1m, 5m, 15m then fail
        const tries = (job.retry_count || 0) + 1;
        const backoffs = [60, 300, 900]; // seconds
        const next = tries <= backoffs.length ? backoffs[tries - 1] : null;

        if (next) {
          const nextRun = new Date(Date.now() + next * 1000).toISOString();
          await sb(`/rest/v1/sequence_jobs?id=eq.${job.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              retry_count: tries,
              run_at: nextRun,
              last_error: String(e),
            }),
          });
        } else {
          await sb(`/rest/v1/sequence_jobs?id=eq.${job.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              status: "failed",
              last_error: String(e),
            }),
          });
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: jobs.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});