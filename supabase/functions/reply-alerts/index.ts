import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

type AlertRow = {
  account_id: string;
  last_label?: string | null;
  lead_email: string | null;
  campaign_name?: string | null;
  link: string;
  kind: string;
};

Deno.serve(async () => {
  const sinceHot = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const sinceBreaches = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data: hot, error: hotErr } = await sb.rpc("list_hot_threads_since", {
    p_since: sinceHot,
  });

  if (hotErr) {
    console.error("list_hot_threads_since failed", hotErr);
  }

  const { data: breaches, error: breachErr } = await sb.rpc("list_new_sla_breaches", {
    p_since: sinceBreaches,
  });

  if (breachErr) {
    console.error("list_new_sla_breaches failed", breachErr);
  }

  const records: AlertRow[] = [
    ...((hot as AlertRow[]) ?? []),
    ...((breaches as AlertRow[]) ?? []),
  ];

  const byAccount = new Map<string, AlertRow[]>();
  for (const row of records) {
    const key = row.account_id;
    const bucket = byAccount.get(key) ?? [];
    bucket.push(row);
    byAccount.set(key, bucket);
  }

  for (const [account_id, items] of byAccount.entries()) {
    const { data: channels, error: channelErr } = await sb
      .from("alert_channels")
      .select("*")
      .eq("account_id", account_id)
      .eq("is_active", true);

    if (channelErr) {
      console.error("Failed to load channels", account_id, channelErr);
      continue;
    }

    if (!channels?.length) {
      continue;
    }

    for (const channel of channels) {
      if (channel.kind === "slack_webhook") {
        try {
          await fetch(channel.target, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(slackPayload(items)),
          });
        } catch (error) {
          console.error("Slack webhook failed", channel.target, error);
        }
      } else if (channel.kind === "email") {
        // TODO: integrate email alerts
      }
    }
  }

  return new Response(
    JSON.stringify({ alerted_accounts: byAccount.size }),
    { headers: { "content-type": "application/json" } }
  );
});

function slackPayload(items: AlertRow[]) {
  const blocks = items.slice(0, 10).map((item) => ({
    type: "section",
    text: {
      type: "mrkdwn",
      text:
        item.kind === "hot"
          ? `*New ${item.last_label} reply* — <${item.link}|open thread>\n*Lead:* ${item.lead_email ?? "Unknown"} • *Campaign:* ${item.campaign_name ?? "—"}`
          : `*:rotating_light: SLA Breach* — <${item.link}|thread> overdue for first response\n*Lead:* ${item.lead_email ?? "Unknown"}`,
    },
  }));

  return {
    text: "SmartSend Alerts",
    blocks,
  };
}

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async () => {
  const sinceHot = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const sinceBreach = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data: hot, error: hotError } = await supabase.rpc("list_hot_threads_since", {
    p_since: sinceHot,
  });

  if (hotError) {
    console.error("list_hot_threads_since error", hotError);
  }

  const { data: breaches, error: breachError } = await supabase.rpc("list_new_sla_breaches", {
    p_since: sinceBreach,
  });

  if (breachError) {
    console.error("list_new_sla_breaches error", breachError);
  }

  const grouped = new Map<string, any[]>();
  for (const entry of [...(hot ?? []), ...(breaches ?? [])]) {
    const list = grouped.get(entry.account_id) ?? [];
    list.push(entry);
    grouped.set(entry.account_id, list);
  }

  for (const [accountId, items] of grouped) {
    const { data: channels, error } = await supabase
      .from("alert_channels")
      .select("*")
      .eq("account_id", accountId)
      .eq("is_active", true);

    if (error) {
      console.error("alert_channels load failed", { accountId, error });
      continue;
    }

    if (!channels?.length) continue;

    for (const channel of channels) {
      if (channel.kind === "slack_webhook") {
        try {
          await fetch(channel.target, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(slackPayload(items)),
          });
        } catch (err) {
          console.error("Slack webhook send failed", { accountId, channelId: channel.id, err });
        }
      } else if (channel.kind === "email") {
        // TODO: integrate email alert sender
        // placeholder for future integration
      }
    }
  }

  return new Response(
    JSON.stringify({ alerted_accounts: grouped.size }),
    { headers: { "content-type": "application/json" } }
  );
});

function slackPayload(items: any[]) {
  const blocks = items.slice(0, 10).map((item) => {
    const text =
      item.kind === "hot"
        ? `*New ${item.last_label} reply* — <${item.link}|open thread>\n*Lead:* ${item.lead_email} • *Campaign:* ${
            item.campaign_name ?? "—"
          }`
        : `*:rotating_light: SLA Breach* — <${item.link}|thread> overdue for first response\n*Lead:* ${item.lead_email}`;

    return {
      type: "section",
      text: { type: "mrkdwn", text },
    };
  });

  return {
    text: "SmartSend Alerts",
    blocks,
  };
}

