// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SEND_FROM = Deno.env.get("SEND_FROM") ?? "no-reply@yourapp.com";

function htmlRow(r: any) {
  return `<tr>
    <td style="padding:6px 8px;border-bottom:1px solid #eee;">${r.campaign_name}</td>
    <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${r.sends}</td>
    <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${r.replies}</td>
    <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${(r.reply_rate ?? 0).toFixed(2)}%</td>
    <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${r.send_delta > 0 ? "+" : ""}${r.send_delta ?? 0}</td>
    <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${r.reply_delta > 0 ? "+" : ""}${r.reply_delta ?? 0}</td>
  </tr>`;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? "7");
  const secret = url.searchParams.get("secret");

  if (secret !== Deno.env.get("CRON_SECRET")) {
    return new Response("forbidden", { status: 403 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: users, error: userError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (userError) {
    return new Response(userError.message, { status: 500 });
  }

  for (const u of users.users) {
    const to = u.email;
    if (!to) continue;

    const [{ data: kpis }, { data: rows }] = await Promise.all([
      supabase.rpc("get_overview_kpis", { p_days: days }),
      supabase.rpc("get_overview_campaigns_page", {
        p_days: days,
        p_sort: "reply_rate",
        p_dir: "asc",
        p_limit: 1000,
        p_offset: 0,
      }),
    ]);

    const k = Array.isArray(kpis) && kpis[0]
      ? kpis[0]
      : { sends: 0, replies: 0, reply_rate: 0, send_delta: 0, reply_delta: 0 };

    const table = (rows ?? []).map((r: any) => htmlRow(r)).join("");
    const html = `
      <div style="font-family:Inter,system-ui,Segoe UI,Arial,sans-serif; max-width:720px; margin:0 auto;">
        <h2>Weekly KPI Digest (${days}d)</h2>
        <p><b>Sends:</b> ${k.sends} (${k.send_delta > 0 ? "+" : ""}${k.send_delta}) ·
           <b>Replies:</b> ${k.replies} (${k.reply_delta > 0 ? "+" : ""}${k.reply_delta}) ·
           <b>Reply Rate:</b> ${(k.reply_rate ?? 0).toFixed(2)}%</p>
        <table style="width:100%; border-collapse:collapse; margin-top:8px;">
          <thead>
            <tr>
              <th style="text-align:left; padding:6px 8px; border-bottom:1px solid #ddd;">Campaign</th>
              <th style="text-align:right; padding:6px 8px; border-bottom:1px solid #ddd;">Sends</th>
              <th style="text-align:right; padding:6px 8px; border-bottom:1px solid #ddd;">Replies</th>
              <th style="text-align:right; padding:6px 8px; border-bottom:1px solid #ddd;">Reply Rate</th>
              <th style="text-align:right; padding:6px 8px; border-bottom:1px solid #ddd;">Δ Sends</th>
              <th style="text-align:right; padding:6px 8px; border-bottom:1px solid #ddd;">Δ Replies</th>
            </tr>
          </thead>
          <tbody>${table || `<tr><td colspan="6" style="padding:8px;">No campaign activity yet.</td></tr>`}</tbody>
        </table>
      </div>`;

    const record = {
      user_id: u.id,
      to_email: to,
      subject: "SmartSend — Weekly KPI Digest",
      html,
    };

    if (RESEND_API_KEY) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: SEND_FROM,
          to,
          subject: record.subject,
          html,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        await supabase.from("email_jobs").insert({
          ...record,
          status: "error",
          error: err,
        });
      } else {
        await supabase.from("email_jobs").insert({
          ...record,
          status: "sent",
        });
      }
    } else {
      await supabase.from("email_jobs").insert({
        ...record,
        status: "queued",
      });
    }
  }

  return new Response("ok");
});

